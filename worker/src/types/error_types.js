class AuthError extends Error {
	constructor(message, code, statusCode) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
		this.statusCode = statusCode;
	}
}

export { AuthError }; // Ensure AuthError is exported
