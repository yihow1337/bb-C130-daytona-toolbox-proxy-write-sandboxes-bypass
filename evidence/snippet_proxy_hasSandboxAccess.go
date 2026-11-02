func (p *Proxy) hasSandboxAccess(ctx context.Context, sandboxId string, authToken string) (bool, error) {
	apiClient := p.getUserApiClient(ctx, authToken)

	_, res, err := apiClient.PreviewAPI.HasSandboxAccess(context.Background(), sandboxId).Execute()
	if res != nil && res.StatusCode == http.StatusOK {
		return true, nil
	}
	openapiErr := common_errors.ConvertOpenAPIError(err)

	if openapiErr != nil {
		if res != nil && res.StatusCode >= 400 && res.StatusCode < 500 &&
			res.StatusCode != http.StatusRequestTimeout && res.StatusCode != http.StatusTooManyRequests {
			return false, nil
		}
		if !common_errors.IsRetryableOpenAPIError(openapiErr) {
			return false, &utils.NonRetryableError{Err: openapiErr}
		}

		return false, openapiErr
	}

	return false, nil
}
