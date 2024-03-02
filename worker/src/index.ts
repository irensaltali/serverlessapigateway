import apiConfig from './api-config.json';
import { jwtAuth, AuthError } from './auth';
import { setCorsHeaders } from "./cors";
import { applyValueMapping } from "./mapping";
import { setPoweredByHeader } from "./powered-by";
import { pathsMatch, createProxiedRequest } from './path-ops';
import * as responses from './responses';


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight (OPTIONS) requests directly
		if (apiConfig.cors && request.method === 'OPTIONS') {
			const matchedItem = apiConfig.paths.find(item => {
				const matchResult = pathsMatch(item.path, url.pathname, request.method, item.method);
				return item.method === 'OPTIONS' && matchResult?.matchedCount > 0 && matchResult.methodMatches;
			});
			if (!matchedItem) {
				console.log('Handling CORS preflight request');
				return setPoweredByHeader(setCorsHeaders(request, new Response(null, { status: 204 })));
			}
		}

		// Adjusted filtering based on the updated pathsMatch return value
		const matchedPaths = apiConfig.paths
			.map(config => ({ ...config, matchResult: pathsMatch(config.path, url.pathname, request.method, config.method) }))
			.filter(item => item.matchResult.matchedCount > 0 && item.matchResult.methodMatches); // Only consider matches with the correct method

		console.log('Matched paths:', matchedPaths);

		// Sorting with priority: exact matches > parameterized matches > wildcard matches
		const matchedPath = matchedPaths.sort((a, b) => {
			// Prioritize exact matches
			if (a.matchResult.isExact !== b.matchResult.isExact) {
				return a.matchResult.isExact ? -1 : 1;
			}
			// Among exact or parameterized matches, prioritize those with more matched segments
			if (a.matchResult.matchedCount !== b.matchResult.matchedCount) {
				return b.matchResult.matchedCount - a.matchResult.matchedCount;
			}
			// If both are parameterized, prioritize non-wildcard over wildcard
			if (a.matchResult.isWildcard !== b.matchResult.isWildcard) {
				return a.matchResult.isWildcard ? 1 : -1;
			}
			// Prioritize exact method matches over "ANY"
			if (a.method !== b.method) {
				if (a.method === request.method) return -1;
				if (b.method === request.method) return 1;
			}
			return 0; // Equal priority
		})[0];

		console.log('Matched path:', matchedPath);

		if (matchedPath) {
			var jwtPayload = {};
			if (apiConfig.authorizer && matchedPath.auth) {
				try {
					jwtPayload = await jwtAuth(request);
				} catch (error) {
					if (error instanceof AuthError) {
						return setPoweredByHeader(setCorsHeaders(request, new Response(JSON.stringify({ error: error.message, code: error.code }), {
							status: error.statusCode,
							headers: { 'Content-Type': 'application/json' }
						})));
					} else {
						console.error('Error during JWT verification:', error);
						return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse()));
					}
				}
			}

			if (matchedPath.integration && matchedPath.integration.type.includes('http')) {
				const server = apiConfig.servers.find(server => server.alias === matchedPath.integration.server);
				if (server) {
					var modifiedRequest = createProxiedRequest(request, server, matchedPath);
					// console.log('Modified request:', modifiedRequest);
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

		return setPoweredByHeader(setCorsHeaders(request, responses.noMatchResponse()));
	}
};
