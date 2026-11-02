const RUNNER_INFO_CACHE_PREFIX = 'proxy:sandbox-runner-info:'
const RUNNER_INFO_CACHE_TTL = 2 * 60 // 2 minutes

@Controller('toolbox')
@ApiTags('toolbox')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@ApiHeader(CustomHeaders.ORGANIZATION_ID)
@SkipThrottle({ anonymous: true, authenticated: true })
@AuthStrategy([AuthStrategyType.API_KEY, AuthStrategyType.JWT])
@UseGuards(OrganizationAuthContextGuard, SandboxAccessGuard)
@RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_SANDBOXES])
export class ToolboxController {
  private readonly logger = new Logger(ToolboxController.name)
  private readonly toolboxProxy: RequestHandler<
    RawBodyRequest<IncomingMessage>,
    ServerResponse<IncomingMessage>,
    NextFunction
  >
  private readonly toolboxStreamProxy: RequestHandler<
    RawBodyRequest<IncomingMessage>,
    ServerResponse<IncomingMessage>,
    NextFunction
  >

  constructor(
    private readonly toolboxService: ToolboxService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    const commonProxyOptions: Options = {
      router: async (req: RawBodyRequest<IncomingMessage>) => {
        // eslint-disable-next-line no-useless-escape
        const sandboxId = req.url.match(/^\/api\/toolbox\/([^\/]+)\/toolbox/)?.[1]
        try {
