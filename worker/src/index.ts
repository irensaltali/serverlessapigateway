import apiConfig from './api-config.json';

// Export a default object containing event handlers
export default {
	// The fetch handler is invoked when this worker receives a HTTP(S) request
	// and should return a Response (optionally wrapped in a Promise)
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// You'll find it helpful to parse the request.url string into a URL object. Learn more at https://developer.mozilla.org/en-US/docs/Web/API/URL
		const url = new URL(request.url);

		var matchedPath = apiConfig.paths.find((item) => item.path === url.pathname);
		console.log(matchedPath);
		if (matchedPath) {
			console.log(matchedPath);
			if (matchedPath.integration) {
				console.log('type:'+matchedPath.integration.type);
				if (matchedPath.integration.type === 'http_proxy') {
					const server = apiConfig.servers.find((server) => server.alias === matchedPath?.integration?.server);
					console.log(server);
					const modifiedRequest = new Request(server?.url + url.pathname, request);
					return fetch(modifiedRequest);
				}
			} else {
				return new Response(JSON.stringify(matchedPath.response));
			}
		}

		return new Response(
			`Try making requests to:
      <ul>
      <li><code><a href="/redirect?redirectUrl=https://example.com/">/redirect?redirectUrl=https://example.com/</a></code>,</li>
      <li><code><a href="/proxy?modify&proxyUrl=https://example.com/">/proxy?modify&proxyUrl=https://example.com/</a></code>, or</li>
      <li><code><a href="/api/todos">/api/todos</a></code></li>`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	},
};
