async function applyValueMapping(request: Request, mappingConfig: any, jwtPayload: any, configVariables: any): Promise<Request> {
    let newRequest = request.clone();

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

    // Add logic for other targets like query parameters if needed

    return newRequest;
}

function resolveValue(template: string, request: Request, jwtPayload: any, configVariables: any): string | null {
    const templateMatcher = /\$(request\.header|request\.jwt|config|request\.query)\.([a-zA-Z0-9]+)/g;
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
