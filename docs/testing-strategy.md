# Testing strategy

The pipeline in this repo is only as good as the tests it gates on. This
document describes what each layer of testing is responsible for, what the
coverage gate actually enforces, and why the production smoke test is treated
as a separate concern from the test suite.

## The three layers

| Layer | Location | What it proves | Runs in |
| --- | --- | --- | --- |
| Unit | `app/tests/unit/` | The business logic is correct in isolation | PR checks, promotion preflight |
| Integration | `app/tests/integration/` | The running service behaves correctly over HTTP | DEV deploy, PR coverage run |
| Smoke | `scripts/smoke-test.sh` | *This* deployment, in *this* environment, is serving correctly | After every DEV deploy and every promotion |

### Unit tests — the money path

`app/src/lib/pricing.js` is the part of this application that would cost real
money if it were wrong: plan catalogue, seat overage, volume discount tiers,
annual discounting, mid-cycle proration and tax. It has no I/O, so it is tested
directly and exhaustively, including:

- every discount tier boundary (9 vs 10 seats, 49 vs 50, 99 vs 100)
- annual billing charging ten periods rather than twelve
- tax applied *after* the proration credit, not before
- a proration credit that exceeds the new charge flooring the invoice at zero
  rather than going negative
- every rejected input path (bad seat counts, seat ceilings, unknown plans,
  invalid periods, out-of-range tax rates)

`app/src/lib/validation.js` and `app/src/lib/store.js` are covered the same way:
request parsing is tested by asserting *which* fields are reported invalid, not
just that something failed, because a validation error that names the wrong
field is a real bug that a boolean assertion would miss.

Unit tests are the fast feedback loop — the whole suite runs in well under a
second, so there is no incentive to skip them locally.

### Integration tests — over real HTTP

The integration suite does not mount the Express app in-process. It starts the
real server on an ephemeral port and talks to it with `fetch`:

```js
const server = app.listen(0, '127.0.0.1');
const res = await fetch(`http://127.0.0.1:${port}/api/v1/subscriptions`, ...);
```

That matters because it exercises the things an in-process test silently skips:
JSON body parsing and its failure mode, status codes, `Location` headers, the
404 handler, the `x-powered-by` suppression, and the central error translator
that turns domain errors into 4xx responses. A test that calls the handler
function directly proves none of that.

The suite covers a full resource lifecycle — create, read, filter, patch,
delete, and then 404 on the deleted resource — plus the error contract:
422 with per-field details for validation failures, 400 for domain errors like
exceeding a plan's seat ceiling, 400 for malformed JSON.

### Smoke tests — is *this deployment* good?

The smoke test is not part of the test suite and deliberately does not import
the application. It is a black-box check that runs against a deployed URL after
a release, using nothing but `curl`, and its exit code is the release decision:

- **0** — keep the release
- **non-zero** — roll back

It checks four things, in order:

1. **Liveness, with retries.** A new deployment is not reachable instantly, so
   `/healthz` is polled with backoff until it answers 200 or the budget runs
   out. This is the only step that retries.
2. **Readiness.** `/readyz` reports `status: ready` and the state of its
   dependencies.
3. **The right thing was deployed.** `/readyz` reports the environment it
   believes it is running in, and the smoke test asserts that it matches the
   environment being promoted to. This catches the genuinely dangerous mistake
   of shipping a UAT-configured build to PROD.
4. **A real business endpoint serves data.** `/api/v1/plans` returns the plan
   catalogue. A process that starts and passes its health check but cannot
   serve an actual request is exactly the failure a health check alone misses.

## The coverage gate

Configured in `app/jest.config.js`:

```js
coverageThreshold: {
  global:                 { statements: 80, branches: 80, functions: 80, lines: 80 },
  './src/lib/pricing.js': { statements: 95, branches: 95, functions: 95, lines: 95 },
}
```

`npm run test:coverage` exits non-zero when either bar is missed, which fails
the PR check, which blocks the merge.

**Why two tiers rather than one number.** A single global threshold lets
well-covered boilerplate subsidise poorly covered business logic; you can sit
at a comfortable 85% overall while the pricing engine is at 50%. Holding the
money path to 95% separately means the number that matters cannot be diluted by
the number that doesn't.

**Why 80% and not 100%.** 80% is high enough to catch a genuinely untested
change and low enough that nobody games it by writing assertion-free tests to
clear the bar. Chasing 100% pushes people toward testing generated code and
defensive branches that cannot occur, which adds maintenance cost without
adding confidence.

**What the gate does and does not prove.** Coverage measures which lines ran,
not whether the assertions were meaningful. It is a floor, not a goal: it
reliably catches "this pull request added a module and no tests," and it does
not catch "these tests assert the wrong thing." That is what code review is
for. The gate exists so review time is spent on whether the tests are *good*
rather than on whether they *exist*.

**Branch coverage is included on purpose.** Statement coverage alone is easy to
satisfy while never testing an error path. Requiring 80% branch coverage
globally, and 95% on the pricing engine, forces the failure modes to be
exercised — which is why every `throw` in the pricing module has a test.

### Verifying the gate is real

A gate nobody has seen fail is an assumption. To confirm this one:

```bash
cd app
mv tests/unit/pricing.test.js /tmp/           # remove coverage of the money path
npm run test:coverage; echo "exit: $?"        # every test passes, exit 1
mv /tmp/pricing.test.js tests/unit/           # restore
npm run test:coverage; echo "exit: $?"        # exit 0
```

The first run reports `Tests: 45 passed` and still exits 1, with:

```
Jest: "./src/lib/pricing.js" coverage threshold for branches (95%) not met: 66.66%
```

That is the gate doing its job: passing tests are not sufficient.

## Terraform validation as a test

`scripts/validate-terraform.sh <env>` treats infrastructure configuration as
something to be tested, not just formatted:

1. `terraform fmt -recursive -check` — formatting is canonical
2. `terraform validate` — the configuration is internally consistent
3. `terraform console -var-file=environments/<env>.tfvars` — the environment's
   actual values are loaded and every `validation { }` block on every root and
   module input variable is evaluated against them

Step 3 is the part that makes this environment-specific. `terraform validate`
on its own never reads a tfvars file, so it cannot tell you that `prod.tfvars`
sets an illegal Fargate CPU value or a log retention period CloudWatch will
reject. The `validation` blocks in `terraform/variables.tf` and the module
variable files encode those constraints, and this step is where they fire.

This is verifiable the same way as the coverage gate: change `task_cpu` in
`environments/dev.tfvars` to `999` and the script exits 1, naming the
validation rule that rejected it.

A live pipeline would go one step further and run `terraform plan
-var-file=...` as the real gate, which additionally resolves data sources and
provider schemas. That needs AWS credentials, so it is out of scope here — see
the README for what changes in a real deployment.

## What is deliberately not tested

- **Load and performance.** A real pipeline would run a load test against UAT
  before promoting to PROD. Out of scope for a pipeline demonstration.
- **Persistence.** The store is in-memory. A real service would have repository
  contract tests running against a real database in CI.
- **Provisioning.** No `terraform apply` runs anywhere in this repo, so nothing
  asserts that the infrastructure actually converges. In a live setup that
  assertion is the DEV deploy itself: apply, then smoke test.
