import apiConfig from './api-config.json';
import { jwtAuth } from './auth';
import { pathsMatch } from './path-ops';
import { setCorsHeaders } from "./cors";
import { applyValueMapping } from "./mapping";


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Handle JWT Authorization
		const url = new URL(request.url);

		// Handle CORS preflight (OPTIONS) requests first
		if (apiConfig.cors && request.method === 'OPTIONS' && !apiConfig.paths.find(item => item.method === 'OPTIONS' && pathsMatch(item.path, url.pathname))) {
			return setCorsHeaders(new Response(null, { status: 204 }));
		}

		// Filter paths based on URL match
		const matchedPaths = apiConfig.paths.filter(item => pathsMatch(item.path, url.pathname));

		// Find the matched path
		const matchedPath = matchedPaths.find(item => item.method === request.method) || matchedPaths.find(item => item.method === 'ANY');

		if (matchedPath) {
			var jwtPayload = null;
			if (apiConfig.authorizer && matchedPath.auth) {
				jwtPayload= await jwtAuth(request);
				if (!jwtPayload.iss) {
					return setCorsHeaders(new Response(
						`Unauthorized.`,
						{ headers: { 'Content-Type': 'text/plain' }, status: 401 }
					));
				}
			}

			if (matchedPath.integration && matchedPath.integration.type === 'http_proxy') {
				const server = apiConfig.servers.find(server => server.alias === matchedPath.integration.server);
				if (server) {
					var modifiedRequest = new Request(server.url + url.pathname + url.search, request);
					if (matchedPath.mapping) {
						console.log('Applying mapping:', matchedPath.mapping);
						modifiedRequest = await applyValueMapping(modifiedRequest, matchedPath.mapping, jwtPayload, matchedPath.variables);
					}
					return fetch(modifiedRequest).then(response => setCorsHeaders(response));
				}
			} else {
				return setCorsHeaders(new Response(JSON.stringify(matchedPath.response), { headers: { 'Content-Type': 'application/json' } }));
			}
		}

		return setCorsHeaders(new Response(
			`No match found.`,
			{ headers: { 'Content-Type': 'text/plain' } }
		));
	}
};
