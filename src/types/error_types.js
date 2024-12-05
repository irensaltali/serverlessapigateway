class AuthError extends Error {
	constructor(message, code, statusCode) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
		this.statusCode = statusCode;
	}

	toApiResponse() {
		return new Response(JSON.stringify({ error: this.message, code: this.code }), {
			status: this.statusCode,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

class SAGError extends Error {
	constructor(message, code, statusCode, logMessage) {
		super(message);
		this.name = 'SAGError';
		this.code = code;
		this.statusCode = statusCode;
		this.logMessage = logMessage;
		Error.captureStackTrace(this, this.constructor); 
	}

	toApiResponse() {
		console.error(this.logMessage || this.message);
		return new Response(JSON.stringify({ error: this.message, code: this.code }), {
			status: this.statusCode,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export { AuthError, SAGError };
