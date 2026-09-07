# Pipeline flow

How a change travels from a pull request to production, and what has to be
true at each step before it is allowed to continue.

## The whole path

```mermaid
flowchart TD
    A["Developer opens a pull request"] --> B["<b>pr-checks.yml</b><br/>lint + unit tests<br/>+ coverage gate<br/>+ terraform validate (dev, uat, prod)"]
    B -->|any check fails| B1["Merge blocked<br/>fix and push again"]
    B1 --> B
    B -->|all checks pass| C["Merge to main"]

    C --> D["<b>deploy-dev.yml</b> (automatic)"]
    D --> D1["Integration tests<br/>against a running instance"]
    D1 --> D2["Smoke test /healthz, /readyz,<br/>/api/v1/plans"]
    D2 --> D3["terraform validate<br/>against dev.tfvars"]
    D3 -->|any step fails| D4["DEV deployment fails<br/>commit is not promotable"]
    D3 -->|all pass| E["DEV is green<br/>commit eligible for promotion"]

    E --> F["<b>promote.yml</b><br/>manually dispatched<br/>environment = uat"]
    F --> F1["Preflight:<br/>full suite + coverage gate<br/>+ terraform validate (uat)"]
    F1 --> G{"GitHub Environment <b>uat</b><br/>required reviewer"}
    G -->|rejected| G1["Promotion stops"]
    G -->|approved| H["Deploy to UAT"]
    H --> I["Post-deploy smoke test"]
    I -->|fails| I1["Rollback to previous release"]
    I -->|passes| J["UAT signed off by QA"]

    J --> K["<b>promote.yml</b><br/>manually dispatched<br/>environment = prod"]
    K --> K1["Preflight:<br/>full suite + coverage gate<br/>+ terraform validate (prod)"]
    K1 --> L{"GitHub Environment <b>prod</b><br/>required reviewer"}
    L -->|rejected| L1["Promotion stops"]
    L -->|approved| M["Record current release<br/>as the rollback target"]
    M --> N["Deploy to PROD"]
    N --> O["Post-deploy smoke test"]
    O -->|fails| P["<b>Automatic rollback</b><br/>restore previous task definition<br/>+ re-run smoke test"]
    O -->|passes| Q["Release kept"]

    classDef gate fill:#fff4e5,stroke:#d97706,color:#7c2d12
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef good fill:#dcfce7,stroke:#16a34a,color:#14532d
    class G,L gate
    class B1,D4,G1,L1,I1,P bad
    class E,J,Q good
```

## Walkthrough

### 1. Pull request — nothing merges unreviewed or untested

Opening a PR against `main` runs **`.github/workflows/pr-checks.yml`**:

- `npm run lint` — ESLint over the whole app
- `npm run test:unit` — the fast unit suite, for quick feedback
- `npm run test:coverage` — the whole suite with Jest's coverage thresholds
  applied. Jest exits non-zero when coverage drops below 80% overall or 95% on
  the pricing module, which fails the job even though every test passed.
- `terraform fmt -check` and `terraform validate` for **all three** environments
  in parallel, so a change that would break the PROD configuration is caught on
  the PR rather than at promotion time.

A final `pr-gate` job depends on all of the above; that is the single check to
mark as required in branch protection.

### 2. Merge to main — DEV deploys automatically

Merging runs **`.github/workflows/deploy-dev.yml`**. DEV has no approval gate:
it is the environment that exists to tell you whether `main` is deployable.

- The integration suite starts the real Express app on an ephemeral port and
  drives it over HTTP — real status codes, real JSON, real error paths.
- `scripts/smoke-test.sh` then runs against a separately started instance, the
  same script a live pipeline would point at the DEV load balancer.
- `scripts/validate-terraform.sh dev` validates the configuration and evaluates
  `environments/dev.tfvars` against every variable validation rule.

If all of that passes, the commit is eligible for promotion. If any of it
fails, the commit is not — there is no way to promote past a red DEV.

### 3. Promotion to UAT — first human gate

**`.github/workflows/promote.yml`** is dispatched manually with
`environment: uat`. Two things happen in order:

1. **Preflight**, before any approval is requested: the full test suite with
   the coverage gate, plus `terraform validate` against `uat.tfvars`. Nobody
   should be asked to approve a promotion that cannot succeed.
2. **The approval gate.** The `promote` job declares
   `environment: ${{ inputs.environment }}`. With required reviewers configured
   on the `uat` GitHub Environment, the job pauses here until a named human
   approves it.

After approval the release is deployed and the post-deploy smoke test runs.
UAT is intentionally shaped like PROD — private subnets behind NAT, more than
one task, autoscaling enabled — so QA is signing off on something
representative rather than on a toy.

### 4. Promotion to PROD — second human gate plus a safety net

The same workflow with `environment: prod`, so the same preflight and the same
approval mechanism, this time against the `prod` GitHub Environment. Two extra
things matter here:

- **The rollback target is recorded before anything changes.** The job captures
  the currently deployed task definition revision first, so the rollback path
  is known-good rather than reconstructed under pressure.
- **The smoke test is the release decision.** It polls `/healthz` until the new
  tasks answer, asserts `/readyz` reports the expected environment, and checks
  that a real business endpoint serves data. A non-zero exit fails the job and
  runs `scripts/rollback.sh`, which points the ECS service back at the previous
  revision, waits for it to stabilise, and re-runs the smoke test against the
  restored release.

There are two independent rollback mechanisms, covering different failures:

| Failure | Caught by | Mechanism |
| --- | --- | --- |
| New tasks never become healthy | AWS | ECS deployment circuit breaker (`deployment_circuit_breaker { rollback = true }`) reverts the service automatically |
| Tasks are healthy but the app is wrong | The pipeline | Smoke test fails → `scripts/rollback.sh` restores the previous task definition |

The first is infrastructure-level and needs no pipeline at all. The second is
the one that catches a bad release that technically starts up fine — a broken
pricing calculation, a missing environment variable, a dependency that is
reachable in UAT but not in PROD.

## What runs where

| Stage | Trigger | Approval | Tests run | Terraform |
| --- | --- | --- | --- | --- |
| PR checks | `pull_request` | none | lint, unit, full suite + coverage gate | `fmt -check` + `validate` for dev, uat, prod |
| DEV | push to `main` | none | integration, smoke | `validate` against `dev.tfvars` |
| UAT | manual dispatch | required reviewer | full suite + coverage gate, smoke | `validate` against `uat.tfvars` |
| PROD | manual dispatch | required reviewer | full suite + coverage gate, smoke | `validate` against `prod.tfvars` |

## Where this repo stops

Everything above runs for real in GitHub Actions except the deployment itself.
No AWS credentials are configured, `terraform apply` is never invoked, and no
resources are created. The steps that would deploy print the exact commands a
live pipeline would run; the test, validation, approval, smoke-test and
rollback machinery around them is genuine.
