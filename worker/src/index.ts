import apiConfig from './api-config.json';
import { jwtAuth } from './auth';
import { setCorsHeaders } from "./cors";
import { applyValueMapping } from "./mapping";
import { setPoweredByHeader } from "./powered-by";
import { pathsMatch, createProxiedRequest } from './path-ops';
import * as responses from './responses';


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight (OPTIONS) requests first
		if (apiConfig.cors && request.method === 'OPTIONS' && !apiConfig.paths.find(item => item.method === 'OPTIONS' && pathsMatch(item.path, url.pathname))) {
			return setPoweredByHeader(setCorsHeaders(request, new Response(null, { status: 204 })));
		}


		// Filter paths based on URL match and select the one with the most matched segments
		const matchedPaths = apiConfig.paths
			.map(item => ({ ...item, matchLength: pathsMatch(item.path, url.pathname) }))
			.filter(item => item.matchLength > 0);

		// Find the matched path with the most segments matching
		const matchedPath = matchedPaths.sort((a, b) => b.matchLength - a.matchLength)[0];
		console.log('Matched path:', matchedPath);

		if (matchedPath) {
			var jwtPayload = {};
			if (apiConfig.authorizer && matchedPath.auth) {
				jwtPayload = await jwtAuth(request);
				if (!jwtPayload.iss) {
					return setPoweredByHeader(setCorsHeaders(request, responses.unauthorizedResponse));
				}
			}

			if (matchedPath.integration && matchedPath.integration.type.includes('http')) {
				const server = apiConfig.servers.find(server => server.alias === matchedPath.integration.server);
				if (server) {
					var modifiedRequest = createProxiedRequest(request, server, matchedPath);
					console.log('Modified request:', modifiedRequest);
					if (matchedPath.mapping) {
						console.log('Applying mapping:', matchedPath.mapping);
						modifiedRequest = await applyValueMapping(modifiedRequest, matchedPath.mapping, jwtPayload, matchedPath.variables);
					}
					return fetch(modifiedRequest).then(response => setPoweredByHeader(setCorsHeaders(request, response)));
				}
			} else {
				return setPoweredByHeader(setCorsHeaders(request, new Response(JSON.stringify(matchedPath.response), { headers: { 'Content-Type': 'application/json' } })));
			}
		}

		return setPoweredByHeader(setCorsHeaders(request, responses.noMatchResponse));
	}
};
