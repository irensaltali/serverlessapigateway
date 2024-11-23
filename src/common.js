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

function generateJsonResponse(isSuccess, data = null, message = '', error = null, statusCode = null) {
    const responseBody = {
        status: isSuccess ? 'success' : 'error',
        message: message || (isSuccess ? 'Operation completed successfully.' : 'An error occurred.'),
    };

    if (isSuccess) {
        responseBody.data = data;
    } else {
        responseBody.error = error;
    }

    return new Response(JSON.stringify(responseBody), {
        headers: {
            'Content-Type': 'application/json',
        },
        status: statusCode !== null ? statusCode : (isSuccess ? 200 : 400),
    });
}

export { safeStringify, generateJsonResponse };
