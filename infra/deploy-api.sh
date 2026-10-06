#!/usr/bin/env bash
# Provision and deploy the Yaqin API: ECR image built in CodeBuild, ECS Fargate behind an ALB
# that only accepts traffic from CloudFront. Safe to re-run: each step reuses what exists.
#
#   YAQIN_AWS_PROFILE=<app-profile> infra/deploy-api.sh            # full provision + deploy
#   YAQIN_AWS_PROFILE=<app-profile> infra/deploy-api.sh build      # rebuild and refresh runtime configuration/IAM
#   YAQIN_AWS_PROFILE=<app-profile> infra/deploy-api.sh routing    # refresh API and MCP metadata routing only
#   infra/deploy-api.sh package [/tmp/yaqin-source.zip]          # validate source locally; no AWS calls
#
# Project settings are read from the repository's ignored local root .env.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)

package_source() {
  local zip=$1
  rm -f "$zip"
  (cd "$ROOT" && zip -MM -qr "$zip" api content docs .dockerignore -x 'api/.venv/*' 'api/**/__pycache__/*' 'api/.pytest_cache/*' 'api/.ruff_cache/*' 'api/*.egg-info/*' 'api/.idea/*' '*/.env' '*/.env.*')
  python3 - "$zip" <<'PYARCHIVE'
import shlex
import sys
from zipfile import ZipFile

with ZipFile(sys.argv[1]) as archive:
    files = {name for name in archive.namelist() if not name.endswith("/")}
    # ponytail: plain COPY only; use Docker's validator if the image needs advanced syntax.
    for line in archive.read("api/Dockerfile").decode().splitlines():
        parts = line.split(None, 1)
        if not parts or parts[0].upper() != "COPY":
            continue
        arguments = parts[1] if len(parts) > 1 else ""
        if arguments.startswith(("--", "[")) or line.rstrip().endswith("\\"):
            raise SystemExit("Unsupported COPY syntax in source preflight: " + line)
        sources = shlex.split(arguments)
        if len(sources) < 2:
            raise SystemExit("Invalid COPY instruction: " + line)
        for source in sources[:-1]:
            source = source.removeprefix("./").rstrip("/")
            if source not in files and not any(name.startswith(source + "/") for name in files):
                raise SystemExit("Source archive missing Docker COPY input: " + source)
print("Source archive validated: " + sys.argv[1])
PYARCHIVE
}

if [[ "${1:-}" == package ]]; then
  package_source "${2:-/tmp/yaqin-source.zip}"
  exit 0
fi

REGION=${REGION:-eu-west-1}
: "${YAQIN_AWS_PROFILE:?Select an explicit app-specific AWS profile}"
: "${EXPECTED_AWS_ACCOUNT_ID:?Set the approved application account ID}"
: "${TUTOR_RUNTIME:?Select local or remote}"
[[ "$YAQIN_AWS_PROFILE" != aws-* && "$EXPECTED_AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]] || exit 2
export AWS_PROFILE="$YAQIN_AWS_PROFILE"
export RAG_SERVICE_URL=${RAG_SERVICE_URL:-https://4h0ertfiu6.execute-api.us-east-1.amazonaws.com}
export AGENTS_SERVICE_URL=${AGENTS_SERVICE_URL:-}
export MCP_RESOURCE_URL=${MCP_RESOURCE_URL:-}
export MCP_ALLOWED_HOSTS=${MCP_ALLOWED_HOSTS:-}
export PUBLIC_API_RATE_PER_MINUTE=${PUBLIC_API_RATE_PER_MINUTE:-60}
export PUBLIC_API_SERVICE_RATE_PER_MINUTE=${PUBLIC_API_SERVICE_RATE_PER_MINUTE:-500}
[[ "$TUTOR_RUNTIME" == local || "$TUTOR_RUNTIME" == remote ]] || exit 2
[[ "$TUTOR_RUNTIME" != remote || -n "$AGENTS_SERVICE_URL" ]] || exit 2
[[ "$TUTOR_RUNTIME" != local || -z "$AGENTS_SERVICE_URL" ]] || exit 2
python3 - <<'PYCONFIG'
import os
import re
from urllib.parse import urlsplit
for name in ("RAG_SERVICE_URL", "AGENTS_SERVICE_URL"):
    value = os.environ.get(name, "")
    if not value:
        continue
    u = urlsplit(value)
    if (u.scheme != "https" or not u.hostname or not re.fullmatch(r"[A-Za-z0-9.-]+", u.hostname) or u.username or u.password
            or u.query or u.fragment or u.path not in ("", "/") or u.port not in (None,443)):
        raise SystemExit("Invalid HTTPS origin: " + name)
resource = os.environ.get("MCP_RESOURCE_URL", "")
if resource:
    u = urlsplit(resource)
    if (u.scheme != "https" or not u.hostname or not re.fullmatch(r"[A-Za-z0-9.-]+", u.hostname)
            or u.username or u.password or u.query or u.fragment or u.port not in (None,443)
            or u.path != "/api/v1/mcp/"):
        raise SystemExit("Invalid MCP_RESOURCE_URL")
for host in os.environ.get("MCP_ALLOWED_HOSTS", "").split(","):
    if host and not re.fullmatch(r"[A-Za-z0-9.-]+(?::[0-9]+|:\*)?", host):
        raise SystemExit("Invalid MCP_ALLOWED_HOSTS")
for name in ("PUBLIC_API_RATE_PER_MINUTE", "PUBLIC_API_SERVICE_RATE_PER_MINUTE", "TUTOR_RATE_PER_MINUTE",
             "TUTOR_TOKENS", "TUTOR_SECONDS", "TUTOR_MODEL_CALLS", "COURSE_SECONDS",
             "USER_DAILY_TOKENS", "SERVICE_DAILY_TOKENS", "SERVICE_RATE_PER_MINUTE"):
    value = os.environ.get(name)
    if value is not None and (not value.isascii() or not value.isdigit() or int(value) < 1):
        raise SystemExit("Invalid quota: " + name)
PYCONFIG
# Explicit runtime safety configuration is mandatory before any provisioning.
: "${GUARDRAIL_ID:?Set the published Standard-tier guardrail ID}"
: "${GUARDRAIL_VERSION:?Set the published numeric guardrail version}"
[[ "$GUARDRAIL_ID" =~ ^[a-z0-9]+$ && "$GUARDRAIL_VERSION" =~ ^[1-9][0-9]{0,7}$ ]] || {
  echo "Invalid guardrail configuration" >&2; exit 2;
}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
[[ "$ACCOUNT" == "$EXPECTED_AWS_ACCOUNT_ID" ]] || { echo "Unexpected AWS account" >&2; exit 2; }
APP=yaqin
QURAN_BUCKET=${QURAN_BUCKET:-yaqin-resources-744172873146}
TAGS="Key=project,Value=$APP"
SECRETS_FILE="$ROOT/.env"
DIST_ID=${DIST_ID:-E2Z664SCKULGHC}
ORIGIN_DOMAIN=${ORIGIN_DOMAIN:-d1x2w48x0bzbrs.cloudfront.net}
# Every hostname the web app is served from (CloudFront aliases plus its default name).
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-https://yaqeenguide.com,https://www.yaqeenguide.com,https://app.yaqeenguide.com,https://studio.yaqeenguide.com,https://$ORIGIN_DOMAIN}
# Server-to-server callers. Switch to https://rag.yaqeenguide.com and https://agents.yaqeenguide.com
# once their DNS records resolve (API Gateway custom domains exist; see docs/DOMAIN.md).

aws_() { aws --region "$REGION" "$@"; }
log() { printf '\n== %s\n' "$*"; }

ECR_REPO=$APP-api
IMAGE_TAG=${IMAGE_TAG:-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')}
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ && "$IMAGE_TAG" != latest ]] || {
  echo "Use a unique release IMAGE_TAG; latest is not a rollback target" >&2; exit 2;
}
IMAGE="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
BUILD_BUCKET=$APP-build-$ACCOUNT

ensure_ecr() {
  log "ECR repository"
  aws_ ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 ||
    aws_ ecr create-repository --repository-name "$ECR_REPO" --image-scanning-configuration scanOnPush=true \
      --tags "$TAGS" --query repository.repositoryUri --output text
  aws_ ecr put-lifecycle-policy --repository-name "$ECR_REPO" --lifecycle-policy-text \
    '{"rules":[{"rulePriority":1,"description":"keep 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' >/dev/null
}

ensure_build_bucket() {
  log "Build source bucket"
  if ! aws_ s3api head-bucket --bucket "$BUILD_BUCKET" 2>/dev/null; then
    aws_ s3api create-bucket --bucket "$BUILD_BUCKET" --create-bucket-configuration LocationConstraint="$REGION" \
      --object-ownership BucketOwnerEnforced >/dev/null
    aws_ s3api put-public-access-block --bucket "$BUILD_BUCKET" --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    aws_ s3api put-bucket-lifecycle-configuration --bucket "$BUILD_BUCKET" --lifecycle-configuration \
      '{"Rules":[{"ID":"expire-sources","Status":"Enabled","Filter":{},"Expiration":{"Days":14}}]}'
    aws_ s3api put-bucket-tagging --bucket "$BUILD_BUCKET" --tagging "TagSet=[{$TAGS}]"
  fi
}

ensure_role() { # name, trust-service, inline-policy-json, [managed-policy-arn]
  local name=$1 service=$2 policy=$3 managed=${4:-}
  if ! aws iam get-role --role-name "$name" >/dev/null 2>&1; then
    aws iam create-role --role-name "$name" --tags "$TAGS" --assume-role-policy-document \
      "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"$service\"},\"Action\":\"sts:AssumeRole\"}]}" >/dev/null
  fi
  aws iam put-role-policy --role-name "$name" --policy-name "$name-inline" --policy-document "$policy"
  [ -n "$managed" ] && aws iam attach-role-policy --role-name "$name" --policy-arn "$managed"
  return 0
}

ensure_codebuild() {
  log "CodeBuild project"
  ensure_role "$APP-codebuild" codebuild.amazonaws.com "$(cat <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/codebuild/$APP-api*"},
 {"Effect":"Allow","Action":["s3:GetObject","s3:GetObjectVersion"],"Resource":"arn:aws:s3:::$BUILD_BUCKET/*"},
 {"Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
 {"Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload","ecr:PutImage","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":"arn:aws:ecr:$REGION:$ACCOUNT:repository/$ECR_REPO"}
]}
JSON
)"
  local buildspec
  buildspec=$(cat <<'YAML'
version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${IMAGE%%/*}
  build:
    commands:
      - docker build -f api/Dockerfile -t $IMAGE .
  post_build:
    commands:
      - docker push $IMAGE
YAML
)
  local source="{\"type\":\"S3\",\"location\":\"$BUILD_BUCKET/source.zip\",\"buildspec\":$(printf '%s' "$buildspec" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}"
  local env="{\"type\":\"ARM_CONTAINER\",\"image\":\"aws/codebuild/amazonlinux-aarch64-standard:3.0\",\"computeType\":\"BUILD_GENERAL1_SMALL\",\"privilegedMode\":true,\"environmentVariables\":[{\"name\":\"IMAGE\",\"value\":\"$IMAGE\"}]}"
  local role="arn:aws:iam::$ACCOUNT:role/$APP-codebuild"
  if aws_ codebuild batch-get-projects --names "$APP-api" --query 'projects[0].name' --output text | grep -q "$APP-api"; then
    aws_ codebuild update-project --name "$APP-api" --source "$source" --environment "$env" --service-role "$role" >/dev/null
  else
    sleep 10 # new IAM roles take a moment to become assumable
    aws_ codebuild create-project --name "$APP-api" --source "$source" --environment "$env" --service-role "$role" \
      --artifacts type=NO_ARTIFACTS --tags key=project,value=$APP >/dev/null
  fi
}

build_image() {
  log "Build image in CodeBuild"
  local zip=/tmp/$APP-source.zip
  package_source "$zip"
  aws_ s3 cp "$zip" "s3://$BUILD_BUCKET/source.zip" --only-show-errors
  local id status
  id=$(aws_ codebuild start-build --project-name "$APP-api" --query build.id --output text)
  echo "build $id"
  while :; do
    status=$(aws_ codebuild batch-get-builds --ids "$id" --query 'builds[0].buildStatus' --output text)
    [ "$status" != IN_PROGRESS ] && break
    sleep 15
  done
  echo "build status: $status"
  [ "$status" = SUCCEEDED ]
}

ensure_secret() {
  log "Secrets Manager"
  local db
  db=$(grep '^DATABASE_URL=' "$SECRETS_FILE" | cut -d= -f2-)
  local payload
  payload=$(python3 -c 'import json,sys;print(json.dumps({"DATABASE_URL":sys.argv[1]}))' "$db")
  if aws_ secretsmanager describe-secret --secret-id "$APP/api" >/dev/null 2>&1; then
    aws_ secretsmanager put-secret-value --secret-id "$APP/api" --secret-string "$payload" >/dev/null
  else
    aws_ secretsmanager create-secret --name "$APP/api" --secret-string "$payload" --tags "$TAGS" >/dev/null
  fi
  SECRET_ARN=$(aws_ secretsmanager describe-secret --secret-id "$APP/api" --query ARN --output text)
}

ensure_task_roles() {
  log "ECS task roles"
  ensure_role "$APP-api-exec" ecs-tasks.amazonaws.com \
    "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"$SECRET_ARN\"}]}" \
    arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
  ensure_role "$APP-api-task" ecs-tasks.amazonaws.com "$(cat <<JSON
{"Version":"2012-10-17","Statement":[
 {"Sid":"ClaudeMessages","Effect":"Allow","Action":"bedrock-mantle:CreateInference","Resource":"*"},
 {"Sid":"RuntimeSafety","Effect":"Allow","Action":"bedrock:ApplyGuardrail","Resource":[
   "arn:aws:bedrock:us-east-1:$ACCOUNT:guardrail/$GUARDRAIL_ID",
   "arn:aws:bedrock:us-east-1:$ACCOUNT:guardrail-profile/us.guardrail.v1:0",
   "arn:aws:bedrock:us-east-2:$ACCOUNT:guardrail-profile/us.guardrail.v1:0",
   "arn:aws:bedrock:us-west-2:$ACCOUNT:guardrail-profile/us.guardrail.v1:0"
 ]},
 {"Sid":"Embeddings","Effect":"Allow","Action":"bedrock:InvokeModel","Resource":"arn:aws:bedrock:$REGION::foundation-model/amazon.titan-embed-text-v2:0"}
 ,{"Sid":"QuranSourceRead","Effect":"Allow","Action":"s3:GetObject","Resource":[
   "arn:aws:s3:::$QURAN_BUCKET/resources/quran/ar/kfgqpc-hafs-v30/*",
   "arn:aws:s3:::$QURAN_BUCKET/resources/quran/en/sahih-international-13638/*"
 ]}
]}
JSON
)"
}

ensure_network() {
  log "Network (default VPC) and security groups"
  VPC=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
  SUBNETS=$(aws_ ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
  local cf_prefix
  cf_prefix=$(aws_ ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)

  ALB_SG=$(aws_ ec2 describe-security-groups --filters Name=group-name,Values=$APP-alb Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text)
  if [ "$ALB_SG" = None ]; then
    ALB_SG=$(aws_ ec2 create-security-group --group-name $APP-alb --description "Yaqin ALB: CloudFront only" --vpc-id "$VPC" \
      --tag-specifications "ResourceType=security-group,Tags=[{$TAGS}]" --query GroupId --output text)
    aws_ ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
      --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=$cf_prefix,Description=CloudFront}]" >/dev/null
  fi
  TASK_SG=$(aws_ ec2 describe-security-groups --filters Name=group-name,Values=$APP-api Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text)
  if [ "$TASK_SG" = None ]; then
    TASK_SG=$(aws_ ec2 create-security-group --group-name $APP-api --description "Yaqin API tasks: ALB only" --vpc-id "$VPC" \
      --tag-specifications "ResourceType=security-group,Tags=[{$TAGS}]" --query GroupId --output text)
    aws_ ec2 authorize-security-group-ingress --group-id "$TASK_SG" \
      --ip-permissions "IpProtocol=tcp,FromPort=8000,ToPort=8000,UserIdGroupPairs=[{GroupId=$ALB_SG}]" >/dev/null
  fi
}

ensure_alb() {
  log "Load balancer"
  ALB_ARN=$(aws_ elbv2 describe-load-balancers --names $APP-api --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo None)
  if [ "$ALB_ARN" = None ]; then
    ALB_ARN=$(aws_ elbv2 create-load-balancer --name $APP-api --type application --scheme internet-facing \
      --subnets ${SUBNETS//,/ } --security-groups "$ALB_SG" --tags "$TAGS" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  fi
  ALB_DNS=$(aws_ elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].DNSName' --output text)
  aws_ elbv2 modify-load-balancer-attributes --load-balancer-arn "$ALB_ARN" \
    --attributes Key=idle_timeout.timeout_seconds,Value=120 Key=routing.http.drop_invalid_header_fields.enabled,Value=true >/dev/null

  TG_ARN=$(aws_ elbv2 describe-target-groups --names $APP-api --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo None)
  if [ "$TG_ARN" = None ]; then
    TG_ARN=$(aws_ elbv2 create-target-group --name $APP-api --protocol HTTP --port 8000 --vpc-id "$VPC" --target-type ip \
      --health-check-path /api/health --health-check-interval-seconds 15 --healthy-threshold-count 2 \
      --tags "$TAGS" --query 'TargetGroups[0].TargetGroupArn' --output text)
    aws_ elbv2 modify-target-group-attributes --target-group-arn "$TG_ARN" --attributes Key=deregistration_delay.timeout_seconds,Value=20 >/dev/null
  fi

  # A shared header proves a request came through our CloudFront distribution.
  ORIGIN_SECRET=$(grep '^ORIGIN_VERIFY=' "$SECRETS_FILE" | cut -d= -f2- || true)
  if [ -z "$ORIGIN_SECRET" ]; then
    ORIGIN_SECRET=$(python3 - "$SECRETS_FILE" <<'PY'
import secrets
import sys
from pathlib import Path

path = Path(sys.argv[1])
secret = secrets.token_urlsafe(32)
lines = [line for line in path.read_text().splitlines() if not line.startswith("ORIGIN_VERIFY=")]
path.write_text("\n".join(lines) + f"\nORIGIN_VERIFY={secret}\n")
print(secret)
PY
)
  fi
  LISTENER=$(aws_ elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --query 'Listeners[0].ListenerArn' --output text 2>/dev/null || echo None)
  if [ "$LISTENER" = None ]; then
    LISTENER=$(aws_ elbv2 create-listener --load-balancer-arn "$ALB_ARN" --protocol HTTP --port 80 \
      --default-actions 'Type=fixed-response,FixedResponseConfig={StatusCode=403,ContentType=text/plain,MessageBody=forbidden}' \
      --query 'Listeners[0].ListenerArn' --output text)
    aws_ elbv2 create-rule --listener-arn "$LISTENER" --priority 10 \
      --conditions "[{\"Field\":\"http-header\",\"HttpHeaderConfig\":{\"HttpHeaderName\":\"X-Origin-Verify\",\"Values\":[\"$ORIGIN_SECRET\"]}}]" \
      --actions "Type=forward,TargetGroupArn=$TG_ARN" >/dev/null
  fi
}

register_task_definition() {
  local supabase_url mcp_hosts
  supabase_url=$(grep '^SUPABASE_URL=' "$SECRETS_FILE" | cut -d= -f2-)
  mcp_hosts=${MCP_ALLOWED_HOSTS:-}
  if [ -n "${MCP_RESOURCE_URL:-}" ]; then
    local origin_host
    origin_host=$(aws_ elbv2 describe-load-balancers --names $APP-api --query 'LoadBalancers[0].DNSName' --output text)
    [[ "$origin_host" != None && -n "$origin_host" ]] || { echo "MCP requires the existing ALB hostname" >&2; return 2; }
    mcp_hosts="${mcp_hosts:+$mcp_hosts,}$origin_host"
  fi
  cat > /tmp/$APP-taskdef.json <<JSON
{
  "family": "$APP-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512", "memory": "1024",
  "runtimePlatform": {"cpuArchitecture": "ARM64", "operatingSystemFamily": "LINUX"},
  "executionRoleArn": "arn:aws:iam::$ACCOUNT:role/$APP-api-exec",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT:role/$APP-api-task",
  "containerDefinitions": [{
    "name": "api",
    "image": "$IMAGE",
    "essential": true,
    "portMappings": [{"containerPort": 8000, "protocol": "tcp"}],
    "environment": [
      {"name": "ENV", "value": "prod"},
      {"name": "AWS_REGION", "value": "$REGION"},
      {"name": "QURAN_S3_URI", "value": "s3://$QURAN_BUCKET/resources/quran/"},
      {"name": "BEDROCK_REGION", "value": "us-east-1"},
      {"name": "GUARDRAIL_ID", "value": "$GUARDRAIL_ID"},
      {"name": "GUARDRAIL_VERSION", "value": "$GUARDRAIL_VERSION"},
      {"name": "SUPABASE_URL", "value": "$supabase_url"},
      {"name": "ALLOWED_ORIGINS", "value": "$ALLOWED_ORIGINS"},
      {"name": "RAG_SERVICE_URL", "value": "$RAG_SERVICE_URL"},
      {"name": "AGENTS_SERVICE_URL", "value": "$AGENTS_SERVICE_URL"},
      {"name": "PUBLIC_API_RATE_PER_MINUTE", "value": "${PUBLIC_API_RATE_PER_MINUTE:-60}"},
      {"name": "PUBLIC_API_SERVICE_RATE_PER_MINUTE", "value": "${PUBLIC_API_SERVICE_RATE_PER_MINUTE:-500}"},
      {"name": "MCP_RESOURCE_URL", "value": "${MCP_RESOURCE_URL:-}"},
      {"name": "MCP_ALLOWED_HOSTS", "value": "$mcp_hosts"}
    ],
    "secrets": [{"name": "DATABASE_URL", "valueFrom": "$SECRET_ARN:DATABASE_URL::"}],
    "logConfiguration": {"logDriver": "awslogs", "options": {
      "awslogs-group": "/ecs/$APP-api", "awslogs-region": "$REGION", "awslogs-stream-prefix": "api"}}
  }]
}
JSON
  python3 - "/tmp/$APP-taskdef.json" <<'PYQUOTAS'
import json, os, sys
path = sys.argv[1]
with open(path) as stream:
    task = json.load(stream)
for name in ("TUTOR_RATE_PER_MINUTE", "TUTOR_TOKENS", "TUTOR_SECONDS", "TUTOR_MODEL_CALLS", "COURSE_SECONDS",
             "USER_DAILY_TOKENS", "SERVICE_DAILY_TOKENS", "SERVICE_RATE_PER_MINUTE",
             "BEDROCK_MODEL_ID"):
    if name in os.environ:
        task["containerDefinitions"][0]["environment"].append({"name": name, "value": os.environ[name]})
with open(path, "w") as stream:
    json.dump(task, stream)
PYQUOTAS
  TASK_DEFINITION_ARN=$(aws_ ecs register-task-definition --cli-input-json file:///tmp/$APP-taskdef.json --tags key=project,value=$APP \
    --query 'taskDefinition.taskDefinitionArn' --output text)
}

ensure_service() {
  log "ECS cluster, task definition, service"
  aws iam get-role --role-name AWSServiceRoleForECS >/dev/null 2>&1 ||
    aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com >/dev/null
  aws_ ecs describe-clusters --clusters $APP --query 'clusters[?status==`ACTIVE`].clusterName' --output text | grep -q $APP ||
    aws_ ecs create-cluster --cluster-name $APP --tags key=project,value=$APP >/dev/null
  aws_ logs create-log-group --log-group-name /ecs/$APP-api 2>/dev/null || true
  aws_ logs put-retention-policy --log-group-name /ecs/$APP-api --retention-in-days 14

  register_task_definition
  if aws_ ecs describe-services --cluster $APP --services $APP-api --query 'services[?status==`ACTIVE`].serviceName' --output text | grep -q $APP-api; then
    aws_ ecs update-service --cluster $APP --service $APP-api --task-definition "$TASK_DEFINITION_ARN" --force-new-deployment >/dev/null
  else
    aws_ ecs create-service --cluster $APP --service-name $APP-api --task-definition "$TASK_DEFINITION_ARN" --desired-count 1 \
      --launch-type FARGATE --platform-version LATEST \
      --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$TASK_SG],assignPublicIp=ENABLED}" \
      --load-balancers "targetGroupArn=$TG_ARN,containerName=api,containerPort=8000" \
      --health-check-grace-period-seconds 60 \
      --deployment-configuration 'deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100' \
      --tags key=project,value=$APP >/dev/null
  fi
  echo "waiting for service to stabilise…"
  aws_ ecs wait services-stable --cluster $APP --services $APP-api
}

ensure_cloudfront_route() {
  log "CloudFront /api/* -> ALB"
  aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/$APP-dist.json
  python3 - "$ALB_DNS" "$ORIGIN_SECRET" <<'PY'
import json, sys
alb, secret = sys.argv[1], sys.argv[2]
d = json.load(open("/tmp/yaqin-dist.json"))
cfg = d["DistributionConfig"]
viewer_requests = [item for item in cfg.get("DefaultCacheBehavior", {}).get("FunctionAssociations", {}).get("Items", [])
                   if item.get("EventType") == "viewer-request" and item.get("FunctionARN", "").endswith(":function/yaqin-index-rewrite")]
if len(viewer_requests) != 1:
    raise SystemExit("Publish and attach yaqin-index-rewrite to the default behavior before API routing")
origins = [o for o in cfg["Origins"]["Items"] if o["Id"] != "alb-api"]
origins.append({
    "Id": "alb-api", "DomainName": alb, "OriginPath": "",
    "CustomHeaders": {"Quantity": 1, "Items": [{"HeaderName": "X-Origin-Verify", "HeaderValue": secret}]},
    "CustomOriginConfig": {"HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "http-only",
                           "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
                           "OriginReadTimeout": 60, "OriginKeepaliveTimeout": 5},
    "ConnectionAttempts": 3, "ConnectionTimeout": 10,
    "OriginShield": {"Enabled": False}, "OriginAccessControlId": "",
})
cfg["Origins"] = {"Quantity": len(origins), "Items": origins}
paths = {"/api/*", "/.well-known/oauth-protected-resource/*"}
behaviors = [b for b in cfg.get("CacheBehaviors", {}).get("Items", []) if b["PathPattern"] not in paths]
behaviors.insert(0, {
    "PathPattern": "/api/*", "TargetOriginId": "alb-api", "ViewerProtocolPolicy": "https-only", "Compress": True,
    "AllowedMethods": {"Quantity": 7, "Items": ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
                       "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",          # CachingDisabled
    "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",  # AllViewerExceptHostHeader
    "SmoothStreaming": False, "FieldLevelEncryptionId": "",
    "LambdaFunctionAssociations": {"Quantity": 0},
    "FunctionAssociations": {"Quantity": 1, "Items": viewer_requests},
})
behaviors.insert(1, {**behaviors[0], "PathPattern": "/.well-known/oauth-protected-resource/*"})
cfg["CacheBehaviors"] = {"Quantity": len(behaviors), "Items": behaviors}
json.dump(cfg, open("/tmp/yaqin-dist-new.json", "w"))
PY
  local etag
  etag=$(python3 -c 'import json;print(json.load(open("/tmp/yaqin-dist.json"))["ETag"])')
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$etag" \
    --distribution-config file:///tmp/$APP-dist-new.json --query 'Distribution.Status' --output text
  aws cloudfront wait distribution-deployed --id "$DIST_ID"
}

retain_all() {
  # The account auto-deletes resources unless tagged auto-delete=no; keep everything in this project.
  log "Retention tag on all project resources"
  local r arns
  for r in "$REGION" us-east-1; do
    arns=$(aws --region "$r" resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=$APP \
      --query 'ResourceTagMappingList[].ResourceARN' --output text)
    [ -n "$arns" ] && echo "$arns" | tr '\t' '\n' | xargs -n 20 aws --region "$r" resourcegroupstaggingapi tag-resources \
      --tags auto-delete=no --query FailedResourcesMap --output text --resource-arn-list >/dev/null
  done
  return 0
}

case "${1:-all}" in
  routing)
    ALB_DNS=$(aws_ elbv2 describe-load-balancers --names $APP-api --query 'LoadBalancers[0].DNSName' --output text)
    ORIGIN_SECRET=$(grep '^ORIGIN_VERIFY=' "$SECRETS_FILE" | cut -d= -f2-)
    [[ "$ALB_DNS" != None && -n "$ORIGIN_SECRET" ]] || exit 2
    ensure_cloudfront_route
    ;;
  build)
    ensure_codebuild
    build_image
    # Reuse the stored DB secret, but apply the selected AI configuration and permissions.
    SECRET_ARN=$(aws_ secretsmanager describe-secret --secret-id "$APP/api" --query ARN --output text)
    ensure_task_roles
    register_task_definition
    aws_ ecs update-service --cluster $APP --service $APP-api --task-definition "$TASK_DEFINITION_ARN" --force-new-deployment >/dev/null
    aws_ ecs wait services-stable --cluster $APP --services $APP-api
    retain_all
    ;;
  all)
    ensure_ecr
    ensure_build_bucket
    ensure_codebuild
    build_image
    ensure_secret
    ensure_task_roles
    ensure_network
    ensure_alb
    ensure_service
    ensure_cloudfront_route
    retain_all
    ;;
  *) echo "usage: $0 [all|build|routing|package [absolute-zip-path]]" >&2; exit 2 ;;
esac

log "Done: https://$ORIGIN_DOMAIN/api/health"
