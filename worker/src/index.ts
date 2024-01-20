import apiConfig from './api-config.json';
import { pathsMatch } from './path-ops';


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Filter paths based on URL match
		var matchedPaths = apiConfig.paths.filter(item => pathsMatch(item.path, url.pathname));

		// First, try to find an exact method match
		var exactMethodMatch = matchedPaths.find(item => item.method === request.method);
		if (exactMethodMatch) 
			var matchedPath = exactMethodMatch;
		else
			// If no exact match, fallback to ANY method
			var matchedPath = matchedPaths.find(item => item.method === 'ANY');
		
		console.log(matchedPath);
		if (matchedPath) {
			if (matchedPath.integration) {
				console.log('type:' + matchedPath.integration.type);
				if (matchedPath.integration.type === 'http_proxy') {
					const server = apiConfig.servers.find((server) => server.alias === matchedPath?.integration?.server);
					console.log(server);
					const modifiedRequest = new Request(server?.url + url.pathname, request);
					return fetch(modifiedRequest);
				}
			} else {
				return new Response(JSON.stringify(matchedPath.response),{ headers: { 'Content-Type': 'application/json' }});
			}
		}

		return new Response(
			`No match found.`,
			{ headers: { 'Content-Type': 'text/plain' } }
		);
	},
};
