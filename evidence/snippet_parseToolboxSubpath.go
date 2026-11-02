	// Expected format: /toolbox/<sandboxID>/<path>
	if path == "" {
		return "", "", "", errors.New("path is required")
	}

	if !strings.HasPrefix(path, "/toolbox/") {
		return "", "", "", errors.New("path must start with /toolbox/")
	}

	// Trim prefix and split by "/"
	parts := strings.SplitN(strings.TrimPrefix(path, "/toolbox/"), "/", 2)
	if len(parts) < 2 {
		return "", "", "", errors.New("path must be of format /toolbox/<sandboxId>/<path>")
	}

	sandboxID := parts[0]
	targetPath := "/" + parts[1]

	return TOOLBOX_PORT, sandboxID, targetPath, nil
}
