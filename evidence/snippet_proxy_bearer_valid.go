func (p *Proxy) getSandboxBearerTokenValid(ctx context.Context, sandboxId string, bearerToken string) (*bool, error) {
	apiValidation := func() (bool, error) {
		return p.hasSandboxAccess(ctx, sandboxId, bearerToken)
	}

	return p.validateAndCache(ctx, sandboxId, bearerToken, apiValidation)
}
