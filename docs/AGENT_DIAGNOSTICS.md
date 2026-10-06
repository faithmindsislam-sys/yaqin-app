# Tutor incident and deployment handoff — 6 October 2026

Interactive tutors are now **pinned to Sonnet 5.5 in code**, in both YAQIN and the separate agents
service. This includes Mariam, Rayen, Khaled and Ibrahim, their routing, practice, explain-back
and evidence review. Old `TUTOR_MODEL_ID`, `FAST_MODEL_ID` and remote `ASK_MODEL` environment
values cannot override the pin. Hassan retains its existing model configuration.
No production model access, latency improvement, or deployed RAG execution was verified locally.
The browser reproduced Mariam's generic practice failure; that alone does not identify its
server-side cause. Deployment and live smoke tests are owned by the deployment team.

## Findings from the code

- Previously, local routing, writing and review could make three sequential Opus 5.5 calls;
  the separate agents service defaulted to Sonnet 4.6. Both now select Sonnet 5.5 explicitly.
  YAQIN uses `anthropic.claude-sonnet-5-5` on Mantle; the separate service uses
  `global.anthropic.claude-sonnet-5-5` on Converse. The remote budget remains 25 seconds and
  YAQIN's default remains 55 seconds.
- Sonnet requests use `thinking.type=between_tools` to avoid upfront thinking, with medium
  writer effort and low routing/review effort. Converse no longer sends unsupported temperature
  or forced tool choice. Tool output, evidence support, moderation and source rechecks remain
  enforced. Valid reasoning blocks do not invalidate the remote review or reach the learner.
- A page action with missing page citations previously searched with generic action text and
  excluded the rest of the course's sources. The fallback now searches the topic and retains the
  course's approved canonical evidence. It still checks the generated questions independently.
  This fixes a code path that can cause missing evidence, not a proven explanation of every live failure.
- Two bilingual practice questions create many review units: questions, distractors, hints,
  explanations and designated answers. A review failure and empty generation both previously
  looked like missing sources. They now have distinct diagnostic reasons. The UI labels practice
  failures as temporary unavailability instead of asserting that no approved source exists.
- Short English/Arabic greetings, thanks and wellbeing questions now use friendly fixed replies,
  with no generation, classifier, embedding or retrieval calls. Moderation still runs. Mixed
  substantive questions retain normal routing.
- RAG exists in code: canonical hybrid retrieval uses Titan embeddings and Postgres source chunks,
  with keyword fallback; explicit page actions can load approved sources directly. The remote
  agents service additionally calls `/rag/v1/retrieve` for library passages. Setting
  `RAG_SERVICE_URL` alone does **not** enable library retrieval for the local tutor.
- Keyword search currently ANDs the tokens in the full bilingual query. If embeddings fail,
  this can make keyword fallback overly restrictive. Confirm `embedding_fallback` and low/empty
  retrieval counts before changing search ranking or adding another query-rewriting model call.

## Deploy and compare

1. Deploy both the YAQIN API/web change and the `faithminds-agents` API change if that service is
   used; deploy its worker for Hassan's diagnostics too. No database migration, new dependency
   or Langfuse service is needed. No model environment variables need to be set for the tutors.
   The existing YAQIN task policy grants Mantle inference; confirm Sonnet 5.5 account access.
   The separate API role needs the global Sonnet 5.5 inference profile and destination model
   permissions. That profile can route worldwide. Smoke-test model access before serving traffic.
2. Use 10–20 matched requests to compare the old and new releases. Include English and Arabic,
   Mariam's first page and a cited teaching page, two successive practice requests, the reported
   worship follow-up, six articles of faith, angels/jinn, greetings, and a personal-ruling request.
   Use a fresh chat or identical history for each comparison. Record whether the response is useful,
   sourced, or a fallback; a fast refusal is not a successful speedup.
3. Build/deploy YAQIN using `rtk proxy bash infra/deploy-api.sh build` with the existing deployment
   credentials, guardrail settings and runtime selection. Do not enable `REVIEW_SKIP_TIERS` for
   the comparison. Verify `runtime_config` and each `model` event: local tutor calls must select
   `anthropic.claude-sonnet-5-5`; separate Ask calls must select the `global.` profile above.
   `BEDROCK_MODEL_ID` still configures Hassan and is not the effective tutor model.
4. If `tutor_runtime=remote`, deploy the matching agents API release too; an older remote API
   keeps its old model regardless of the YAQIN code. Do not switch to local merely for speed
   if library retrieval is needed. Inspect the correlated remote model events to confirm the release.
5. Compare successful-response p50/p95 and failure rates. The target is 40–50% lower latency;
   it is not yet a measured result. Roll back the code/image/package release if source support,
   Arabic equivalence or practice success regress; environment model overrides no longer switch tutors.

References: [Sonnet 5.5 migration and parameter compatibility](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide),
[AWS model identifiers and access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html),
[Mantle integration](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock),
[Converse thinking parameters](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html).

## Export logs for another LLM

Use the approved application AWS profile and a bounded window covering the test. `START_MS` and
`END_MS` are Unix milliseconds. Keep each deployment's logs in separate files for the comparison.

```sh
rtk proxy aws --profile "$YAQIN_AWS_PROFILE" --region eu-west-1 logs filter-log-events \
  --log-group-name /ecs/yaqin-api --start-time "$START_MS" --end-time "$END_MS" \
  --filter-pattern 'diagnostic' --output json > yaqin-baseline.json

# Discover the deployed API/worker log groups; use each exact name below.
rtk proxy aws --profile "$YAQIN_AWS_PROFILE" --region us-east-1 logs describe-log-groups \
  --log-group-name-prefix /aws/lambda/ --query 'logGroups[].logGroupName'
rtk proxy aws --profile "$YAQIN_AWS_PROFILE" --region us-east-1 logs filter-log-events \
  --log-group-name "$AGENTS_LOG_GROUP" --start-time "$START_MS" --end-time "$END_MS" \
  --filter-pattern '{ $.version = 1 }' --output json > agents-baseline.json

rtk proxy python3 api/scripts/summarize_agent_logs.py yaqin-baseline.json agents-baseline.json > baseline-summary.json
rtk proxy python3 api/scripts/summarize_agent_logs.py yaqin-baseline.json agents-baseline.json \
  --operation OPERATION_ID > one-request.json
```

The script also accepts plain server log lines. Each diagnostic has `version=1`, `event`, `service`,
`operation_id`, `agent`, `mode` and `stage`. It groups model IDs, p50/p95 timings, retrieval modes,
fallback events and started-but-unfinished stages. Nested durations overlap: do not add a parent
duration to its model/moderation child. Missing end events may mean cancellation, process termination,
or an incomplete export window. Fallback counts are events, not a unique-request failure rate.

YAQIN's `remote_request.support_request_id` equals the standalone operation ID; `--operation` follows
that link. A standalone Hassan operation ID is its job ID. CloudWatch timestamps/streams identify
deployments and retries. All five personas and the reviewer use the shared model/middleware logs.

### How to prove RAG and locate the bottleneck

- `runtime_config`: actual configured local models, runtime path, repository and budget settings.
- `operation_stage`, stage `model`: requested/returned model where available, parent stage, latency,
  max output, stop reason, token usage and provider request ID. `max_tokens` means truncation;
  an upstream error is distinct from source rejection. `usage_start`/`usage_finish` expose DB accounting waits.
- `retrieval_result`: `page_sources`, `hybrid` or `keyword`; actual selected canonical IDs and scores,
  hit count and course IDs where applicable. Empty results are explicit. `generation.source_ids`
  shows which sources were passed to the local writer; `answer_evidence`/`practice_evidence` records citations.
- Remote `rag_retrieve`: latency, success/error, passage count, resource/document IDs, scores and content
  hashes. `answer_evidence` shows library passages selected for generation, `ask_result` shows citations,
  and `library_recheck` records the final eligibility/evidence recheck. Retrieval success with zero
  passages, selecting passages, and actually citing them are three different outcomes.
- `support_result`, `practice_fallback` and `tutor_fallback`: reasons such as `empty_practice`,
  `review_model_unavailable`, `practice_duplicate`, `review_unsupported_unit`,
  `review_excerpt_mismatch`, or `source_changed`. These are not all resource shortages.
- `operation`: total latency, model/embedding/remote call counts, reservations and budget exhaustion.
  A completed HTTP operation can still contain a fallback; inspect `tutor_result` and fallback events.

No prompts, generated prose, source text, user IDs, JWTs or credentials are included in these new logs.
Metadata proves the execution path and evidence supplied; it cannot by itself prove semantic correctness.
Inspect the visible answers and references alongside logs before accepting a faster model.
