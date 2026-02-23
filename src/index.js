import { safeStringify, generateJsonResponse } from "./common";
import { logger } from './utils/logger';
import { getApiConfig } from './utils/config';
const { jwtAuth } = await import('./auth');
const responses = await import('./responses');
const { ValueMapper } = await import('./mapping');
const { setCorsHeaders } = await import('./cors');
const { PathOperator } = await import('./path-ops');
const { AuthError, SAGError } = await import('./types/error_types');
const { setPoweredByHeader } = await import('./powered-by');
const { createProxiedRequest } = await import('./requests');
const { IntegrationTypeEnum } = await import('./enums/integration-type');
const { ServerlessAPIGatewayContext } = await import('./types/serverless_api_gateway_context');
const { auth0CallbackHandler, validateIdToken, getProfile, redirectToLogin, refreshToken } = await import('./integrations/auth0');
const { supabaseEmailOTP, supabasePhoneOTP, supabaseVerifyOTP, supabaseJwtVerify, supabaseEmailOTPAlternative } = await import('./integrations/supabase-auth');

function getBearerToken(request) {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.split(' ')[1];
}

export default {
	async fetch(request, env, ctx) {
		logger.info('Received new request', { method: request.method, url: request.url });
		const sagContext = new ServerlessAPIGatewayContext();
		try {
			logger.debug('Loading API configuration');
			sagContext.apiConfig = await getApiConfig(env);
			sagContext.requestUrl = new URL(request.url);

			// Handle CORS preflight (OPTIONS) requests directly
			if (sagContext.apiConfig.cors && request.method === 'OPTIONS') {
				logger.debug('Handling CORS preflight request');
				const matchedItem = sagContext.apiConfig.paths.find((item) => {
					const matchResult = PathOperator.match(item.path, sagContext.requestUrl.pathname, request.method, item.method);
					return item.method === 'OPTIONS' && matchResult.matchedCount > 0 && matchResult.methodMatches;
				});
				if (!matchedItem) {
					logger.debug('No specific OPTIONS handler found, using default CORS response');
					return setPoweredByHeader(setCorsHeaders(request, new Response(null, { status: 204 }), sagContext.apiConfig.cors));
				}
			}

			// Adjusted filtering based on the updated pathsMatch return value
			logger.debug('Matching request path against configured paths');
			const matchedPaths = sagContext.apiConfig.paths
				.map((config) => ({ config, matchResult: PathOperator.match(config.path, sagContext.requestUrl.pathname, request.method, config.method) }))
				.filter((item) => item.matchResult.matchedCount > 0 && item.matchResult.methodMatches);

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

			sagContext.matchedPath = matchedPath;

			if (matchedPath) {
				logger.info('Found matching path configuration', { 
					path: matchedPath.config.path, 
					method: matchedPath.config.method,
					integration: matchedPath.config.integration?.type 
				});

				// Check if the matched path requires authorization
				if (sagContext.apiConfig.authorizer && matchedPath.config.auth && sagContext.apiConfig.authorizer.type == 'jwt') {
					logger.debug('Validating JWT token');
					try {
						sagContext.jwtPayload = await jwtAuth(request, sagContext.apiConfig);
						logger.debug('JWT validation successful');
						} catch (error) {
							logger.error('JWT validation failed', error);
							if (error instanceof AuthError) {
							return setPoweredByHeader(
								setCorsHeaders(
									request,
									new Response(safeStringify({ error: error.message, code: error.code }), {
										status: error.statusCode,
										headers: { 'Content-Type': 'application/json' },
									}),
									sagContext.apiConfig.cors
								),
							);
							} else if (error instanceof SAGError) {
								return setPoweredByHeader(setCorsHeaders(request, error.toApiResponse(), sagContext.apiConfig.cors));
							} else {
							return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse(), sagContext.apiConfig.cors));
						}
					}
				} else if (sagContext.apiConfig.authorizer && matchedPath.config.auth && sagContext.apiConfig.authorizer.type == 'auth0') {
					logger.debug('Validating Auth0 token');
					try {
						sagContext.jwtPayload = await validateIdToken(request, null, sagContext.apiConfig.authorizer);
						logger.debug('Auth0 token validation successful');
						} catch (error) {
							logger.error('Auth0 token validation failed', error);
							if (error instanceof AuthError) {
							return setPoweredByHeader(
								setCorsHeaders(
									request,
									new Response(safeStringify({ error: error.message, code: error.code }), {
										status: error.statusCode,
										headers: { 'Content-Type': 'application/json' },
									}),
									sagContext.apiConfig.cors
								),
							);
							} else if (error instanceof SAGError) {
								return setPoweredByHeader(setCorsHeaders(request, error.toApiResponse(), sagContext.apiConfig.cors));
							} else {
							return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse(), sagContext.apiConfig.cors));
						}
					}
				} else if (sagContext.apiConfig.authorizer && matchedPath.config.auth && sagContext.apiConfig.authorizer.type == 'supabase') {
					logger.debug('Validating Supabase token');
					try {
						sagContext.jwtPayload = await supabaseJwtVerify(request, sagContext.apiConfig.authorizer);
						logger.debug('Supabase token validation successful');
						} catch (error) {
							logger.error('Supabase token validation failed', error);
							if (error instanceof AuthError) {
							return setPoweredByHeader(
								setCorsHeaders(
									request,
									new Response(safeStringify({ error: error.message, code: error.code }), {
										status: error.statusCode,
										headers: { 'Content-Type': 'application/json' },
									}),
									sagContext.apiConfig.cors
								),
							);
							} else if (error instanceof SAGError) {
								return setPoweredByHeader(setCorsHeaders(request, error.toApiResponse(), sagContext.apiConfig.cors));
							} else {
							return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse(), sagContext.apiConfig.cors));
						}
					}
				}

				// Preprocess logic
				if (matchedPath.config.integration && matchedPath.config.pre_process) {
					logger.debug('Executing pre-process logic');
					const service =
						sagContext.apiConfig.serviceBindings &&
						sagContext.apiConfig.serviceBindings.find((serviceBinding) => serviceBinding.alias === matchedPath.config.pre_process.binding);

						if (service) {
							const requestForHook = request.body ? (() => {
								const [body1, body2] = request.body.tee();
								request = new Request(request, { body: body2 });
								return new Request(request, { body: body1 });
							})() : request;
							let response = await env[service.binding][matchedPath.config.pre_process.function](requestForHook, safeStringify(env), safeStringify(sagContext));
							if (response !== true) {
								logger.debug('Pre-process returned non-true response, returning early');
								return setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors));
							}
						}
					}

				const isHttpProxyIntegration =
					matchedPath.config.integration &&
					(matchedPath.config.integration.type == IntegrationTypeEnum.HTTP_PROXY ||
						matchedPath.config.integration.type == IntegrationTypeEnum.HTTP);

				if (isHttpProxyIntegration) {
					logger.debug('Processing HTTP proxy integration');
					const server =
						sagContext.apiConfig.servers &&
						sagContext.apiConfig.servers.find((server) => server.alias === matchedPath.config.integration.server);
					if (server) {
						let modifiedRequest = createProxiedRequest(request, server, matchedPath.config);
						if (matchedPath.config.mapping) {
							logger.debug('Applying request mapping');
							modifiedRequest = await ValueMapper.modify({
								request: modifiedRequest,
								mappingConfig: matchedPath.config.mapping,
								jwtPayload: sagContext.jwtPayload,
								configVariables: matchedPath.config.variables,
								globalVariables: sagContext.apiConfig.variables,
							});
						}
						logger.debug('Forwarding request to target server');
						return fetch(modifiedRequest).then((response) => setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors)));
					}
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SERVICE) {
					logger.debug('Processing service integration');
					const service =
						sagContext.apiConfig.services &&
						sagContext.apiConfig.services.find((service) => service.alias === matchedPath.config.integration.binding);

					if (service) {
						const module = await import(`${service.entrypoint}.js`);
						const Service = module.default;
						const serviceInstance = new Service();
						const response = await serviceInstance.fetch(request, env, ctx);
						return setPoweredByHeader(setCorsHeaders(request, generateJsonResponse(response), sagContext.apiConfig.cors));
					}
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SERVICE_BINDING) {
					logger.debug('Processing service binding integration');
					const service =
						sagContext.apiConfig.serviceBindings &&
						sagContext.apiConfig.serviceBindings.find((serviceBinding) => serviceBinding.alias === matchedPath.config.integration.binding);

					if (service) {
						const response = await env[service.binding][matchedPath.config.integration.function](request, safeStringify(env), safeStringify(sagContext));
						return setPoweredByHeader(setCorsHeaders(request, generateJsonResponse(response), sagContext.apiConfig.cors));
					}
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0CALLBACK) {
					logger.debug('Processing Auth0 callback');
					const urlParams = new URLSearchParams(sagContext.requestUrl.search);
					const code = urlParams.get('code');

					const jwt = await auth0CallbackHandler(code, sagContext.apiConfig.authorizer);
					sagContext.jwtPayload = await validateIdToken(null, jwt.id_token, sagContext.apiConfig.authorizer);

					// Post-process logic
					if (matchedPath.config.integration.post_process) {
						logger.debug('Executing post-process logic');
						const postProcessConfig = matchedPath.config.integration.post_process;
						if (postProcessConfig.type === 'service_binding') {
							const postProcessService = sagContext.apiConfig.serviceBindings.find(
								(serviceBinding) => serviceBinding.alias === postProcessConfig.binding
							);
							if (postProcessService) {
								await env[postProcessService.binding][postProcessConfig.function](request, safeStringify(env), safeStringify(sagContext));
							}
						}
					}

					return setPoweredByHeader(setCorsHeaders(
						request,
						new Response(safeStringify(jwt), {
							status: 200,
							headers: { 'Content-Type': 'application/json' },
						}),
						sagContext.apiConfig.cors
					));
						} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0USERINFO) {
							logger.debug('Processing Auth0 userinfo request');
							const accessToken = request.headers.get('X-Access-Token') || getBearerToken(request);
						if (!accessToken) {
							return setPoweredByHeader(setCorsHeaders(
								request,
								new Response(safeStringify({ error: 'Missing bearer token', code: 'missing_access_token' }), {
									status: 401,
									headers: { 'Content-Type': 'application/json' },
								}),
								sagContext.apiConfig.cors
							));
						}

						return setPoweredByHeader(setCorsHeaders(
							request,
							await getProfile(accessToken, sagContext.apiConfig.authorizer),
							sagContext.apiConfig.cors
						));
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0CALLBACKREDIRECT) {
					logger.debug('Processing Auth0 callback redirect');
					const urlParams = new URLSearchParams(sagContext.requestUrl.search);
					return redirectToLogin({ state: urlParams.get('state') }, sagContext.apiConfig.authorizer);
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.AUTH0REFRESH) {
					logger.debug('Processing Auth0 token refresh');
					return this.refreshTokenLogic(request, env, sagContext);
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SUPABASEPASSWORDLESSAUTH) {
					logger.debug('Processing Supabase passwordless auth');
					const requestBody = await request.json();
					const email = requestBody.email;
					const phone = requestBody.phone;

					if (email) {
						const response = await supabaseEmailOTP(env, email)
						return setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors));
					} else if (phone) {
						const response = await supabasePhoneOTP(env, phone)
						return setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors));
						} else {
							logger.warn('Missing email or phone in Supabase passwordless auth request');
							return setPoweredByHeader(setCorsHeaders(
								request,
								new Response(safeStringify({ error: 'Missing email or phone', code: 'missing_email_or_phone' }), {
									status: 400,
									headers: { 'Content-Type': 'application/json' },
								}),
								sagContext.apiConfig.cors
							));
						}
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SUPABASEPASSWORDLESSVERIFY) {
					logger.debug('Processing Supabase passwordless verify');
					const requestBody = await request.json();
					const token = requestBody.token;
					const email = requestBody.email;
					const phone = requestBody.phone;

						if (!token || (!email && !phone)) {
							logger.warn('Missing token, email, or phone in Supabase passwordless verify request');
							return setPoweredByHeader(setCorsHeaders(
								request,
								new Response(safeStringify({ error: 'Missing token, email, or phone', code: 'missing_token_or_contact' }), {
									status: 400,
									headers: { 'Content-Type': 'application/json' },
								}),
								sagContext.apiConfig.cors
							));
						}

					const response = await supabaseVerifyOTP(env, email, phone, token);
					return setPoweredByHeader(setCorsHeaders(request,
						new Response(safeStringify(response), { status: 200, headers: { 'Content-Type': 'application/json' }, }),
						sagContext.apiConfig.cors
					));
				} else if (matchedPath.config.integration && matchedPath.config.integration.type == IntegrationTypeEnum.SUPABASEPASSWORDLESSAUTHALT) {
					logger.debug('Processing Supabase passwordless auth (alternative method)');
					const requestBody = await request.json();
					const email = requestBody.email;

					if (email) {
						const response = await supabaseEmailOTPAlternative(env, email)
						return setPoweredByHeader(setCorsHeaders(request, response, sagContext.apiConfig.cors));
						} else {
							logger.warn('Missing email in Supabase alternative auth request');
							return setPoweredByHeader(setCorsHeaders(
								request,
								new Response(safeStringify({ 
									error: 'Missing email - alternative method only supports email', 
									code: 'missing_email' 
								}), {
									status: 400,
									headers: { 'Content-Type': 'application/json' },
								}),
								sagContext.apiConfig.cors
							));
						}
				} else {
					logger.debug('Returning static response');
					return setPoweredByHeader(
						setCorsHeaders(
							request,
							new Response(safeStringify(matchedPath.config.response), { headers: { 'Content-Type': 'application/json' } }),
							sagContext.apiConfig.cors
						),
					);
				}
			}

			logger.warn('No matching path found for request');
			return setPoweredByHeader(setCorsHeaders(request, responses.noMatchResponse(), sagContext.apiConfig.cors));
		} catch (error) {
			logger.error('Error processing request', error);
			if (error instanceof AuthError || error instanceof SAGError) {
				return setPoweredByHeader(setCorsHeaders(request, error.toApiResponse(), sagContext?.apiConfig?.cors));
			} else {
				return setPoweredByHeader(setCorsHeaders(request, responses.internalServerErrorResponse(), sagContext?.apiConfig?.cors));
			}
		}
	},

	async refreshTokenLogic(request, env, sagContext) {
		logger.debug('Processing token refresh request');
		let refreshTokenParam = request.headers.get('X-Refresh-Token');
		if (!refreshTokenParam && request.method === 'POST') {
			try {
				const requestBody = await request.clone().json();
				refreshTokenParam = requestBody.refresh_token;
			} catch (_) {
				// Empty body or malformed JSON; handled below.
			}
		}

		if (!refreshTokenParam) {
			logger.warn('Missing refresh token in request');
			return setPoweredByHeader(setCorsHeaders(request,
				new Response(
					safeStringify({ error: 'Missing refresh token', code: 'missing_refresh_token' }),
						{ status: 400, headers: { 'Content-Type': 'application/json' } }
					),
					sagContext.apiConfig.cors));
		}

		try {
			sagContext.jwtPayload = await validateIdToken(request, null, sagContext.apiConfig.authorizer);
			logger.debug('Token is still valid');
			return setPoweredByHeader(setCorsHeaders(request,
				new Response(
					safeStringify({ message: 'Token is still valid', code: 'token_still_valid' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				),
				sagContext.apiConfig.cors));

		} catch (error) {
			if (error instanceof AuthError && error.code === 'ERR_JWT_EXPIRED') {
				logger.debug('Token expired, attempting refresh');
				try {
					const newTokens = await refreshToken(refreshTokenParam, sagContext.apiConfig.authorizer);
					logger.debug('Token refresh successful');
					return setPoweredByHeader(setCorsHeaders(
						request,
						new Response(safeStringify(newTokens), { status: 200, headers: { 'Content-Type': 'application/json' }, }),
						sagContext.apiConfig.cors
					));
				} catch (refreshError) {
					logger.error('Token refresh failed', refreshError);
					return setPoweredByHeader(setCorsHeaders(
						request,
						new Response(safeStringify({ error: refreshError.message, code: refreshError.code }), {
							status: refreshError.statusCode || 500, headers: { 'Content-Type': 'application/json' },
						}),
						sagContext.apiConfig.cors
					));
				}
			} else if (error instanceof SAGError) {
				logger.error('SAG error during token refresh', error);
				return setPoweredByHeader(setCorsHeaders(request, error.toApiResponse(), sagContext.apiConfig.cors));
			} else {
				logger.error('Unexpected error during token refresh', error);
				return setPoweredByHeader(
					setCorsHeaders(
						request, new Response(safeStringify({ error: error.message, code: error.code }), {
							status: error.statusCode || 500, headers: { 'Content-Type': 'application/json' },
						}),
						sagContext.apiConfig.cors
					));
			}
		}
	}
};
