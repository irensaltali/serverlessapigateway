class AuthError extends Error {
	constructor(message, code, statusCode) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
		this.statusCode = statusCode;
	}
}

class SAGError extends Error {
	constructor(message, code, statusCode, logMessage) {
		super(message);
		this.name = 'GenericError';
		this.code = code;
		this.statusCode = statusCode;
		this.logMessage = logMessage;
	}

	toApiResponse() {
		console.error(this.logMessage || this.message);
		return new Response(JSON.stringify({ error: this.message, code: this.code }), {
			status: this.statusCode,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export { AuthError, SAGError};
