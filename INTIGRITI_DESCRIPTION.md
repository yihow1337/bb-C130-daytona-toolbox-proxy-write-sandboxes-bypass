## Summary
Organization **Viewer** members (no `write:sandboxes` assignment) can execute the full sandbox **toolbox** (process exec, filesystem, computer-use) through the **proxy** `/toolbox/{sandboxId}/...` path. The API toolbox controller correctly requires `WRITE_SANDBOXES`; the proxy Bearer check only calls `Preview.hasSandboxAccess`, which tests organization membership and ignores resource permissions.

## Steps to reproduce (self-hosted v0.190.0 or equivalent)
1. Create collaborative org; Owner creates sandbox S.  
2. Invite User V as Member with **Viewer only** (uncheck Developer).  
3. As V: `GET /sandbox` → see S; confirm `POST /toolbox/{S}/process/execute` returns 403 (missing WRITE_SANDBOXES).  
4. As V: obtain toolbox proxy URL; `POST {proxy}/toolbox/{S}/process/execute` with V's JWT → **succeeds**.  

## Impact
Within-organization privilege escalation: read-only Viewer → RCE/FS on any sandbox in the org. Violates documented assignment model.

## Fix
Align proxy toolbox Bearer authorization with `ToolboxController` permission requirements.
