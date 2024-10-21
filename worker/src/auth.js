import {jwtVerify, errors } from 'jose';
import apiConfig from './api-config.json';

// Define a custom error type for clearer error handling
class AuthError extends Error {
	constructor(message, code, statusCode) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
		this.statusCode = statusCode;
	}
}

async function jwtAuth(request) {
	const secret = new TextEncoder().encode(apiConfig.authorizer?.secret);
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new AuthError('No token provided or token format is invalid.', 'AUTH_ERROR', 401);
	}
	const jwt = authHeader.split(' ')[1];

	try {
		const { payload, protectedHeader } = await jwtVerify(jwt, secret, {
			issuer: apiConfig.authorizer?.issuer,
			audience: apiConfig.authorizer?.audience,
		});

		console.log('JWT verification successful:', payload, protectedHeader);

		return payload;
	} catch (error) {
		console.error('JWT verification failed:', error);
		if (error instanceof errors.JOSEAlgNotAllowed) {
			throw new AuthError('Algorithm not allowed', error.code, 401);
		} else if (error instanceof errors.JWEDecryptionFailed) {
			throw new AuthError('Decryption failed', error.code, 401);
		} else if (error instanceof errors.JWEInvalid) {
			throw new AuthError('Invalid JWE', error.code, 401);
		} else if (error instanceof errors.JWTExpired) {
			throw new AuthError('Token has expired.', error.code, 401);
		} else if (error instanceof errors.JWTClaimValidationFailed) {
			throw new AuthError('JWT claim validation failed', error.code, 401);
		} else if (error instanceof errors.JWTInvalid) {
			throw new AuthError('Invalid JWT', error.code, 401);
		} else if (error instanceof errors.JWKSNoMatchingKey) {
			throw new AuthError('No matching key found in JWKS.', error.code, 401);
		} else if (error instanceof errors.JWKSInvalid) {
			throw new AuthError('Invalid JWKS', error.code, 401);
		} else if (error instanceof errors.JWKSMultipleMatchingKeys) {
			throw new AuthError('Multiple matching keys found in JWKS.', error.code, 401);
		} else if (error instanceof errors.JWKSNoMatchingKey) {
			throw new AuthError('No matching key in JWKS.', error.code, 401);
		} else if (error instanceof errors.JWSInvalid) {
			throw new AuthError('Invalid JWS', error.code, 401);
		} else if (error instanceof errors.JWSSignatureVerificationFailed) {
			throw new AuthError('Signature verification failed', error.code, 401);
		} else if (error instanceof Error) {
			throw new AuthError('JWT verification failed', 'AUTH_ERROR', 401);
		}
		// Fallback in case error is not an instance of Error
		throw new AuthError('JWT verification failed due to an unexpected error.', 'AUTH_ERROR', 401);
	}
}

export { jwtAuth, AuthError };
