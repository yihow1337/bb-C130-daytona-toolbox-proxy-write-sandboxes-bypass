func (p *Proxy) Authenticate(ctx *gin.Context, sandboxIdOrSignedToken string, port float32) (sandboxId string, didRedirect bool, err error) {
	var authErrors []string

	// Try Authorization header with Bearer token
	bearerToken := p.getBearerToken(ctx)
	if bearerToken != "" {
		isValid, err := p.getSandboxBearerTokenValid(ctx, sandboxIdOrSignedToken, bearerToken)
		if err != nil {
			authErrors = append(authErrors, fmt.Sprintf("Bearer token validation error: %v", err))
		} else if isValid != nil && *isValid {
			// If authentication successful, remove the Authorization header to prevent it from being forwarded to the sandbox
			ctx.Request.Header.Del("Authorization")
			return sandboxIdOrSignedToken, false, nil
		} else {
			authErrors = append(authErrors, "Bearer token is invalid")
		}
	}

	// Try auth key from header
