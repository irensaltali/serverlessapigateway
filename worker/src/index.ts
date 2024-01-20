import apiConfig from './api-config.json';
import './path-ops';
import { pathsMatch } from './path-ops';


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		var matchedPath = apiConfig.paths.find((item) => pathsMatch(item.path, url.pathname) && item.method === request.method);
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
				return new Response(JSON.stringify(matchedPath.response));
			}
		}

		return new Response(
			`No match found.`,
			{ headers: { 'Content-Type': 'text/plain' } }
		);
	},
};
