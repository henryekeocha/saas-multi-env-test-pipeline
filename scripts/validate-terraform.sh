#!/usr/bin/env bash
#
# Validates the Terraform configuration for one environment WITHOUT touching
# AWS. Safe to run offline and with no credentials configured.
#
# It performs three checks:
#   1. `terraform fmt -check`      — formatting is canonical
#   2. `terraform validate`        — the configuration itself is internally
#                                    consistent (this step is variable-agnostic:
#                                    Terraform does not read tfvars here)
#   3. `terraform console`         — the environment's tfvars file is actually
#                                    loaded and every `validation { }` block on
#                                    every root and module input variable is
#                                    evaluated against its real value
#
# Step 3 is what makes this "validate against dev.tfvars" rather than just
# "validate the config". A full `terraform plan -var-file=...` would go further
# still (it also resolves data sources and provider schemas) but needs AWS
# credentials, so it belongs in a real pipeline rather than in this demo.
#
# Usage: scripts/validate-terraform.sh <dev|uat|prod>

set -euo pipefail

ENVIRONMENT="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform"

if [[ ! "${ENVIRONMENT}" =~ ^(dev|uat|prod)$ ]]; then
  echo "usage: $0 <dev|uat|prod>" >&2
  exit 2
fi

VAR_FILE="environments/${ENVIRONMENT}.tfvars"

if [[ ! -f "${TF_DIR}/${VAR_FILE}" ]]; then
  echo "error: ${VAR_FILE} not found" >&2
  exit 1
fi

cd "${TF_DIR}"

echo "==> [${ENVIRONMENT}] terraform fmt -check"
terraform fmt -recursive -check

echo "==> [${ENVIRONMENT}] terraform init -backend=false"
terraform init -backend=false -input=false -no-color >/dev/null

echo "==> [${ENVIRONMENT}] terraform validate"
terraform validate -no-color

echo "==> [${ENVIRONMENT}] evaluating ${VAR_FILE} against variable validation rules"
# `terraform console` exits 0 even when evaluation fails, so its diagnostics are
# captured and inspected rather than relied on via the exit status.
CONSOLE_OUTPUT="$(echo 'var.environment' |
  terraform console -no-color -input=false -var-file="${VAR_FILE}" 2>&1 || true)"

if grep -q '^Error:' <<<"${CONSOLE_OUTPUT}"; then
  echo "${CONSOLE_OUTPUT}" >&2
  echo "error: ${VAR_FILE} failed variable validation" >&2
  exit 1
fi

RESOLVED="$(grep -o '"[a-z]*"' <<<"${CONSOLE_OUTPUT}" | tail -n 1 | tr -d '"')"
if [[ "${RESOLVED}" != "${ENVIRONMENT}" ]]; then
  echo "${CONSOLE_OUTPUT}" >&2
  echo "error: ${VAR_FILE} sets environment='${RESOLVED}', expected '${ENVIRONMENT}'" >&2
  exit 1
fi

echo "==> [${ENVIRONMENT}] OK — config valid and tfvars accepted by every validation rule"
