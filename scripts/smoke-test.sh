#!/usr/bin/env bash
#
# Post-deploy smoke test.
#
# Hits a deployed instance over HTTP and asserts the handful of things that
# must be true for a release to be considered good. It is deliberately fast
# and dependency-free (curl only) so it can run as the gate immediately after
# a deployment, while the previous version is still available to roll back to.
#
# Exit code is the contract: 0 = keep the release, non-zero = roll back.
#
# Usage: scripts/smoke-test.sh <base-url> [expected-environment]
# Env:   SMOKE_RETRIES (default 12), SMOKE_INTERVAL_SECONDS (default 5)

set -euo pipefail

BASE_URL="${1:-}"
EXPECTED_ENV="${2:-}"
RETRIES="${SMOKE_RETRIES:-12}"
INTERVAL="${SMOKE_INTERVAL_SECONDS:-5}"

if [[ -z "${BASE_URL}" ]]; then
  echo "usage: $0 <base-url> [expected-environment]" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"
FAILURES=0

log() { printf '%s\n' "$*"; }

# Waits for the service to answer its health check at all. A new deployment is
# not expected to be reachable instantly, so this step retries; every check
# after it is a single-shot assertion.
wait_for_health() {
  local attempt=1
  while ((attempt <= RETRIES)); do
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL}/healthz" || echo 000)"
    if [[ "${code}" == "200" ]]; then
      log "  health check returned 200 after ${attempt} attempt(s)"
      return 0
    fi
    log "  attempt ${attempt}/${RETRIES}: /healthz returned ${code}, retrying in ${INTERVAL}s"
    sleep "${INTERVAL}"
    ((attempt++))
  done
  return 1
}

# check <name> <path> <grep-pattern>
check() {
  local name="$1" path="$2" pattern="$3" body
  if ! body="$(curl -sS --fail --max-time 10 "${BASE_URL}${path}" 2>&1)"; then
    log "  FAIL ${name}: request to ${path} failed: ${body}"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if ! grep -q "${pattern}" <<<"${body}"; then
    log "  FAIL ${name}: response from ${path} did not match /${pattern}/"
    log "       body: ${body}"
    FAILURES=$((FAILURES + 1))
    return
  fi
  log "  PASS ${name}"
}

log "smoke test against ${BASE_URL}"

log "[1/4] waiting for liveness"
if ! wait_for_health; then
  log "  FAIL service never became healthy within $((RETRIES * INTERVAL))s"
  exit 1
fi

log "[2/4] readiness"
check "readiness reports ready" "/readyz" '"status":"ready"'

if [[ -n "${EXPECTED_ENV}" ]]; then
  log "[3/4] deployed environment is ${EXPECTED_ENV}"
  check "environment matches" "/readyz" "\"environment\":\"${EXPECTED_ENV}\""
else
  log "[3/4] environment assertion skipped (no expected environment given)"
fi

log "[4/4] a real business endpoint serves data"
check "plan catalogue is served" "/api/v1/plans" '"enterprise"'

if ((FAILURES > 0)); then
  log ""
  log "SMOKE TEST FAILED (${FAILURES} check(s) failed) — the release should be rolled back"
  exit 1
fi

log ""
log "SMOKE TEST PASSED — release is good"
