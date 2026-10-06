# Mariam Ibrahim Khaled and Rayen latency audit

Date: 5 October 2026

All four assistants use the same tutor backend. Ibrahim, Khaled and Rayen inherit the same repeated moderation, duplicate remote evidence review, schema retries and library recheck problem as Mariam. Mariam additionally sends course and page context. Improve the shared pipeline once, then adjust the amount of evidence and explanation for each assistant.

The recommended behavior is **classify, retrieve, answer, verify once, then display or withhold**. A rejected or uncertain verification must return a safe fallback without regenerating the answer. The baseline analysis below records the implementation before the changes listed here. Nothing has been deployed; elapsed-time savings require live measurements.

## Implemented improvements

Three parallel implementation sessions and a second pass completed the following local changes:

- **Mariam:** exact English/Arabic page shortcuts and explicit page practice now send the current page and compact navigation titles. They omit other-page prose, module and completed-course data, avoiding the associated metadata reads. Retrieval boosts current-page sources rather than every source in the course, while broader approved-source search remains available. Arbitrary and cross-course questions retain broader context. Local and remote practice default to two questions.
- **Ibrahim, Khaled and Rayen, plus Mariam:** successful exact moderation is reused only within the same operation, gateway/provider, guardrail version and INPUT/OUTPUT direction. This removes one moderation round trip for a usual tutor request (the repeated outer request/classifier input assessment). Failed or incomplete assessments are never cached, and an expired operation cannot use a cache hit.
- **Shared remote library evidence:** IDs now bind resource, document, URI and exact original passage text, rather than response rank. Duplicate exact passages collapse into one evidence entry. Rechecking unchanged evidence after a `P2` to `P1` change now passes; changed or withdrawn evidence still stops the response without regeneration.
- **Mariam page retrieval:** recognized current-page shortcuts and practice load complete approved page citations directly, skipping one embedding call and global source search when every citation is usable. Missing, malformed, pending, empty or oversized citation sets fall back to normal retrieval. Arbitrary questions retain broad search; final evidence rechecks remain.
- **One remote independent evidence judge:** the remote service returns its full verdict in version 1 of `supportReview`. The API checks the policy, a fresh request nonce/hash, exact original record and policy-filtered evidence hashes, every candidate unit and verbatim supporting excerpt before reusing it. Answer, follow-ups and bilingual practice are covered. A present invalid or unknown verdict fails closed; an older service without the envelope retains the API judge for rolling deployment.
- **Whole tutor call limit:** default four LLM calls across API and remote work, with embeddings separately counted. A normal compatible remote answer now uses three LLM calls, as does a normal local answer. The fourth slot allows one schema retry across the local stages. Two remote calls are conservatively reserved before dispatch, including bounded evidence/output allowances; they remain charged after an ambiguous outage. Course/review cumulative call accounting is preserved.
- **Deadline and diagnostics:** local model timeouts use the smaller of 60 seconds and the remaining operation time. Embedding awaits are bounded by the remaining time and existing ten-second transport allowance. Structured stage logs include a correlation ID, duration and outcome; final operation logs distinguish deadline, call and token exhaustion. Deployment forwards `TUTOR_SECONDS`, `TUTOR_MODEL_CALLS` and `COURSE_SECONDS`.
- **Bounded optional library context:** the remote service selects whole eligible passage views within 16 KiB, without truncating original evidence. This bounds the reserved library allowance; it can omit lower-ranked passages, so bilingual quality evaluation remains necessary.

Classification, an independent evidence judge, current-source rechecks and safe failure behavior remain. Successful current-protocol requests use three LLM calls locally or remotely; older remote services still use four. Verification rejection does not regenerate an answer. A writer assertion never replaces independent review. A four-call ceiling can cause an old remote response or remote outage fallback to fail safely when earlier retries consumed its remaining slots.

**Rollout order:** deploy YAQIN API first, then `faithminds-agents`. The API accepts stable and legacy library identities during rollout. Old remote deployments retain the rank-change problem until upgraded. Do not deploy the new remote identity against an old API that validates only positional identities.

The second-pass integrated YAQIN suite passed **766 tests** with nine optional integration tests skipped. The remote suite passed **109 tests**, with 28 optional integration cases skipped. Frontend TypeScript, targeted ESLint, course checks and saved-job continuation/refresh checks passed. Seven PostgreSQL transaction cases were previously verified against disposable local certificate-verified TLS storage as part of Hassan work. These establish control flow and validation, not live response time or bilingual model quality.

Hassan's separate work, execution limits, recovery behavior and deployment questions are recorded in [the Hassan report](HASSAN_GENERATION_AUDIT.md).

## How the assistants share the implementation

| Assistant | Selection | Context sent by the current interface | What differs in the backend |
| --- | --- | --- | --- |
| Mariam | Course companion | Question, course ID, page ID when reading, selected journey, recent history, optional practice request | Course context and optional practice generation |
| Ibrahim | `deepen` journey | Question, journey, recent history | Audience and persona instructions |
| Khaled | `first-steps` journey | Question, journey, recent history | Audience and persona instructions |
| Rayen | `explore` journey | Question, journey, recent history | Audience and persona instructions |

The product spells Ryan as **Rayen**. The three journey guides call the same frontend `ask()` function as Mariam, and all reach `TutorAgent.ask()` through `/api/tutor/ask`. Their usual chat requests have no course or page ID, so they do not load Mariam's course context. Any caller supplying a course ID uses the course-context path regardless of journey.

Implementation: [persona selection](../web/src/lib/personas.ts), [journey chat requests](../web/src/features/ask/Ask.tsx), [Mariam requests](../web/src/features/learning/SidePanel.tsx), [shared request client](../web/src/features/ask/api.ts), [controller](../api/app/controllers/tutor_controller.py), [tutor pipeline](../api/app/agents/tutor/agent.py).

## Audit baseline before these fixes: calls and limits

These counts describe a successful cited answer, with valid structured output on the first attempt. Early refusals, missing evidence, failures and legacy-service fallbacks take different paths.

| Assistant | Local LLM calls | Local moderation calls | Remote LLM calls across both services | Remote moderation calls across both services |
| --- | --- | --- | --- | --- |
| Mariam | 3 | 9 | 4 | 11 without library passages; 12 with passages |
| Ibrahim | 3 | 8 | 4 | 10 without library passages; 11 with passages |
| Khaled | 3 | 8 | 4 | 10 without library passages; 11 with passages |
| Rayen | 3 | 8 | 4 | 10 without library passages; 11 with passages |

Each normal retrieval also makes one embedding call when embeddings are configured. That is separate from the LLM counts above. Remote library retrieval makes one request and another if the generated answer or practice cites library evidence. The remote evidence judge is followed by another judge in the API.

| Original limit | Baseline implementation |
| --- | --- |
| API operation deadline | 55 seconds by default, covering the tutor method; authentication and admission happen before it |
| API model-call budget | 8 by default; includes embedding reservations, excludes remote model calls |
| Local structured attempts | At most 2 per structured response, with a second attempt only after schema validation failure |
| Provider transport retries | Disabled for the relevant model calls |
| Remote Ask budget | At most 2 LLM calls and 25 seconds; handler deducts authentication and quota time from the available Ask budget |
| Remote HTTP client | 28-second HTTP timeout with a 3-second connect timeout; the enclosing tutor deadline still applies |
| Course navigation context | At most 24,000 encoded bytes |
| Model history | Last 6 messages, not 6 complete question-and-answer exchanges |
| Ordinary answer output ceiling | 6,000 tokens locally; 2,000 remotely |
| Evidence-review output ceiling | 8,000 tokens per judge |

There is no open-ended LLM planning loop in these tutor paths. Source iteration and retrieval pagination are data processing, not repeated answer generation. Lowering a ceiling alone does not reduce the work on a successful request. A large output ceiling also does not mean the model always produces that many tokens.

Implementation: [settings](../api/app/configuration/settings.py), [API operation budget](../api/app/domain/operations.py), [structured response retries](../api/app/gateways/bedrock/llm_gateway.py), [remote Ask](../../faithminds-agents/src/faithminds_agents/ask.py), [remote handler](../../faithminds-agents/src/faithminds_agents/api.py), [HTTP gateway](../api/app/gateways/http_agent_gateway.py).

## Shared improvements for all four assistants

### Measure stages and distinguish failures

Implemented API timings for classification, retrieval, model calls, remote requests, verdict validation, generation, verification and source rechecks, with one operation ID. Deadline/call/token exhaustion is labeled separately. Next, correlate the remote service's internal stages and distinguish displayed answers from safe fallbacks: API operation status can still be `completed` when no explained answer was delivered. Remote reservations are conservative bounds, not actual provider usage. Record source count and input bytes if deployed timings identify excessive evidence processing.

Start with the existing logs; no new observability dependency is necessary for this change. Compare median and 95th-percentile response time by journey, language and local/remote runtime. Keep payloads and private learner text out of logs. The existing Langfuse script is a manual proof of concept, not instrumentation of these live tutor calls.

### Select less evidence before generation

Sources already load in one database query, and each judge already reviews sources together in one LLM request. Adding a per-source LLM review would increase calls. The useful change is to reduce irrelevant evidence before generation and enforce both a source-count budget and a total evidence-size budget.

For ordinary journey-guide questions, start by evaluating 4 strong canonical sources instead of the current 8 retrieval hits, with only useful library passages added. Treat this as a starting configuration to test, not a universal hard rule. Preserve complementary evidence for comparisons, disagreements and qualifications. Select complete relevant evidence; do not silently truncate original text or cut away exceptions. If evidence is insufficient, clarify or abstain rather than inventing support.

Implementation: [retrieval](../api/app/services/retrieval_service.py), [batched API source loading](../api/app/repositories/postgres_repository.py), [batched remote source loading](../../faithminds-agents/src/faithminds_agents/source_store.py).

### Consolidate the two remote evidence judges

Implemented with the versioned bound verdict described above. The following describes the preserved review boundary and the reasoning for this change.

Keep one independent evidence judge where the complete original evidence is available. On the remote path, return its structured verdict through a versioned response contract, then validate the exact candidate units, evidence excerpts, source identities and current canonical records in the API. Include the answer, follow-up questions and every displayed practice field in the verdict.

Only remove the API's second LLM judge once those checks are preserved. The current `safetyOutcome=allowed` field proves neither source support nor the meaning of a claim. A writer's own claim flag must not replace independent verification. Keep the local judge when the answer is generated locally. This removes one LLM call from a normal remote answer, taking the total from 4 to 3.

Implementation: [API verification](../api/app/agents/tutor/agent.py), [API support validator](../api/app/domain/support.py), [remote verification](../../faithminds-agents/src/faithminds_agents/ask.py), [remote response validation](../api/app/gateways/http_agent_gateway.py).

### Remove duplicate moderation of unchanged text

The outer request assessment and classifier input assessment use the same request data. Course context, generated answers and evidence-review results also pass through overlapping assessments. First remove exact duplicates within a request, using the same decoded text, policy version and INPUT/OUTPUT direction. Combining assessments is appropriate only when the full combined payload fits provider limits and retains equivalent policy behavior.

Preserve coverage of newly loaded evidence, newly generated fields and the final displayed response. Input and output assessments are not interchangeable. Do not add a global moderation cache or accept an incomplete assessment. A previously rejected assessment must never become a retry signal.

Implementation: [tutor boundaries](../api/app/agents/tutor/agent.py), [structured response boundaries](../api/app/gateways/bedrock/llm_gateway.py), [API moderation](../api/app/gateways/bedrock/safety.py), [remote moderation](../../faithminds-agents/src/faithminds_agents/safety.py).

### Fix library evidence identity

The library source ID is derived from resource ID, document ID and the retrieval label `P1`, `P2`, and so on. RAG assigns those labels according to position in each response. Scoped re-retrieval or a change of rank can therefore change the ID of unchanged evidence. A reproduction confirmed that moving an identical passage from `P2` to `P1` rejects the answer.

Use a stable chunk identity if the retrieval provider supplies one, or derive identity from resource, document, URI and exact original passage text. Compare complete original evidence and current eligibility after retrieval; never ignore text changes just because an ID matches. Ranked top-k retrieval can still omit an eligible passage, so a future exact evidence lookup is preferable if false rejections remain common. Fixing identity does not require removing the recheck.

Implementation: [library identity and recheck](../../faithminds-agents/src/faithminds_agents/ask.py), [position-based RAG labels](../../faithminds-rag-pipeline/src/faithminds_rag/retrieval.py), [RAG identity contract](../../faithminds-agents/docs/RAG_CONTRACT.md).

### Recheck the evidence actually relied upon

The API and remote service currently recheck all supplied canonical sources, including unused retrieval candidates. That can reject an otherwise supported answer when an unrelated source changes. After preserving the judge verdict, recheck the union of displayed citations and every source mapped by that verdict, including evidence used for follow-ups and practice. Keep rechecks batched. Checking only visible citation markers would miss supporting evidence used elsewhere in the response.

### Reduce model and output work without weakening verification

The local classifier, writer and judge share the configured model, whose default is Opus 5.5. The remote writer and judge default to Sonnet 4.6. Evaluate a lighter compatible model for classification first, while preserving routing quality for personal cases and sensitive questions. Do not change the shared global model blindly, since course authoring and scholarly review use the same gateway.

For normal tutor prose, evaluate a 1,500–2,000-token output ceiling instead of 6,000 locally, and keep a separate larger ceiling for bilingual practice. Account for any model thinking tokens before choosing the ceiling. Ask for shorter sufficient evidence excerpts in the judge's output while preserving exact unit coverage and complete qualifications. A truncated or malformed response remains a failure, not displayable content. [Anthropic latency guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency) supports reducing prompt and generated output length, with quality checks.

### Keep a fixed workflow and align time budgets

Target 3 LLM calls for a successful answer: classify, answer and independently verify. Keep the user's chosen behavior: **verification failure stops the request; no correction or full-pipeline loop**. Initially retain the bounded schema retry if it contributes to successful answers; use measurements to decide whether tutor-only schema retries should be disabled. A schema retry is distinct from regenerating a rejected answer.

Implemented remote call reservations and separate tutor embedding accounting; `TUTOR_MODEL_CALLS` now defaults to four. The local SDK timeout is bounded by remaining operation time. The outer tutor deadline still defaults to 55 seconds. Explicit stage time allocation and propagation of the remaining deadline into the remote service remain future work if measurements show work regularly starts too late to finish verification; current HTTP calls remain bounded by the parent operation.

The remote model calls currently use a socket read timeout of half the remaining time. This can reject a slow call before the overall budget expires; measure stage timings before redistributing that allowance. Increasing the overall remote budget is not the first fix: [AWS HTTP API integration timeouts are capped at 30 seconds](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html).

### Improve failure messages and optional remote work

Return distinct fixed outcomes for missing evidence, verification rejection, safety rejection, budget exhaustion and temporary provider outage. Show an appropriate short learner message. Do not tell a learner to rephrase when the verifier or infrastructure is unavailable. Neither frontend currently performs automatic request retries; preserve user-controlled retry and the existing request cancellation on unmount.

Avoid fetching optional library evidence when a known page action can be fully answered from that page's approved sources. Retain library retrieval for questions needing broader evidence. Where genuinely independent retrieval or metadata reads remain, run them concurrently within the same deadline after authorization and required input assessment. Do not parallelize verification with generation: verification needs the completed candidate.

Reuse warm remote SDK clients where credentials and per-call timeout behavior can be preserved, and evaluate supported prompt caching for repeated static policy/schema prefixes only after the larger duplication is fixed. These are secondary improvements; do not cache final religious answers or authorization decisions globally. Do not stream unverified answer text to the learner merely to improve perceived speed.

## Improvements for Mariam

Mariam should receive the largest context reduction. The current learning context can contain full prose from other pages, module course summaries and completed-course summaries, even for a question about one word on the current page. Retrieval also boosts every source cited anywhere in the course, so `retrieval_k=8` is not a total source limit.

1. For page explanations, key points and word definitions, send the current page, course title, selected audience, recent history and a compact outline. Include other page prose or prior learning only when the question needs those connections.
2. Prioritize the current page's approved sources instead of automatically adding the whole course's evidence. For a known page action, load those sources directly and avoid a global embedding/search call when it adds no necessary evidence. Keep classification, moderation and verification.
3. Preserve broader retrieval for arbitrary questions and connections across the course. A question asked inside a course is not automatically limited to its current page.
4. Generate 2 practice questions initially, which the current schema already supports, instead of defaulting to 3. Keep both languages and the independent checks for every option, correct answer, hint and explanation. Keep the existing client-side hint/reveal behavior, which makes no extra LLM call.
5. Bound the recent practice-question avoidance input by actual prompt size. It can currently hold 1,000 strings of up to 800 characters, although the full remote payload must fit 128 KiB. Keep older course questions excluded as appropriate, and document that trimming session history may permit repetitions in very long sessions.
6. Ensure the configured remote deployment supports learning-context and practice versions. The current API can discard an older service's successful response and generate locally afterward. Update that deployment contract rather than repeatedly paying for an answer that cannot serve the current page.

Items 1–4 are implemented. Practice avoidance trimming (item 5) is deferred because trimming it can allow repeated questions; deployment compatibility (item 6) still needs rollout verification. The course and page remain server-owned, omitted context retains its coverage markers, and course prose never becomes authoritative source evidence.

## Improvements for Ibrahim

Ibrahim uses the shared pipeline with `track=deepen`; he has no separate planning loop or verifier. Apply every shared improvement above, but do not apply Mariam's course-context trimming to his usual standalone chat, which has no course context.

Use fewer relevant sources for straightforward explanations, with room for additional complementary evidence on disagreements or complex distinctions. Keep the direct, advanced audience instructions and avoid repeating beginner introductions. Preserve qualifications and personal-ruling restrictions when optimizing output length. Evaluate complex Arabic and English questions before reducing judge effort or evidence coverage. A request for a basic explanation should still override the assumed advanced audience.

## Improvements for Khaled

Khaled uses the same pipeline with `track=first-steps`. Apply every shared improvement above. His usual chat also has no course-context overhead.

Keep answers to manageable practical steps with a few necessary sources and brief first-use vocabulary explanations. This is a good place to evaluate a smaller ordinary-answer output budget. Keep personal-case classification for questions about the learner's own worship or circumstances; a beginner question is not permission to skip that check. Do not add an extra LLM call for definitions, encouragement or persona styling: the current writer can provide those in the same verified answer.

## Improvements for Rayen

Rayen uses the same pipeline with `track=explore`. Apply every shared improvement above. His usual chat also has no course-context overhead.

Keep concise explanations that introduce unfamiliar Islamic concepts without assuming the learner accepts scripture as authority. Use a small evidence pool for introductory questions, but allow sufficient distinct evidence for religious comparisons. Do not force a single-source answer when it cannot support both sides of a comparison. Preserve respectful descriptions and clearly state source limitations. Do not add separate comparison, translation or persona-polishing model passes.

## Implementation order and expected savings

| Order | Change | Assistants affected | Expected effect |
| --- | --- | --- | --- |
| 1 | Add stage timings and fixed failure outcomes | All four | Identifies the expensive stage and separates slow calls from rejected answers |
| 2 | Fix unstable library identity | All four when library evidence is cited | Prevents confirmed false rejections after expensive generation and verification |
| 3 | Reduce evidence size and relevant context | All four; largest context opportunity for Mariam | Less repeated input processing and lower conservative budget pressure |
| 4 | Remove exact duplicate moderation within a request | All four | Removes redundant moderation round trips |
| 5 | Return and validate the remote evidence verdict, then remove the second LLM judge | All four on the remote path | Removes one LLM call per normal remote response |
| 6 | Tune tutor-only model choice, answer length, practice size and retry budgets | All four, with practice changes for Mariam | Potential further gains after bilingual quality checks |
| 7 | Optimize remaining independent I/O and supported prompt caching | All four where measured | Smaller additional gains; unnecessary until those stages are significant |

Removing the duplicate judge saves that judge's measured call duration and the assessments required only for that removed invocation, less any new contract-validation overhead. For illustration, if that work takes 5 seconds, a 30-second response could become approximately 25 seconds before other improvements. This is not a measured gain. Do not promise a percentage until median and 95th-percentile timings are compared on the deployed path.

Retain source authority, exact citations and evidence excerpts, scripture handling, current-source eligibility, audience instructions, input validation, personal-ruling restrictions, final moderation and safe failure behavior. No new agent framework, unrestricted regeneration loop or batch-job system is needed.

## Second-pass result and remaining work

| Group | Additional implemented gain | Intentionally left for measurement |
| --- | --- | --- |
| Mariam | Skip embedding and global search for complete approved current-page evidence; three normal remote LLM calls; default four-call whole-request ceiling | Optional library retrieval still runs remotely; practice history stays complete to preserve duplicate exclusions |
| Ibrahim, Khaled and Rayen | One remote independent judge, validated in the API; bounded library context; deadline-aware HTTP/model calls and structured stage timings | Smaller canonical source sets, cheaper classifier model and shorter answer ceilings require bilingual quality checks |
| Hassan | Interrupted writers consume attempts before inference; complete bounded repair JSON; pending-job URL recovery and bounded transient status polling | Concurrency of independent source/editorial reviews and longer generation-specific provider timeout require actual stage timings |

Deploy API before remote agents, then compare representative English/Arabic response latency and verification outcomes. Old remote envelopes still take the legacy fourth LLM call. Explicit deployed `TUTOR_MODEL_CALLS` overrides can differ from the new default of four; verify deployment renders the intended value. Source-ID rollout compatibility, request nonce/hash binding, exact evidence snapshots and invalid-envelope failures have runnable regressions.

The offline reduction from four to three normal remote LLM calls is 25% fewer LLM calls, **not a measured 25% latency improvement**. Hosted savings equal the removed judge's actual duration and redundant assessments, less validation overhead. No deployment or paid provider benchmark was performed.

## Initial audit verification evidence

The focused offline run passed **197 YAQIN tests** covering audience propagation, tutor and remote paths, course context, practice, source support, operation budgets and runtime safety, plus **29 FaithMinds tests** covering audiences, Ask, runtime safety and operation budgets: **226 existing tests in total**.

Additional assertions exercised local and mocked remote-boundary requests for each of the four personas. They confirmed 3 local LLM stages for every assistant, 9 local moderation calls for Mariam and 8 for each journey guide; the remote API boundary used 2 local LLM stages and 7/6 local moderation calls respectively. Independent mocked remote-service runs for all 3 journeys confirmed 2 remote LLM calls, 5 remote moderation calls and 2 library requests when library evidence is cited. A separate reproduction confirmed the unchanged-passage `P2` to `P1` rejection.

These checks establish control flow and boundary enforcement, not real model quality or hosted latency. Before implementing model or evidence-budget reductions, compare representative English and Arabic questions for every persona, including missing evidence, personal cases, scholarly disagreement, library citations and outages. Live deployment configuration and stage timings were not inspected in this audit.
