import {jwtVerify, errors } from 'jose';
import { AuthError } from "./types/error_types";

const JOSE_ERROR_MAPPINGS = [
	[errors.JOSEAlgNotAllowed, 'Algorithm not allowed'],
	[errors.JWEDecryptionFailed, 'Decryption failed'],
	[errors.JWEInvalid, 'Invalid JWE'],
	[errors.JWTExpired, 'Token has expired.'],
	[errors.JWTClaimValidationFailed, 'JWT claim validation failed'],
	[errors.JWTInvalid, 'Invalid JWT'],
	[errors.JWKSNoMatchingKey, 'No matching key found in JWKS.'],
	[errors.JWKSInvalid, 'Invalid JWKS'],
	[errors.JWKSMultipleMatchingKeys, 'Multiple matching keys found in JWKS.'],
	[errors.JWSInvalid, 'Invalid JWS'],
	[errors.JWSSignatureVerificationFailed, 'Signature verification failed'],
];

async function jwtAuth(request, apiConfig) {
	const secret = new TextEncoder().encode(apiConfig.authorizer?.secret);
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new AuthError('No token provided or token format is invalid.', 'AUTH_ERROR', 401);
	}
	const jwt = authHeader.split(' ')[1];

	try {
		const { payload } = await jwtVerify(jwt, secret, {
			issuer: apiConfig.authorizer?.issuer,
			audience: apiConfig.authorizer?.audience,
		});

		return payload;
	} catch (error) {
		for (const [ErrorType, message] of JOSE_ERROR_MAPPINGS) {
			if (error instanceof ErrorType) {
				throw new AuthError(message, error.code || 'AUTH_ERROR', 401);
			}
		}

		if (error instanceof Error) {
			throw new AuthError('JWT verification failed', 'AUTH_ERROR', 401);
		}

		throw new AuthError('JWT verification failed due to an unexpected error.', 'AUTH_ERROR', 401);
	}
}

export { jwtAuth, AuthError };
