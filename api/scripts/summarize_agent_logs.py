"""Summarize CloudWatch filter-log-events JSON or newline server logs using only stdlib."""
import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median


def records(text):
    try:
        value = json.loads(text)
    except ValueError:
        value = None
    if isinstance(value, dict) and isinstance(value.get("events"), list):
        lines = [row.get("message", "") for row in value["events"]]
    else:
        lines = text.splitlines()
    for line in lines:
        try:
            row = json.loads(line[line.index("{"):])
        except (ValueError, TypeError):
            continue
        if isinstance(row, dict) and row.get("version") == 1 and "event" in row:
            yield row


def summarize(rows):
    durations, fallbacks, retrieval, models = defaultdict(list), Counter(), Counter(), Counter()
    operations, unfinished, configs = [], Counter(), []
    for row in rows:
        event = row["event"]
        group = "/".join(str(row.get(k) or "-") for k in ("service", "agent", "mode"))
        if event == "runtime_config":
            configs.append(row)
        if event == "operation":
            operations.append(row)
        if event in ("operation", "operation_stage"):
            key = f"{group}/{row.get('parent_stage') or '-'}/{row.get('stage') or 'total'}/{row.get('status') or '-'}"
            if isinstance(row.get("latency_ms"), (int, float)):
                durations[key].append(row["latency_ms"])
        identity = (row.get("operation_id"), row.get("stage"))
        if event == "stage_started":
            unfinished[identity] += 1
        if event == "operation_stage":
            unfinished[identity] -= 1
            if row.get("stage") == "model":
                models[f"{group}/{row.get('parent_stage') or '-'}/{row.get('model')}"] += 1
        if event.endswith("fallback") or (event == "support_result" and row.get("outcome") == "rejected"):
            fallbacks[f"{group}/{row.get('reason') or row.get('error_type') or 'unknown'}"] += 1
        if event == "retrieval_result":
            retrieval[f"{group}/{row.get('retrieval_mode')}/{'nonempty' if row.get('source_ids') else 'empty'}"] += 1
        if event == "operation_stage" and row.get("stage") == "rag_retrieve":
            retrieval[f"{group}/library/{row.get('status')}/{row.get('passage_count', 'unknown')}"] += 1
    return {"runtime_config": configs, "operation_count": len(operations), "models": dict(models),
        "timings_ms": {key: {"count": len(values), "p50": median(values),
            "p95": sorted(values)[math.ceil(len(values) * .95) - 1]} for key, values in sorted(durations.items())},
        "fallbacks": dict(fallbacks), "retrieval": dict(retrieval),
        "unfinished_stages": [{"operation_id": key[0], "stage": key[1], "count": count}
                              for key, count in unfinished.items() if count > 0]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("logs", type=Path, nargs="+")
    parser.add_argument("--operation", help="Print all diagnostic events for one operation, including its remote child.")
    args = parser.parse_args()
    rows = [row for path in args.logs for row in records(path.read_text())]
    if args.operation:
        children = {row.get("support_request_id") for row in rows if row.get("operation_id") == args.operation}
        rows = [row for row in rows if row.get("operation_id") in {args.operation, *children} - {None}]
        print(json.dumps(rows, indent=2))
    else:
        print(json.dumps(summarize(rows), indent=2))


if __name__ == "__main__":
    main()
