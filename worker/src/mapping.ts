export interface ValueMapperRequest {
	request: Request;
	mappingConfig: any;
	jwtPayload: any;
	configVariables: any;
	globalVariables: any;
}

export class ValueMapper {
	public static async modify(incoming: ValueMapperRequest): Promise<Request> {
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
				console.log(`Resolved value for ${key}: ${resolvedValue}`);
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
	private static resolveValue(
		template: string,
		request: Request,
		jwtPayload: any,
		configVariables: any,
		globalVariables: any,
	): string | null {
		try {
			const templateMatcher = /\$(request\.header|request\.jwt|config|request\.query)\.([a-zA-Z0-9-_.]+)/g;
			const match = templateMatcher.exec(template);

			if (match) {
				switch (match[1]) {
					case 'request.header':
						return request && request.headers && request.headers.hasOwnProperty(match[2]) ? request.headers.get(match[2]) : null;
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
}
