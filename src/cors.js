function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMatchingOrigin(requestOrigin, allowedOrigins) {
	if (!requestOrigin || !Array.isArray(allowedOrigins)) {
		return null;
	}

	for (const allowedOrigin of allowedOrigins) {
		if (allowedOrigin === requestOrigin || allowedOrigin === '*') {
			return allowedOrigin;
		}

		if (allowedOrigin.includes('*')) {
			const pattern = `^${allowedOrigin.split('*').map(escapeRegExp).join('.*')}$`;
			if (new RegExp(pattern).test(requestOrigin)) {
				return requestOrigin;
			}
		}
	}

	return null;
}

function setCorsHeaders(request, response, corsConfig) {
	if (!corsConfig) {
		return response;
	}

	const origin = request.headers.get('Origin');
	const matchingOrigin = getMatchingOrigin(origin, corsConfig.allow_origins);
	const headers = new Headers(response.headers);

	if (matchingOrigin) {
		const allowCredentials = Boolean(corsConfig.allow_credentials);
		const allowOriginValue = matchingOrigin === '*' && allowCredentials ? origin : matchingOrigin;
		headers.set('Access-Control-Allow-Origin', allowOriginValue);
		headers.set('Vary', 'Origin');
	}

	headers.set('Access-Control-Allow-Methods', (corsConfig.allow_methods || []).join(','));
	headers.set('Access-Control-Allow-Headers', (corsConfig.allow_headers || []).join(','));
	headers.set('Access-Control-Expose-Headers', (corsConfig.expose_headers || []).join(','));
	headers.set('Access-Control-Allow-Credentials', Boolean(corsConfig.allow_credentials).toString());
	headers.set('Access-Control-Max-Age', String(corsConfig.max_age || 0));

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export { setCorsHeaders };
