function safeStringify(obj) {
    return JSON.stringify(obj, (key, value) => {
        // Check if the value is a function, undefined, symbol, or a Promise
        if (typeof value === 'function' || 
            typeof value === 'undefined' || 
            typeof value === 'symbol' || 
            (typeof value === 'object' && value !== null && typeof value.then === 'function')) {
            return undefined; // Exclude these values
        }
        return value; // Include all other values
    });
}

function generateJsonResponse(input) {
    if (input instanceof Response) {
        return input;
    }

    if (input === null) {
        return new Response(null, {
            headers: {
                'Content-Type': 'application/json',
            },
            status: 200,
        });
    }

    if (typeof input === 'string') {
        return new Response(input, {
            headers: {
                'Content-Type': 'application/json',
            },
            status: 200,
        });
    }

    if (typeof input === 'object') {
        const { statusCode, error, message, ...data } = input;
        const responseBody = {
            status: error ? 'error' : 'success',
            message: message || (error ? 'An error occurred.' : 'Operation completed successfully.'),
            data: error ? undefined : data,
            error: error || undefined,
        };

        return new Response(JSON.stringify(responseBody), {
            headers: {
                'Content-Type': 'application/json',
            },
            status: statusCode !== undefined ? statusCode : (error ? 500 : 200),
        });
    }

    // Default response for unsupported input types
    return new Response(null, {
        headers: {
            'Content-Type': 'application/json',
        },
        status: 400,
    });
}

export { safeStringify, generateJsonResponse };
