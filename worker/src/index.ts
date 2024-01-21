import apiConfig from './api-config.json';
import { pathsMatch } from './path-ops';
import { setCorsHeaders } from "./cors";


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Filter paths based on URL match
		const matchedPaths = apiConfig.paths.filter(item => pathsMatch(item.path, url.pathname));

		// Find the matched path
		const matchedPath = matchedPaths.find(item => item.method === request.method) || matchedPaths.find(item => item.method === 'ANY');

		if (matchedPath) {
			if (matchedPath.integration && matchedPath.integration.type === 'http_proxy') {
				const server = apiConfig.servers.find(server => server.alias === matchedPath.integration.server);
				if (server) {
					const modifiedRequest = new Request(server.url + url.pathname, request);
					return fetch(modifiedRequest).then(response => setCorsHeaders(response));
				}
			} else {
				return setCorsHeaders(new Response(JSON.stringify(matchedPath.response), { headers: { 'Content-Type': 'application/json' } }));
			}
		}

		// If no match found, but cors is enabled, return cors headers and 204
		if (apiConfig.cors && request.method === 'OPTIONS') {
			return setCorsHeaders(new Response(null, { status: 204 }));
		}

		return setCorsHeaders(new Response(
			`No match found.`,
			{ headers: { 'Content-Type': 'text/plain' } }
		));
	}
};
