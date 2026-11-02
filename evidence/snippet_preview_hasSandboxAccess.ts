  @Get(':sandboxId/access')
  @ApiOperation({
    summary: 'Check if user has access to the sandbox',
    operationId: 'hasSandboxAccess',
  })
  @ApiResponse({
    status: 200,
    description: 'User access status to the sandbox',
    type: Boolean,
  })
  @AuthStrategy([AuthStrategyType.API_KEY, AuthStrategyType.JWT])
  async hasSandboxAccess(@Req() req: Request, @Param('sandboxId') sandboxId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const userId = req.user?.userId

    const cached = await this.redis.get(`preview:access:${sandboxId}:${userId}`)
    if (cached) {
      if (cached === '1') {
        return true
      }
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }

    const sandbox = await this.sandboxService.findOne(sandboxId)
    const hasAccess = await this.organizationUserService.exists(sandbox.organizationId, userId)
    if (!hasAccess) {
      await this.redis.setex(`preview:access:${sandboxId}:${userId}`, 3, '0')
      throw new NotFoundException(`Sandbox with ID ${sandboxId} not found`)
    }
    //  if user has access, keep it in cache longer
    await this.redis.setex(`preview:access:${sandboxId}:${userId}`, 30, '1')
    return true
  }
