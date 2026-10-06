# Runtime moderation

Implemented locally on 5 October 2026. This is runnable application plumbing; no deployment, policy publication or live inference was performed.

AI operations call `ApplyGuardrail` separately for untrusted input and decoded output. Trusted system instructions, schemas and task scaffolding are excluded from explicit input assessment; input text uses the supported `guard_content` qualifier. All nested string values are assessed, including English/Arabic tutor answers and follow-ups, explain-back feedback/corrections, generated course cards/quiz options/explanations, and automated review notes. Final tutor responses include rendered source text and deterministic fallback content. AI review caches cannot bypass moderation.

As of 6 October 2026, manual course saves, submission, approval and live updates do not call external safety checks or reserve AI quota. These operations retain permission, schema/classification, citation-existence and conditional source-snapshot checks. Manual publication relies on the admin's review.

This is necessary because [Converse does not assess generated tool arguments](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-converse-api.html). [ApplyGuardrail](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html) supports independent input/output assessment. The installed boto3 service model supports [text qualifiers](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_GuardrailTextBlock.html); [prompt attack detection](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-prompt-attack.html) needs untrusted content distinguished from application instructions.

Only `action=NONE` with complete text coverage passes. Intervention, masking, missing/partial assessment, configuration errors, permission errors, throttling and timeouts withhold content. Provider refusals also stop the operation. Safety failures are distinct from ordinary `LLMUnavailable` failures: they do not trigger keyword grading, local answer fallback, schema retries or course redrafting. An unknown/lost remote Ask response fails closed because its moderation outcome cannot be established. A successful agents response must explicitly carry `safetyOutcome=allowed`; YAQIN also assesses the final local response. Ask rejects incomplete or missing Converse stop reasons even if a tool-shaped fragment exists.

Tutor responses retain their existing shape and add `safety_outcome`: `allowed`, `safety_blocked`, or `safety_unavailable`. Refusals and outages have no citations, source content, follow-ups or AI grading. AI course generation safety failures return no lesson or review content and a stable reason. Automated review failures produce only a fixed blocking issue. The agents Ask endpoint uses 422/503 with `errorCode`; successful responses add `safetyOutcome`. Standalone jobs stop at `NEEDS_REVIEW`, clear the candidate, and retain safe stage/attempt/token/model/prompt-version accounting.

## Configuration and policy requirements

Set `GUARDRAIL_ID` and a published numeric `GUARDRAIL_VERSION` for **both** YAQIN and the FaithMinds API/worker. `DRAFT`, zero and missing versions are rejected. There is no moderation-off switch, including locally; functional tests use explicit offline fixtures. YAQIN production startup rejects missing configuration. YAQIN uses its existing app-specific AWS profile or ECS task role and `BEDROCK_REGION`; FaithMinds uses its Lambda execution role and `BEDROCK_REGION`.

The published policy must use Standard-tier content filtering (and Standard-tier denied topics when used), with active blocking filters for hate, insults/harassment, violence, sexual exploitation and misconduct, input prompt-attack protection, and suitable sensitive-information rules. Enable input and output protection; detect-only/disabled settings are unsuitable. Tune thresholds with bilingual acceptance cases before release. The runtime verifies response action/coverage, but does **not** inspect the cloud policy's tier, thresholds or enabled filter set. An administrator must verify that exact published configuration; coverage alone does not prove a well-configured policy.

[AWS language support](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html) includes Arabic/English for Standard content filters/prompt attacks and denied topics, and for sensitive-information filters. Classic content/topic filters, word filtering and contextual grounding have narrower language support. Do not treat those as Arabic safety or source-entailment coverage. [Standard guardrails use cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-tiers.html); verify the permitted geography.

Allow good-faith educational questions about violence, jihad, abuse, sexuality, doubt and disagreement, and respectful criticism of beliefs or institutions. Denied topics must describe harmful assistance rather than banning these subjects. Avoid indiscriminate sensitive-word lists and personal-name rules that reject scholars' names or ordinary educational material. Distinguish self-harm disclosures needing support from instructions encouraging harm. Block secrets and unnecessary private identifiers without blanket rejection of valid source attribution.

## IAM and deployment

Each runtime identity needs `bedrock:ApplyGuardrail` on the selected guardrail ARN. Standard cross-region evaluation additionally needs guardrail-profile ARNs in each destination region. See [runtime permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-permissions.html) and [profile permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrail-profiles-permissions.html). Scope resources to the actual account, profile and destinations; model invocation permissions remain separate. Policy administration/GetGuardrail permissions belong to the operator, not these runtime checks.

`infra/deploy-api.sh` is wired for a bare guardrail ID in `us-east-1`, with `us.guardrail.v1:0` destination resources in `us-east-1`, `us-east-2`, and `us-west-2`. It requires ID/version in the deploying environment and injects them into the ECS task definition. Validate destinations against the selected live profile before use. Both `all` and `build` update task IAM and register the selected runtime configuration, including guardrail ID/version and agents service URL. `build` reuses the stored DB secret without overwriting it. Previously, `build` restarted the old task definition and silently ignored changes to these settings and permissions. No AWS deployment was performed here.

The FaithMinds **API** now needs model invocation and `ApplyGuardrail` permissions as well as the worker; synchronous Ask performs inference in the API Lambda. Apply the scoped guardrail/profile permissions and both variables to both functions. The dispatcher needs no guardrail access. There is no deployment script in the active agents repository, so Lambda environment/IAM wiring remains an operator action.

Each moderation call uses one SDK attempt, a two-second connect timeout and five-second read timeout; YAQIN bounds the async wait to eight seconds. FaithMinds tightens these against the existing request/job deadline. More than 100,000 decoded characters fails closed as a whole. Provider exception text and guardrail response bodies are not logged; emitted safety diagnostics use fixed labels. These bounds do not establish latency, cost or throughput acceptance under load.

## Remaining release blockers

Verify the exact published Standard policy and active bilingual filters; verify guardrail/profile permissions from actual ECS/Lambda identities; confirm environment variables and deployed Ask contract; run English/Arabic harmful and benign-sensitive acceptance cases, including tool output, explain-back and outage injection; verify manual approval/live edit independence from AI services and quota; measure latency/cost/load against these deadlines. Local fixtures prove boundaries, not live policy effectiveness. Source verification, audience/track prompts and broader operations remain subsequent work. The pre-existing library-citation revalidation failure is intentionally unchanged.

## Local validation and changed paths

FaithMinds: 88 tests passed through `scripts/check_postgres.py`, including 22 isolated TLS Postgres integration tests and 11 new runtime-safety tests. YAQIN: 303 passed, one pre-existing library-citation test failed; all 37 new runtime-safety cases passed. The failing `tests/api/test_tutor_agent.py::test_agent_answer_forwards_the_learner_jwt_and_cites_library_passages` was independently reproduced using the original `HEAD` tutor implementation in memory, without replacing workspace files. The existing source-snapshot revalidation treats remote library citations as persisted source IDs, so it abstains; no approval-flag bypass was added. Ruff on touched runtime/test code, both whitespace checks, and deployment-script syntax passed. No external calls were used by the test fixtures.

Changed paths under `faithminds-agents/`:

```text
README.md
docs/AGENT_SAFETY_READINESS.md
src/faithminds_agents/api.py
src/faithminds_agents/ask.py
src/faithminds_agents/lesson.py
src/faithminds_agents/safety.py
tests/test_agents.py
tests/test_ask.py
tests/test_jobs_postgres.py
tests/test_runtime_safety.py
```

Changed paths under `YAQIN/`:

```text
.env.example
api/app/agents/course/agent.py
api/app/agents/review/agent.py
api/app/agents/tutor/agent.py
api/app/agents/tutor/prompts.py
api/app/configuration/settings.py
api/app/container.py
api/app/domain/safety.py
api/app/gateways/agent_gateway.py
api/app/gateways/bedrock/llm_gateway.py
api/app/gateways/bedrock/safety.py
api/app/gateways/http_agent_gateway.py
api/app/gateways/llm_gateway.py
api/app/services/lesson_service.py
api/pyproject.toml
api/tests/agents/test_course_agent.py
api/tests/agents/test_review_cache.py
api/tests/conftest.py
api/tests/gateways/test_bedrock_gateways.py
api/tests/gateways/test_runtime_safety.py
docs/RUNTIME_SAFETY.md
infra/deploy-api.sh
```
