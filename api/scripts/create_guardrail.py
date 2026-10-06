#!/usr/bin/env python3
"""Create the Yaqeen runtime safety guardrail in your own AWS account.

The tutor refuses to answer when no guardrail is configured, so this must run
before the API can respond. Mirrors the production policy (see docs/RUNTIME_SAFETY.md):
hate is filtered gently because religious discussion legitimately quotes hostile
claims, prompt attacks are filtered hard, and numeric PII entities are left off
because they matched source references such as hadith numbers.

    python api/scripts/create_guardrail.py --region us-east-1
    python api/scripts/create_guardrail.py --region us-east-1 --name my-guardrail
"""
import argparse
import json
import sys

import boto3

NAME = "yaqin-runtime-safety"
FILTERS = [
    # type, input strength, output strength
    ("HATE", "LOW", "LOW"),
    ("VIOLENCE", "MEDIUM", "MEDIUM"),
    ("SEXUAL", "MEDIUM", "MEDIUM"),
    ("INSULTS", "MEDIUM", "MEDIUM"),
    ("MISCONDUCT", "MEDIUM", "MEDIUM"),
    ("PROMPT_ATTACK", "HIGH", "NONE"),
]
PII = ("AWS_ACCESS_KEY", "AWS_SECRET_KEY", "PASSWORD")


def policy():
    filters = []
    for kind, incoming, outgoing in FILTERS:
        entry = {"type": kind, "inputStrength": incoming, "outputStrength": outgoing,
                 "inputModalities": ["TEXT"], "outputModalities": ["TEXT"],
                 "inputAction": "BLOCK", "inputEnabled": True}
        # A prompt attack is an input-only concept; scoring model output for it is noise.
        entry["outputEnabled"] = outgoing != "NONE"
        if entry["outputEnabled"]:
            entry["outputAction"] = "BLOCK"
        filters.append(entry)
    return {"filtersConfig": filters}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", default="us-east-1", help="Bedrock region (default us-east-1)")
    ap.add_argument("--name", default=NAME, help=f"guardrail name (default {NAME})")
    ap.add_argument("--profile", default=None, help="AWS profile to use")
    args = ap.parse_args()

    session = boto3.Session(profile_name=args.profile) if args.profile else boto3.Session()
    bedrock = session.client("bedrock", region_name=args.region)

    existing = next((g for g in bedrock.list_guardrails().get("guardrails", [])
                     if g["name"] == args.name), None)
    if existing:
        print(f"A guardrail named {args.name} already exists: {existing['id']}", file=sys.stderr)
        print("Delete it or pass --name to create another.", file=sys.stderr)
        return 1

    created = bedrock.create_guardrail(
        name=args.name,
        description="Yaqeen runtime safety: input and output moderation for the tutors.",
        contentPolicyConfig=policy(),
        sensitiveInformationPolicyConfig={
            "piiEntitiesConfig": [{"type": kind, "action": "BLOCK"} for kind in PII]},
        blockedInputsMessaging="This request can't be processed.",
        blockedOutputsMessaging="This response can't be shown.",
    )
    published = bedrock.create_guardrail_version(
        guardrailIdentifier=created["guardrailId"],
        description="Initial published version.")

    print(json.dumps({"GUARDRAIL_ID": created["guardrailId"],
                      "GUARDRAIL_VERSION": published["version"],
                      "region": args.region}, indent=2))
    print("\nAdd GUARDRAIL_ID and GUARDRAIL_VERSION to your environment, and allow\n"
          "bedrock:ApplyGuardrail on this guardrail in the API's IAM role.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
