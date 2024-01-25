async function applyValueMapping(request: Request, mappingConfig: any, jwtPayload: any, configVariables: any): Promise<Request> {
    let newRequest = request.clone();
    let url = new URL(newRequest.url);
    let searchParams = new URLSearchParams(url.searchParams);

    // Apply mappings to headers
    if (mappingConfig.headers) {
        const newHeaders = new Headers(newRequest.headers);

        for (const [key, value] of Object.entries(mappingConfig.headers)) {
            const resolvedValue = resolveValue(String(value), request, jwtPayload, configVariables);
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
            const resolvedValue = resolveValue(String(value), request, jwtPayload, configVariables);
            if (resolvedValue !== null) {
                searchParams.set(key, resolvedValue);
            }
        }

        url.search = searchParams.toString();
        newRequest = new Request(url.toString(), newRequest);
    }

    return newRequest;
}

function resolveValue(template: string, request: Request, jwtPayload: any, configVariables: any): string | null {
    const templateMatcher = /\$(request\.header|request\.jwt|config|request\.query)\.([a-zA-Z0-9-_.]+)/g;    ;
    let match = templateMatcher.exec(template);

    if (match) {
        switch (match[1]) {
            case 'request.header':
                return request.headers.get(match[2]) || null;
            case 'request.jwt':
                return jwtPayload[match[2]] || null;
            case 'config':
                return configVariables[match[2]] || null;
            case 'request.query':
                const url = new URL(request.url);
                return url.searchParams.get(match[2]) || null;
            default:
                return null;
        }
    }

    return null;
}

export { applyValueMapping }
