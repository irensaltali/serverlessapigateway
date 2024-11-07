function setCorsHeaders(request, response, corsConfig) {
	const origin = request.headers.get('Origin');
	const matchingOrigin = corsConfig.allow_origins.find((allowedOrigin) => allowedOrigin === origin);

	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', matchingOrigin || corsConfig.allow_origins[0]);
	headers.set('Access-Control-Allow-Methods', corsConfig.allow_methods.join(','));
	headers.set('Access-Control-Allow-Headers', corsConfig.allow_headers.join(','));
	headers.set('Access-Control-Expose-Headers', corsConfig.expose_headers.join(','));
	headers.set('Access-Control-Allow-Credentials', corsConfig.allow_credentials.toString());
	headers.set('Access-Control-Max-Age', corsConfig.max_age.toString());

	const newResponse = new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: headers,
	});
	return newResponse;
}

export { setCorsHeaders };
