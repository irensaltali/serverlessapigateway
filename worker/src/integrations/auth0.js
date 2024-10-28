import { jwtVerify, createLocalJWKSet, createRemoteJWKSet, errors } from 'jose';
import apiConfig from '../api-config.json';

async function auth0CallbackHandler(jwt) {
    const { domain, client_id, client_secret } = apiConfig.authorizer;

    const tokenUrl = `https://${domain}/oauth/token`;

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        code,
        redirect_uri: 'https://api-test.serverlessapigw.com/api/v1/auth0/callback'
    });

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to fetch token:', errorData);
            return new Response(JSON.stringify({
                error: 'Failed to fetch token',
                details: errorData
            }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();
        console.log('auth0CallbackHandler data', data);
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in auth0CallbackHandler:', error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function validateAccessToken(jwt) {
    const { domain, jwks, jwks_uri } = apiConfig.authorizer;

    try {
        jwt = jwt.split(' ')[1];
        
        // Extract the public key from the JWKS
        let JWKS;
        if (jwks) {
            const jwksData = JSON.parse(jwks);
            JWKS = createLocalJWKSet(jwksData);
        }
        else if (jwks_uri) {
            JWKS = createRemoteJWKSet(new URL(jwks_uri));
        }

        const { payload, protectedHeader } = await jwtVerify(jwt, JWKS, {
            issuer: `https://${domain}/`,
        })
        console.log('validateAccessToken payload', payload);
        console.log('validateAccessToken protectedHeader', protectedHeader);
        return jwt;
    } catch (error) {
        // Handle token validation errors
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

export { auth0CallbackHandler, validateAccessToken };
