function isWildcardPath(configPath) {
	return typeof configPath === 'string' && configPath.endsWith('/{.+}');
}

function stripWildcardSuffix(configPath) {
	return configPath.slice(0, -5);
}

function resolveProxyPath(configPath, requestPath) {
	if (!isWildcardPath(configPath)) {
		return requestPath;
	}

	const basePath = stripWildcardSuffix(configPath);
	if (!basePath || basePath === '/') {
		return requestPath;
	}

	if (requestPath === basePath) {
		return '/';
	}

	if (requestPath.startsWith(`${basePath}/`)) {
		return requestPath.slice(basePath.length) || '/';
	}

	return requestPath;
}

function joinTargetUrl(serverUrl, proxyPath, search) {
	const targetUrl = new URL(serverUrl);
	const basePath = targetUrl.pathname.replace(/\/+$/, '');
	const normalizedProxyPath = proxyPath.startsWith('/') ? proxyPath : `/${proxyPath}`;
	const combinedPath = `${basePath}${normalizedProxyPath}`.replace(/\/{2,}/g, '/');

	targetUrl.pathname = combinedPath;
	targetUrl.search = search;

	return targetUrl.toString();
}

// Function to create a new request based on the matched path and server
function createProxiedRequest(request, server, matchedPath) {
	const requestUrl = new URL(request.url);
	const proxyPath = resolveProxyPath(matchedPath.path, requestUrl.pathname);
	const targetUrl = joinTargetUrl(server.url, proxyPath, requestUrl.search);

	return new Request(targetUrl, request);
}

export { createProxiedRequest };
