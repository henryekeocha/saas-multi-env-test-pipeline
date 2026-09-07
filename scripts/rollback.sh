#!/usr/bin/env bash
#
# Rollback trigger, invoked when the post-deploy smoke test fails.
#
# SAFETY: this script is DRY RUN by default and this demo repo never sets
# DRY_RUN=false in CI, so it only ever prints the commands it would run. In a
# real pipeline you would drop the guard and give the job an AWS role.
#
# The rollback itself is simple because ECS keeps every task definition
# revision: point the service back at the previous revision and wait for it to
# reach a steady state. Note that ECS's own deployment circuit breaker
# (enabled in terraform/modules/app-environment) already covers the case where
# new tasks never become healthy — this script covers the nastier case where
# tasks come up healthy but the application is behaving wrongly, which only an
# external smoke test can detect.
#
# Usage: scripts/rollback.sh <environment> [cluster] [service]

set -euo pipefail

ENVIRONMENT="${1:-}"
DRY_RUN="${DRY_RUN:-true}"
PROJECT="${PROJECT:-saas-demo}"
CLUSTER="${2:-${PROJECT}-${ENVIRONMENT}-cluster}"
SERVICE="${3:-${PROJECT}-${ENVIRONMENT}-api}"

if [[ ! "${ENVIRONMENT}" =~ ^(dev|uat|prod)$ ]]; then
  echo "usage: $0 <dev|uat|prod> [cluster] [service]" >&2
  exit 2
fi

run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

echo "!! ROLLBACK TRIGGERED for ${ENVIRONMENT}"
echo "   cluster=${CLUSTER} service=${SERVICE} dry_run=${DRY_RUN}"
echo ""
echo "1. Identify the previous task definition revision"
run aws ecs describe-services --cluster "${CLUSTER}" --services "${SERVICE}" \
  --query 'services[0].taskDefinition' --output text

echo "2. Point the service back at the last known-good revision"
run aws ecs update-service --cluster "${CLUSTER}" --service "${SERVICE}" \
  --task-definition "${SERVICE}:<previous-revision>" --force-new-deployment

echo "3. Wait for the service to stabilise on the rolled-back revision"
run aws ecs wait services-stable --cluster "${CLUSTER}" --services "${SERVICE}"

echo "4. Re-run the smoke test against the rolled-back release"
run scripts/smoke-test.sh "<service-url>" "${ENVIRONMENT}"

echo ""
if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Dry run only — no AWS API calls were made."
fi
