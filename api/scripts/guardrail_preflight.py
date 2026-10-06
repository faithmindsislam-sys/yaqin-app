"""Read-only GetGuardrail inspection; never uses a default/borrowed AWS identity."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

REQUIRED = {"HATE", "INSULTS", "SEXUAL", "VIOLENCE", "MISCONDUCT", "PROMPT_ATTACK"}
STRENGTHS = {"LOW", "MEDIUM", "HIGH"}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str,
                                     separators=(",", ":")).encode()).hexdigest()


def validate_policy(policy, version):
    try:
        return _validate_policy(policy, version)
    except (AttributeError, TypeError, KeyError):
        return ["invalid_policy_schema"]


def _validate_policy(policy, version):
    failures = []
    if not re.fullmatch(r"[1-9][0-9]{0,7}", str(version)) or policy.get("version") != version:
        failures.append("published_numeric_version_required")
    if policy.get("status") != "READY":
        failures.append("policy_not_ready")
    content = policy.get("contentPolicy", {})
    if content.get("tier", {}).get("tierName") != "STANDARD":
        failures.append("standard_content_tier_required")
    filters = content.get("filters", [])
    if not isinstance(filters, list) or any(not isinstance(f, dict) for f in filters):
        return failures + ["invalid_filters"]
    kinds = [f.get("type") for f in filters]
    if len(kinds) != len(set(kinds)):
        failures.append("duplicate_filters")
    by_type = {f.get("type"): f for f in filters}
    for kind in sorted(REQUIRED):
        f = by_type.get(kind, {})
        for side in ("input",) if kind == "PROMPT_ATTACK" else ("input", "output"):
            if (f.get(side + "Enabled") is not True or f.get(side + "Action") != "BLOCK"
                    or f.get(side + "Strength") not in STRENGTHS
                    or (side + "Modalities" in f and "TEXT" not in f[side + "Modalities"])):
                failures.append(f"{kind}_{side}_blocking_required")
    topics = policy.get("topicPolicy", {})
    if topics.get("topics") and topics.get("tier", {}).get("tierName") != "STANDARD":
        failures.append("standard_topic_tier_required")
    profanity = [f for f in policy.get("wordPolicy", {}).get("managedWordLists", []) if f.get("type") == "PROFANITY"]
    if len(profanity) != 1 or profanity[0].get("outputEnabled") is not True or profanity[0].get("outputAction") != "BLOCK":
        failures.append("managed_profanity_output_blocking_required")
    return failures


def inspect(*, profile=None, region=None, account=None, principal=None, guardrail_id=None, version=None):
    prerequisites = (profile, region, account, principal, guardrail_id, version)
    result = {"status": "NOT_VALIDATED", "scope": "configuration_only", "policy_sha256": None,
              "identity_sha256": None, "guardrail_id": guardrail_id, "version": version,
              "region": region, "failures": [], "prompt_attack_scope": "untrusted_guard_content_input"}
    if not all(prerequisites):
        result["failures"] = ["explicit_app_profile_region_account_principal_id_version_required"]
        return result
    if profile.startswith("aws-"):
        result["failures"] = ["unrelated_aws_profile_denied"]
        return result
    if not re.fullmatch(r"[1-9][0-9]{0,7}", version):
        result["failures"] = ["published_numeric_version_required"]
        return result
    try:
        import boto3
        from botocore.config import Config

        session = boto3.Session(profile_name=profile, region_name=region)
        config = Config(connect_timeout=2, read_timeout=5, retries={"total_max_attempts": 1})
        identity = session.client("sts", config=config).get_caller_identity()
        if identity.get("Account") != account or identity.get("Arn") != principal:
            result["failures"] = ["app_identity_mismatch"]
            return result
        result["identity_sha256"] = digest({"Account": identity["Account"], "Arn": identity["Arn"]})
        policy = session.client("bedrock", config=config).get_guardrail(
            guardrailIdentifier=guardrail_id, guardrailVersion=version)
        result["policy_sha256"] = digest({k: v for k, v in policy.items() if k != "ResponseMetadata"})
        result["failures"] = validate_policy(policy, version)
        result["filters"] = policy.get("contentPolicy", {})
        result["status"] = "CONFIGURATION_VALIDATED" if not result["failures"] else "FAIL"
    except Exception:
        result["failures"] = ["inspection_unavailable"]  # never record provider exceptions/credentials
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("app-profile", "region", "account", "principal", "guardrail-id", "version"):
        parser.add_argument("--" + name)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args(argv)
    result = inspect(profile=args.app_profile, region=args.region, account=args.account,
                     principal=args.principal, guardrail_id=args.guardrail_id, version=args.version)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "CONFIGURATION_VALIDATED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
