const { jwtAuth } = await import('./auth');
const responses = await import('./responses');
const { ValueMapper } = await import('./mapping');
const { setCorsHeaders } = await import('./cors');
const { PathOperator } = await import('./path-ops');
const { AuthError } = await import('./types/error_types');
const { setPoweredByHeader } = await import('./powered-by');
const { createProxiedRequest } = await import('./requests');
const { IntegrationTypeEnum } = await import('./enums/integration-type');
const { auth0CallbackHandler, validateIdToken, getProfile, redirectToLogin } = await import('./integrations/auth0');
const { ServerlessAPIGatewayContext } = await import('./types/serverless_api_gateway_context');


export default {
	async fetch(request, env, ctx) {
		const sagContext = new ServerlessAPIGatewayContext();
		sagContext.apiConfig = await this.getApiConfig(env);
		sagContext.requestUrl = new URL(request.url);

		// Handle CORS preflight (OPTIONS) requests directly
		if (sagContext.apiConfig.cors && request.method === 'OPTIONS') {
			const matchedItem = sagContext.apiConfig.paths.find((item) => {
				const matchResult = PathOperator.match(item.path, sagContext.requestUrl.pathname, request.method, item.method);
				return item.method === 'OPTIONS' && matchResult.matchedCount > 0 && matchResult.methodMatches;
			});
			if (!matchedItem) {
				return setPoweredByHeader(setCorsHeaders(request, new Response(null, { status: 204 }), sagContext.apiConfig.cors));
			}
		}

		// Adjusted filtering based on the updated pathsMatch return value
		const matchedPaths = sagContext.apiConfig.paths
			.map((config) => ({ config, matchResult: PathOperator.match(config.path, sagContext.requestUrl.pathname, request.method, config.method) }))
			.filter((item) => item.matchResult.matchedCount > 0 && item.matchResult.methodMatches); // Only consider matches with the correct method



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
			if (a.config.method !== b.config.method) {
				if (a.config.method === request.method) return -1;
				if (b.config.method === request.method) return 1;
			}
			return 0; // Equal priority
		})[0];

		if (matchedPath) {
			// Check if the matched path requires authorization
			if (sagContext.apiConfig.authorizer && matchedPath.config.auth && sagContext.apiConfig.authorizer.type == 'jwt') {
				try {
					sagContext.jwtPayload = await jwtAuth(request, sagContext.apiConfig);
				} catch (error) {
					if (error instanceof AuthError) {
						return setPoweredByHeader(
							setCorsHeaders(
								request,
								new Response(JSON.stringify({ error: error.message, code: error.code }), {
									status: error.statusCode,
									headers: { 'Content-Type': 'application/json' },
								}),
								sagContext.apiConfig.cors
							),
						);
					} else {
						return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse(), sagContext.apiConfig.cors));
					}
				}
			}
			else if (sagContext.apiConfig.authorizer && matchedPath.config.auth && sagContext.apiConfig.authorizer.type == 'auth0') {
				try {
					sagContext.jwtPayload = await validateIdToken(request, sagContext.apiConfig.authorizer);
				} catch (error) {
					if (error instanceof AuthError) {
						return setPoweredByHeader(
							setCorsHeaders(
								request,
								new Response(JSON.stringify({ error: error.message, code: error.code }), {
									status: error.statusCode,
									headers: { 'Content-Type': 'application/json' },
								}),
								sagContext.apiConfig.cors
							),
						);
					} else {
						return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse(), sagContext.apiConfig.cors));
					}
				}
			}
			
			if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.HTTP_PROXY) {
				const server =
					sagContext.apiConfig.servers &&
					sagContext.apiConfig.servers.find((server) => server.alias === matchedPath.config.integration.server);
				if (server) {
					let modifiedRequest = createProxiedRequest(request, server, matchedPath.config);
					if (matchedPath.config.mapping) {
						modifiedRequest = await ValueMapper.modify({
							request: modifiedRequest,
							mappingConfig: matchedPath.config.mapping,
							jwtPayload: sagContext.jwtPayload,
							configVariables: matchedPath.config.variables,
							globalVariables: sagContext.apiConfig.variables,
						});
					}
					return fetch(modifiedRequest).then((response) => setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors)));
				}
			} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SERVICE) {
				const service =
					sagContext.apiConfig.services &&
					sagContext.apiConfig.services.find((service) => service.alias === matchedPath.config.integration.binding);

				if (service) {
					const module = await import(`${service.entrypoint}.js`);
					const Service = module.default;
					const serviceInstance = new Service();
					const response = serviceInstance.fetch(request, env, ctx);
					return setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors));
				}
			} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SERVICE_BINDING) {
				const service =
					sagContext.apiConfig.serviceBindings &&
					sagContext.apiConfig.serviceBindings.find((serviceBinding) => serviceBinding.alias === matchedPath.config.integration.binding);

				if (service) {
					const response = await env[service.binding][matchedPath.config.integration.function](request, env, ctx, sagContext);
					return setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors));
				}
			} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0CALLBACK) {
				const urlParams = new URLSearchParams(sagContext.requestUrl.search);
				const code = urlParams.get('code');

				return auth0CallbackHandler(code, sagContext.apiConfig.authorizer);
			} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0USERINFO) {
				const urlParams = new URLSearchParams(sagContext.requestUrl.search);
				const accessToken = urlParams.get('access_token');

				return getProfile(accessToken, sagContext.apiConfig.authorizer);
			} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0CALLBACKREDIRECT) {
				const urlParams = new URLSearchParams(sagContext.requestUrl.search);
				return redirectToLogin({ state: urlParams.get('state') }, sagContext.apiConfig.authorizer);
			} else {
				return setPoweredByHeader(
					setCorsHeaders(
						request,
						new Response(JSON.stringify(matchedPath.config.response), { headers: { 'Content-Type': 'application/json' } }),
						sagContext.apiConfig.cors
					),
				);
			}
		}

		return setPoweredByHeader(setCorsHeaders(request, responses.noMatchResponse(), sagContext.apiConfig.cors));
	},

	async getApiConfig(env) {
		let apiConfig;
		try {
			if (typeof env.CONFIG === 'undefined' || await env.CONFIG.get("api-config.json") === null) {
				apiConfig = await import('./api-config.json');
			} else {
				apiConfig = JSON.parse(await env.CONFIG.get("api-config.json"));
			}
		} catch (e) {
			console.error('Error loading API configuration', e);
			return setPoweredByHeader(request, responses.configIsMissingResponse());
		}

		// Replace environment variables and secrets in the API configuration
		apiConfig = await ValueMapper.replaceEnvAndSecrets(apiConfig, env);

		return apiConfig;
	},
};
