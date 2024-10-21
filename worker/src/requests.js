// Function to create a new request based on the matched path and server
function createProxiedRequest(request, server, matchedPath) {
	const requestUrl = new URL(request.url);
	let newPath = '';

	if (matchedPath.integration && matchedPath.integration.type === 'http_proxy') {
		// For 'http_proxy', use the original path without the matching part
		const matchedPathPart = matchedPath.path.replace('{.+}', '');
		newPath = requestUrl.pathname.replace(matchedPathPart, '/');
		console.log('New path:', newPath);
	}

	// Create the new request with the updated URL
	const newRequest = new Request(server.url + newPath + requestUrl.search, request);
	return newRequest;
}

export { createProxiedRequest };
