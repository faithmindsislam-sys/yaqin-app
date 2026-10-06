"""Exercise the build deployment path offline; no AWS calls or real secrets."""

import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile

import pytest


SCRIPT = Path(__file__).resolve().parents[3] / "infra" / "deploy-api.sh"


@pytest.mark.parametrize("mcp_enabled", [False, True])
def test_build_refreshes_ai_permissions_and_uses_new_task_definition(tmp_path, mcp_enabled):
    source = SCRIPT.read_text()
    subprocess.run(["bash", "-n", str(SCRIPT)], check=True)
    # Run the actual rendering functions and build branch with offline AWS/build adapters.
    roles = source.split("ensure_task_roles() {", 1)[1].split("\nensure_network()", 1)[0]
    task = source.split("register_task_definition() {", 1)[1].split("\nensure_service()", 1)[0]
    dispatch = 'case "${1:-all}" in' + source.split('case "${1:-all}" in', 1)[1].split('\nlog "Done:', 1)[0]
    calls, rendered, policies = (tmp_path / name for name in ("calls.jsonl", "task.json", "policies.jsonl"))
    secrets = tmp_path / "config.env"
    secrets.write_text("SUPABASE_URL=https://project.supabase.co\n")
    fake_aws = tmp_path / "aws"
    fake_aws.write_text(f"#!{sys.executable}\n" + '''
import json, os, pathlib, sys
args = sys.argv[1:]
with open(os.environ["TEST_CALLS"], "a") as f:
    f.write(json.dumps(args) + "\\n")
if args[:2] == ["secretsmanager", "describe-secret"]:
    print("arn:aws:secretsmanager:eu-west-1:123456789012:secret:existing")
elif args[:2] == ["ecs", "register-task-definition"]:
    path = args[args.index("--cli-input-json") + 1].removeprefix("file://")
    pathlib.Path(os.environ["TEST_TASK"]).write_text(pathlib.Path(path).read_text())
    print("arn:aws:ecs:eu-west-1:123456789012:task-definition/api:99")
elif args[:2] == ["elbv2", "describe-load-balancers"]:
    print("fixture-alb.eu-west-1.elb.amazonaws.com")
''')
    fake_aws.chmod(0o755)
    stub = """
set -euo pipefail
log() { :; }
ensure_codebuild() { :; }
build_image() { :; }
retain_all() { :; }
aws_() { aws "$@"; }
ensure_role() { printf '%s' "$3" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)))' >> "$TEST_POLICIES"; }
"""
    harness = tmp_path / "build.sh"
    harness.write_text(stub + f"SECRETS_FILE={shlex.quote(str(secrets))}\n"
                       + "ensure_task_roles() {" + roles
                       + "register_task_definition() {" + task + dispatch)
    app = "offline-" + tmp_path.name
    env = {**os.environ, "PATH": str(tmp_path) + os.pathsep + os.environ["PATH"],
           "TEST_CALLS": str(calls), "TEST_TASK": str(rendered), "TEST_POLICIES": str(policies),
           "APP": app, "ACCOUNT": "123456789012", "REGION": "eu-west-1",
           "IMAGE": "example.invalid/api:latest", "QURAN_BUCKET": "fixture-bucket",
           "GUARDRAIL_ID": "newguardrail", "GUARDRAIL_VERSION": "7",
           "RAG_SERVICE_URL": "https://rag.example.org", "AGENTS_SERVICE_URL": "https://agents.example.org",
           "ALLOWED_ORIGINS": "https://app.yaqeenguide.com",
           "MCP_RESOURCE_URL": "https://public-api.yaqeenguide.com/api/v1/mcp/" if mcp_enabled else "",
           "MCP_ALLOWED_HOSTS": "extra.example.org", "PUBLIC_API_RATE_PER_MINUTE": "17",
           "PUBLIC_API_SERVICE_RATE_PER_MINUTE": "55", "TUTOR_TOKENS": "12345", "USER_DAILY_TOKENS": "98765",
           "TUTOR_SECONDS": "40", "TUTOR_MODEL_CALLS": "4", "COURSE_SECONDS": "480",
           "TUTOR_MODEL_ID": "anthropic.claude-opus-5-5", "FAST_MODEL_ID": "anthropic.claude-opus-5-5"}
    try:
        subprocess.run(["bash", str(harness), "build"], env=env, check=True, capture_output=True, text=True)
    finally:
        Path(f"/tmp/{app}-taskdef.json").unlink(missing_ok=True)
    operations = [json.loads(line) for line in calls.read_text().splitlines()]
    assert [op[:2] for op in operations] == [
        ["secretsmanager", "describe-secret"], *([["elbv2", "describe-load-balancers"]] if mcp_enabled else []), ["ecs", "register-task-definition"],
        ["ecs", "update-service"], ["ecs", "wait"],
    ]
    update = next(op for op in operations if op[:2] == ["ecs", "update-service"])
    assert update[update.index("--task-definition") + 1].endswith("api:99")
    container = json.loads(rendered.read_text())["containerDefinitions"][0]
    settings = {item["name"]: item["value"] for item in container["environment"]}
    assert settings["GUARDRAIL_ID"] == "newguardrail"
    assert settings["GUARDRAIL_VERSION"] == "7"
    assert "TUTOR_MODEL_ID" not in settings and "FAST_MODEL_ID" not in settings  # Pinned in code.
    assert settings["AGENTS_SERVICE_URL"] == "https://agents.example.org"
    assert settings["PUBLIC_API_RATE_PER_MINUTE"] == "17"
    assert settings["PUBLIC_API_SERVICE_RATE_PER_MINUTE"] == "55"
    assert settings["TUTOR_TOKENS"] == "12345" and settings["USER_DAILY_TOKENS"] == "98765"
    assert settings["TUTOR_SECONDS"] == "40" and settings["TUTOR_MODEL_CALLS"] == "4"
    assert settings["COURSE_SECONDS"] == "480"
    assert settings["MCP_RESOURCE_URL"] == env["MCP_RESOURCE_URL"]
    assert ("fixture-alb.eu-west-1.elb.amazonaws.com" in settings["MCP_ALLOWED_HOSTS"]) == mcp_enabled
    assert container["secrets"][0]["valueFrom"].endswith(":secret:existing:DATABASE_URL::")
    task_policy = json.loads(policies.read_text().splitlines()[1])
    safety = next(s for s in task_policy["Statement"] if s["Sid"] == "RuntimeSafety")
    assert safety["Action"] == "bedrock:ApplyGuardrail"
    assert "arn:aws:bedrock:us-east-1:123456789012:guardrail/newguardrail" in safety["Resource"]


def test_mcp_metadata_routing_preserves_unrelated_behaviors_and_disables_caching(tmp_path):
    source = SCRIPT.read_text()
    routing = source.split("ensure_cloudfront_route() {", 1)[1].split("\nretain_all()", 1)[0]
    transform = routing.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
    transform = transform.replace("/tmp/yaqin-", str(tmp_path / "yaqin-"))
    existing = {"ETag": "fixture", "DistributionConfig": {
        "DefaultCacheBehavior": {"FunctionAssociations": {"Quantity": 1, "Items": [{
            "EventType": "viewer-request", "FunctionARN": "arn:aws:cloudfront::123456789012:function/yaqin-index-rewrite"}]}},
        "Origins": {"Quantity": 1, "Items": [{"Id": "web"}]},
        "CacheBehaviors": {"Quantity": 2, "Items": [
            {"PathPattern": "/assets/*", "TargetOriginId": "web"},
            {"PathPattern": "/api/*", "TargetOriginId": "old-api"},
        ]},
    }}
    (tmp_path / "yaqin-dist.json").write_text(json.dumps(existing))
    subprocess.run([sys.executable, "-c", transform, "fixture.elb.amazonaws.com", "fixture-origin-header"], check=True)
    config = json.loads((tmp_path / "yaqin-dist-new.json").read_text())
    assert config["CacheBehaviors"]["Quantity"] == 3
    paths = {b["PathPattern"]: b for b in config["CacheBehaviors"]["Items"]}
    assert paths["/assets/*"] == existing["DistributionConfig"]["CacheBehaviors"]["Items"][0]
    for path in ("/api/*", "/.well-known/oauth-protected-resource/*"):
        assert paths[path]["TargetOriginId"] == "alb-api"
        assert paths[path]["CachePolicyId"] == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
        assert paths[path]["OriginRequestPolicyId"] == "b689b0a8-53d0-40ab-baf2-68738e2966ac"
        assert paths[path]["FunctionAssociations"] == existing["DistributionConfig"]["DefaultCacheBehavior"]["FunctionAssociations"]
    origin = next(o for o in config["Origins"]["Items"] if o["Id"] == "alb-api")
    assert origin["CustomHeaders"]["Items"][0]["HeaderName"] == "X-Origin-Verify"
    existing["DistributionConfig"]["DefaultCacheBehavior"]["FunctionAssociations"] = {"Quantity": 0}
    (tmp_path / "yaqin-dist.json").write_text(json.dumps(existing))
    refused = subprocess.run([sys.executable, "-c", transform, "fixture.elb.amazonaws.com", "fixture-origin-header"], capture_output=True, text=True)
    assert refused.returncode != 0 and "Publish and attach yaqin-index-rewrite" in refused.stderr


def test_release_images_have_unique_rollback_tags():
    source = SCRIPT.read_text()
    image = source.split("ECR_REPO=$APP-api\n", 1)[1].split("\nBUILD_BUCKET=", 1)[0]
    env = {**os.environ, "ACCOUNT": "123456789012", "REGION": "eu-west-1", "ECR_REPO": "fixture"}
    env.pop("IMAGE_TAG", None)
    command = image + '\nprintf "%s" "$IMAGE"'
    first = subprocess.check_output(["bash", "-ec", command], env=env, text=True)
    second = subprocess.check_output(["bash", "-ec", command], env=env, text=True)
    assert first != second and not first.endswith(":latest")
    assert subprocess.run(["bash", "-ec", command], env={**env, "IMAGE_TAG": "latest"}, capture_output=True).returncode == 2


@pytest.mark.parametrize("failure", [None, "missing-docs", "omitted-docs", "new-copy-input", "advanced-copy"])
def test_source_package_validates_real_archive_before_aws(tmp_path, failure):
    root = tmp_path / "repo"
    script = root / "infra" / "deploy-api.sh"
    script.parent.mkdir(parents=True)
    script.write_text(SCRIPT.read_text())
    dockerfile = root / "api" / "Dockerfile"
    dockerfile.parent.mkdir()
    dockerfile.write_text((SCRIPT.parent.parent / "api" / "Dockerfile").read_text())
    for name in ("api/pyproject.toml", "api/README.md", "api/app/main.py", "api/scripts/tool.py",
                 "docs/public-api-v1.html", "content/lesson.json", ".dockerignore",
                 "api/.env", "api/.env.local", "api/.venv/cache", "docs/.env", "content/.env.local"):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("offline fixture\n")
    if failure == "missing-docs":
        shutil.rmtree(root / "docs")
    elif failure == "omitted-docs":
        script.write_text(script.read_text().replace("api content docs .dockerignore", "api content .dockerignore"))
    elif failure == "new-copy-input":
        (root / "settings.json").write_text("{}")
        dockerfile.write_text(dockerfile.read_text() + "\nCOPY settings.json /srv/settings.json\n")
    elif failure == "advanced-copy":
        dockerfile.write_text(dockerfile.read_text() + '\nCOPY ["docs", "/srv/docs"]\n')
    archive = tmp_path / "source.zip"
    env = {key: value for key, value in os.environ.items()
           if key not in ("YAQIN_AWS_PROFILE", "EXPECTED_AWS_ACCOUNT_ID", "TUTOR_RUNTIME")}
    result = subprocess.run(["bash", str(script), "package", str(archive)], cwd=tmp_path,
                            env=env, capture_output=True, text=True)
    if failure:
        assert result.returncode != 0
        assert {"missing-docs": "docs", "omitted-docs": "missing Docker COPY input: docs",
                "new-copy-input": "missing Docker COPY input: settings.json",
                "advanced-copy": "Unsupported COPY syntax"}[failure] in result.stdout + result.stderr
    else:
        assert result.returncode == 0, result.stdout + result.stderr
        with ZipFile(archive) as packaged:
            names = set(packaged.namelist())
            assert {"docs/public-api-v1.html", "api/Dockerfile", "api/app/main.py", "content/lesson.json"} <= names
            assert not any("/.env" in name or "/.venv/" in name for name in names)
