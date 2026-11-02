/*
 * C130 LOCAL END-TO-END AUTHORIZATION PROOF (synthetic data only)
 *
 * Proves at RUNTIME (executing the real v0.190.0 guard + controller code) that an
 * organization Member with Viewer-only access (no `write:sandboxes`) is:
 *   (A) DENIED on the API ToolboxController path (OrganizationAuthContextGuard -> AccessDeniedException / 403)
 *   (B) ALLOWED by PreviewController.hasSandboxAccess (the SOLE gate the proxy /toolbox/{id}/... Bearer path relies on)
 *
 * Same synthetic Viewer identity is used on both sides. Negative controls included.
 * No network, no DB, no runner, no production/SaaS. All data synthetic.
 */
import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ToolboxController } from './toolbox.deprecated.controller'
import { PreviewController } from './preview.controller'
import { OrganizationAuthContextGuard } from '../../organization/guards/organization-auth-context.guard'
import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'
import { OrganizationMemberRole } from '../../organization/enums/organization-member-role.enum'
import { AccessDeniedException } from '../../common/exceptions/access-denied.exception'

const ORG_ID = 'org-c130-synthetic'
const SANDBOX_ID = 'sbx-c130-owned-by-owner'
const VIEWER_USER_ID = 'user-c130-viewer'
const OUTSIDER_USER_ID = 'user-c130-outsider'

// Viewer = org Member with NO assigned roles (baseline). Developer role would carry write:sandboxes.
const viewerMember = { role: OrganizationMemberRole.MEMBER, userId: VIEWER_USER_ID, assignedRoles: [] as any[] }
const developerMember = {
  role: OrganizationMemberRole.MEMBER,
  userId: 'user-c130-dev',
  assignedRoles: [{ permissions: [OrganizationResourcePermission.WRITE_SANDBOXES] }],
}

function makeGuard(orgUser: any): OrganizationAuthContextGuard {
  const redis: any = { get: async () => null, set: async () => 'OK' }
  const organizationService: any = { findOne: async () => ({ id: ORG_ID }) }
  const organizationUserService: any = { findOne: async () => orgUser }
  return new OrganizationAuthContextGuard(redis, organizationService, organizationUserService, new Reflector())
}

function toolboxCtx(userId: string): ExecutionContext {
  const request: any = {
    params: { organizationId: ORG_ID },
    user: { role: 'user', userId, email: `${userId}@synthetic.test` },
  }
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}), getNext: () => ({}) }),
    getClass: () => ToolboxController,
    getHandler: () => (ToolboxController.prototype as any).getWorkDir,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as any,
    switchToWs: () => ({}) as any,
  } as any
}

function makePreview(exists: boolean): PreviewController {
  const redis: any = { get: async () => null, setex: async () => 'OK' }
  const sandboxService: any = { findOne: async () => ({ organizationId: ORG_ID }) }
  const organizationUserService: any = { exists: async () => exists }
  return new PreviewController(redis, sandboxService, organizationUserService)
}

describe('[C130] API ToolboxController (write:sandboxes) vs proxy gate PreviewController.hasSandboxAccess (membership)', () => {
  it('(A) NEGATIVE: Viewer member is DENIED on API ToolboxController path (403)', async () => {
    const guard = makeGuard(viewerMember)
    let caught: any
    try {
      await guard.canActivate(toolboxCtx(VIEWER_USER_ID))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ForbiddenException)
    expect(caught).toBeInstanceOf(AccessDeniedException)
    expect(caught.getStatus()).toBe(403)
    // eslint-disable-next-line no-console
    console.log(`[C130][A] API ToolboxController + Viewer -> ${caught.constructor.name} status=${caught.getStatus()} (DENIED, expected)`)
  })

  it('(B) POSITIVE: SAME Viewer member is ALLOWED by PreviewController.hasSandboxAccess (proxy sole gate)', async () => {
    const preview = makePreview(true) // organizationUserService.exists -> member of org
    const req: any = { user: { userId: VIEWER_USER_ID } }
    const result = await preview.hasSandboxAccess(req, SANDBOX_ID)
    expect(result).toBe(true)
    // eslint-disable-next-line no-console
    console.log(`[C130][B] Proxy gate PreviewController.hasSandboxAccess + SAME Viewer -> ${result} (ALLOWED => proxy forwards toolbox)`)
  })

  it('(control-1) Developer member (has write:sandboxes) is ALLOWED on API ToolboxController path', async () => {
    const guard = makeGuard(developerMember)
    await expect(guard.canActivate(toolboxCtx(developerMember.userId))).resolves.toBe(true)
    // eslint-disable-next-line no-console
    console.log('[C130][control-1] API ToolboxController + Developer -> allowed (proves guard really enforces write:sandboxes)')
  })

  it('(control-2) Non-member outsider is DENIED by PreviewController.hasSandboxAccess (404)', async () => {
    const preview = makePreview(false) // not a member of org
    const req: any = { user: { userId: OUTSIDER_USER_ID } }
    await expect(preview.hasSandboxAccess(req, SANDBOX_ID)).rejects.toBeInstanceOf(NotFoundException)
    // eslint-disable-next-line no-console
    console.log('[C130][control-2] Proxy gate + outsider -> NotFound (proves gate really checks membership)')
  })
})
