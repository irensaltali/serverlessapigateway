export class ValueMapper {
	static async modify(incoming) {
		let newRequest = incoming.request.clone();
		const url = new URL(newRequest.url);
		const searchParams = new URLSearchParams(url.searchParams);

		// Apply mappings to headers
		if (incoming.mappingConfig.headers) {
			const newHeaders = new Headers(newRequest.headers);

			for (const [key, value] of Object.entries(incoming.mappingConfig.headers)) {
				const resolvedValue = this.resolveValue(
					String(value),
					incoming.request,
					incoming.jwtPayload,
					incoming.configVariables,
					incoming.globalVariables,
				);
				if (resolvedValue !== null) {
					newHeaders.set(key, resolvedValue);
				}
			}

			newRequest = new Request(newRequest, { headers: newHeaders });
		}

		// Apply mappings to query parameters
		if (incoming.mappingConfig.query) {
			for (const [key, value] of Object.entries(incoming.mappingConfig.query)) {
				const resolvedValue = this.resolveValue(
					String(value),
					incoming.request,
					incoming.jwtPayload,
					incoming.configVariables,
					incoming.globalVariables,
				);
				if (resolvedValue !== null) {
					searchParams.set(key, resolvedValue);
				}
			}

			url.search = searchParams.toString();
			newRequest = new Request(url.toString(), newRequest);
		}

		return newRequest;
	}
	static resolveValue(
		template,
		request,
		jwtPayload,
		configVariables,
		globalVariables,
	) {
		try {
			const templateMatcher = /\$(request\.header|request\.jwt|config|request\.query)\.([a-zA-Z0-9-_.]+)/g;
			const match = templateMatcher.exec(template);

				if (match) {
					switch (match[1]) {
						case 'request.header':
							return request && request.headers ? request.headers.get(match[2]) : null;
					case 'request.jwt':
						return jwtPayload && jwtPayload.hasOwnProperty(match[2]) ? jwtPayload[match[2]] : null;
					case 'config':
						return configVariables && configVariables.hasOwnProperty(match[2])
							? configVariables[match[2]]
							: globalVariables && globalVariables.hasOwnProperty(match[2])
								? globalVariables[match[2]]
								: null;
					case 'request.query':
						const url = new URL(request.url);
						return url.searchParams.get(match[2]) || null;
					default:
						return null;
				}
			}
		} catch (error) {
			console.error(error);
		}

		return null;
	}

	static async replaceEnvAndSecrets(config, env) {
		// Helper function to recursively traverse the object
		function traverse(obj) {
			for (const key in obj) {
				if (typeof obj[key] === 'object' && obj[key] !== null) {
					// Recursively call traverse for nested objects
					traverse(obj[key]);
				} else if (typeof obj[key] === 'string') {
					// Replace environment variables
					if (obj[key].startsWith('$env.')) {
						const varName = obj[key].substring(5); // Get the variable name
						if (env[varName] === null) {
							console.error(`Error: Environment variable ${varName} is null.`);
							obj[key] = ''; // Replace with empty string
						} else {
							obj[key] = env[varName] !== undefined ? env[varName] : ''; // Replace or set to empty string
						}
					}
					// Replace secrets
						else if (obj[key].startsWith('$secrets.') || obj[key].startsWith('$secret.')) {
							const secretName = obj[key].startsWith('$secret.') ? obj[key].substring(8) : obj[key].substring(9);
							if (env[secretName] === null) {
								console.error(`Error: Secret ${secretName} is null.`);
								obj[key] = ''; // Replace with empty string
						} else {
							obj[key] = env[secretName] !== undefined ? env[secretName] : ''; // Replace or set to empty string
						}
					}
				}
			}
		}
	
		// Start traversing the config object
		traverse(config);
		return config; // Return the modified config
	}
}
