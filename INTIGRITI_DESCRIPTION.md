## Summary
On self-hosted `daytonaio/daytona` **v0.190.0**, organization **Viewer** members (no `write:sandboxes` / Developer assignment) can reach the full sandbox **toolbox** (process exec, filesystem, computer-use) through the **proxy** path `/toolbox/{sandboxId}/...`. The NestJS API `ToolboxController` correctly requires `WRITE_SANDBOXES`; the Go proxy Bearer check only calls `Preview.hasSandboxAccess`, which tests organization **membership** and ignores resource permissions. This is a within-org privilege escalation on the last public OSS tag.

## Local proof (authz-layer e2e, 2026-11-02)
Against real v0.190.0 source (`01c502bb`), with synthetic org/user data on localhost (no SaaS, no Docker runner):

| Check | Result |
|-------|--------|
| Same Viewer → API `ToolboxController` (real `OrganizationAuthContextGuard`) | **403** AccessDeniedException |
| Same Viewer → proxy gate `Preview.hasSandboxAccess` | **true / 200** |
| Same Viewer → real Go `Proxy.Authenticate` Bearer path (access gate 200) | **accepted**, Authorization stripped, would forward toolbox |
| Developer (`write:sandboxes`) on API | allowed |
| Outsider / access-gate 404 on proxy | denied |

Evidence package: `EVIDENCE_C130.tar.gz` (sha256 `cb0837e5de956eeeb473919c3dbb7dafe25aa455111fbaa5c926684998bac7a0`), includes NestJS + Go e2e specs/logs under `evidence/local-e2e/`.

## Important honesty note (live SaaS)
During product UI review on `app.daytona.io`, the invite/assignment copy for **Viewer** already describes running processes, R/W files, and terminal/desktop **inside sandboxes** as part of Viewer. We therefore treat live SaaS as potentially **by-design** or already redefined, and **did not** claim a SaaS runtime RCE. This report is scoped to the **public OSS artifact v0.190.0** (repo archived Jun 2026; core private), where API vs proxy still disagree. Please triage against self-hosted / last public release expectations and current SaaS policy.

## Steps to reproduce (self-hosted v0.190.0)
1. Create collaborative org; Owner creates sandbox S.
2. Invite User V as Member with **Viewer only** (uncheck Developer / no `write:sandboxes`).
3. As V: `GET /sandbox` → see S; confirm `POST /toolbox/{S}/process/execute` (API) returns **403** (missing WRITE_SANDBOXES).
4. As V: call proxy `{toolboxProxy}/toolbox/{S}/process/execute` with V's JWT → proxy membership gate **allows** (authz-layer proven locally; full runner optional).

Alternatively run the attached NestJS + Go local e2e specs against a checkout of tag `v0.190.0` (see `evidence/local-e2e/COMMANDS.txt`).

## Impact
Within-organization privilege escalation on self-hosted v0.190.0: documented read-only Viewer baseline → toolbox RCE/FS on peers' sandboxes via the proxy sibling path, while the API path correctly denies. Violates the documented assignment model in that release.

## Suggested fix
Align proxy toolbox Bearer authorization with `ToolboxController`: require `write:sandboxes` (or an equivalent toolbox permission) via the same org auth-context / resource-permission path, not membership-only `HasSandboxAccess`.

## Attachment
`EVIDENCE_C130.tar.gz` — static sibling proof, source snippets, local e2e specs + logs, report draft.
