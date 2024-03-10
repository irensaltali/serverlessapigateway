async function applyValueMapping(request: Request, mappingConfig: any, jwtPayload: any, configVariables: any, globalVariables: any): Promise<Request> {
    let newRequest = request.clone();
    let url = new URL(newRequest.url);
    let searchParams = new URLSearchParams(url.searchParams);

    // Apply mappings to headers
    if (mappingConfig.headers) {
        const newHeaders = new Headers(newRequest.headers);

        for (const [key, value] of Object.entries(mappingConfig.headers)) {
            const resolvedValue = resolveValue(String(value), request, jwtPayload, configVariables, globalVariables);
            console.log(`Resolved value for ${key}: ${resolvedValue}`);
            if (resolvedValue !== null) {
                newHeaders.set(key, resolvedValue);
            }
        }

        newRequest = new Request(newRequest, { headers: newHeaders });
    }

    // Apply mappings to query parameters
    if (mappingConfig.query) {
        for (const [key, value] of Object.entries(mappingConfig.query)) {
            const resolvedValue = resolveValue(String(value), request, jwtPayload, configVariables, globalVariables);
            if (resolvedValue !== null) {
                searchParams.set(key, resolvedValue);
            }
        }

        url.search = searchParams.toString();
        newRequest = new Request(url.toString(), newRequest);
    }

    return newRequest;
}

function resolveValue(template: string, request: Request, jwtPayload: any, configVariables: any, globalVariables: any): string | null {
    try {
        const templateMatcher = /\$(request\.header|request\.jwt|config|request\.query)\.([a-zA-Z0-9-_.]+)/g;;
        let match = templateMatcher.exec(template);

        if (match) {
            switch (match[1]) {
                case 'request.header':
                    return (request && request.headers && request.headers.hasOwnProperty(match[2])) ? request.headers.get(match[2]) : null;
                case 'request.jwt':
                    return (jwtPayload && jwtPayload.hasOwnProperty(match[2])) ? jwtPayload[match[2]] : null;
                case 'config':
                    return (configVariables && configVariables.hasOwnProperty(match[2])) ? configVariables[match[2]] : (globalVariables && globalVariables.hasOwnProperty(match[2])) ? globalVariables[match[2]] : null;
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

export { applyValueMapping }
