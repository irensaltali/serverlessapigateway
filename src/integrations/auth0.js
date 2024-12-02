import { jwtVerify, createLocalJWKSet, createRemoteJWKSet, errors } from 'jose';
import { AuthError } from "../types/error_types";

async function auth0CallbackHandler(code, authorizer) {
    const { domain, client_id, client_secret, redirect_uri } = authorizer;

    const tokenUrl = `https://${domain}/oauth/token`;

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        code,
        redirect_uri
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
            throw new Error(`Failed to fetch token: ${JSON.stringify(errorData)}`);
        }

        const jwt = await response.json();
        return jwt;
    } catch (error) {
        throw new Error(`Internal Server Error: ${error.message}`);
    }
}

async function validateIdToken(request, jwt, authorizer) {
    const { domain, jwks, jwks_uri } = authorizer;
    if (!jwt) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AuthError('No token provided or token format is invalid.', 'AUTH_ERROR', 401);
        }
        jwt = authHeader.split(' ')[1];
    }

    try {
        // Create a JWK Set from the JWKS endpoint or the JWKS data
        let jwksSet;
        if (jwks) {
            const jwksData = JSON.parse(jwks);
            jwksSet = createLocalJWKSet(jwksData);
        }
        else if (jwks_uri) {
            jwksSet = createRemoteJWKSet(new URL(jwks_uri));
        }

        const { payload, protectedHeader } = await jwtVerify(jwt, jwksSet, {
            issuer: `https://${domain}/`,
        });
        return payload;
    } catch (error) {
        // Handle token validation errors
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

async function getProfile(accessToken, authorizer) {
    const { domain } = authorizer;

    const userinfourl = `https://${domain}/userinfo`;

    try {
        const response = await fetch(userinfourl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            return new Response(JSON.stringify({
                error: 'Failed to fetch token',
                details: errorData
            }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function redirectToLogin(params, authorizer) {
    const { domain, client_id, redirect_uri, scope } = authorizer;
    const loginUrl = `https://${domain}/authorize?response_type=code&client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${params.state}`;
    return Response.redirect(loginUrl, 302);
}

async function refreshToken(refreshToken, authorizer) {
    const { domain, client_id, client_secret } = authorizer;

    const tokenUrl = `https://${domain}/oauth/token`;

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id,
        client_secret,
        refresh_token: refreshToken
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
            throw new Error(`Failed to fetch token: ${JSON.stringify(errorData)}`);
        }

        const jwt = await response.json();
        return jwt;
    } catch (error) {
        throw new Error(`Internal Server Error: ${error.message}`);
    }
}

export { auth0CallbackHandler, validateIdToken, getProfile, redirectToLogin, refreshToken };
