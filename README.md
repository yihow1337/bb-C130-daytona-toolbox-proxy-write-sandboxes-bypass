# C130 — Daytona Viewer/Member bypasses WRITE_SANDBOXES via proxy toolbox sibling path

**Status:** CONFIRMED (static + LOCAL RUNTIME e2e) — SUBMITTING to Intigriti (owner approved 2026-11-02)  
**Platform / program:** Intigriti — Daytona Bug Bounty (`daytona/daytonabugbounty`) €200–€3,500  
**Also in SECURITY.md scope:** Authentication/authorization privilege escalation; public daytonaio repos; app.daytona.io API  
**Asset:** `daytonaio/daytona` @ tag `v0.190.0` (`01c502bb`) — last public self-hostable release (main archived Jun 2026; core moved private; tag remains the public OSS artifact)  
**Class:** Sibling-endpoint authorization inconsistency (CWE-863 / CWE-269)  
**Severity:** High — org Viewer (no `write:sandboxes`) → full sandbox toolbox RCE/FS via proxy  
**Fingerprint:** TARGET=daytonaio/daytona@v0.190.0 | COMPONENT=apps/proxy Authenticate + Preview.hasSandboxAccess vs ToolboxController | ENTRY=GET/POST proxy `/toolbox/{sandboxId}/...` with Viewer JWT/API key | SINK=runner toolbox (execute/FS/computer-use) | ROOT CAUSE=proxy Bearer validation uses membership-only HasSandboxAccess while API ToolboxController requires WRITE_SANDBOXES | CWE-863/269 | IMPACT=within-org priv-esc to code exec on peers' sandboxes | PREREQ=org Member with Viewer-only assignments (no Developer/WRITE_SANDBOXES)

## Sibling diff (raised bar)

| Path | AuthN | AuthZ |
|------|-------|-------|
| API `ToolboxController` (`/toolbox/:sandboxId/...`) | JWT/API key | `OrganizationAuthContextGuard` + `SandboxAccessGuard` + **`WRITE_SANDBOXES`** (class-level) |
| Proxy `/toolbox/:sandboxId/...` | Bearer JWT/API key | `Authenticate` → `getSandboxBearerTokenValid` → **`PreviewAPI.HasSandboxAccess`** → only `organizationUserService.exists(orgId, userId)` — **no permission check** |

Upstream docs: Members' resource access is based on Assignments; **Viewer (required)** is read-only baseline; **Developer** grants create sandboxes (`write:sandboxes`).

## Attack (ordinary low-priv)

1. Attacker invited as Member with Viewer only (Developer unchecked) — realistic org practice for auditors/guests.  
2. List sandboxes (`GET /sandbox`) — no WRITE required.  
3. Obtain toolbox proxy base (`GET /sandbox/:id/toolbox-proxy-url` — also no WRITE) or use known proxy host.  
4. Call `{toolboxProxyUrl}/{sandboxId}/process/execute` (etc.) with Viewer Bearer token.  
5. Proxy authenticates via HasSandboxAccess (membership) and forwards to runner toolbox with runner API key → command execution / FS on victim sandbox.

## Proof

- **LOCAL RUNTIME e2e PASS** (see LOCAL E2E RESULTS): NestJS 4/4 + Go proxy 2/2.
- Upstream auth unit specs already encode the gap: `toolbox.deprecated.controller.auth.spec.ts` asserts WRITE_SANDBOXES; `preview.controller.auth.spec.ts` asserts `hasSandboxAccess` has **empty** auth-context guards.  
- Static sibling proof: `evidence/STATIC_SIBLING_PROOF.txt` OVERALL PASS.  
- Snippets under `evidence/snippet_*`.

## Novelty (2026-11-02)

- Distinct from public issue #5147 (non-canonical port string auth bypass on **public** sandboxes).  
- No CVE/GHSA found for WRITE_SANDBOXES vs HasSandboxAccess membership-only toolbox path.  
- Unknown High sibling authz as of this review.

## Fix

Proxy Bearer validation for toolbox (and preferably all non-public preview toolbox ports) must enforce the same `write:sandboxes` (or a dedicated toolbox permission) as `ToolboxController`, e.g. call an API that runs `OrganizationAuthContextGuard` + `RequiredOrganizationResourcePermissions([WRITE_SANDBOXES])` + `SandboxAccessGuard`, not membership-only `HasSandboxAccess`.



## LOCAL E2E RESULTS (2026-11-02 Asia/Taipei)

**Verdict: PASS (authz-layer end-to-end)** — full runner/sandbox stack not required; both halves of the sibling gate were executed against the real v0.190.0 source.

| Half | What ran | Result |
|------|----------|--------|
| (A) API negative | Real `OrganizationAuthContextGuard` against real `ToolboxController` metadata with synthetic Viewer (Member, `assignedRoles=[]`, no `write:sandboxes`) | **403 AccessDeniedException** |
| (B) Proxy positive | Real `PreviewController.hasSandboxAccess` (membership-only) with SAME Viewer | **true / 200** |
| (B′) Proxy Authenticate | Real Go `Proxy.Authenticate` Bearer path; mocked API access gate returning 200 | **accepted Viewer Bearer**, Authorization stripped, will forward toolbox |
| control-1 | Developer (`write:sandboxes`) on API Toolbox path | allowed |
| control-2 | Outsider / access-gate 404 on proxy | denied |

**Exact environment**
- Target: `daytonaio/daytona` tag `v0.190.0` commit `01c502bb1f1ff8f2885d0cd490e043736083dca8`
- Node v24.22.1 / yarn 4.13.0 / Go 1.27.3 linux/amd64
- Commands: see `evidence/local-e2e/COMMANDS.txt`
- Logs: `evidence/local-e2e/nestjs-authz-e2e-run.log`, `evidence/local-e2e/proxy-authz-e2e-run.log`
- Specs: `evidence/local-e2e/c130.local-e2e.authz.spec.ts`, `evidence/local-e2e/c130_local_e2e_test.go`

**What this proves / does not prove**
- PROVES: at v0.190.0 the API toolbox write-permission gate and the proxy membership-only gate disagree for the same Viewer identity; the proxy will accept that Viewer's Bearer and forward toolbox.
- DOES NOT prove live SaaS (`app.daytona.io`): public repo archived Jun 2026; product UI/docs for Viewer now describe process/FS as in-role. Local inconsistency remains in the last public OSS tag; SaaS may have closed it or redefined Viewer by design.
- No Docker/full runner was available on the box; authz-layer runtime with mocked runner/API is the farthest honest e2e without spinning production-like infra.

## Holds / submit

Owner approved Intigriti submit 2026-11-02 (local e2e + SaaS Viewer honesty). Holds unchanged: C30, C75/C76, C128, C129.
