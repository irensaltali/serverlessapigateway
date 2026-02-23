import { jwtVerify, createLocalJWKSet, createRemoteJWKSet, errors } from 'jose';
import { AuthError, SAGError } from "../types/error_types";

const AUTH0_ERROR_CODE = 'AUTH0_ERROR';
const AUTH0_UPSTREAM_ERROR_CODE = 'AUTH0_UPSTREAM_ERROR';
const AUTH0_NETWORK_ERROR_CODE = 'AUTH0_NETWORK_ERROR';

async function readErrorPayload(response) {
	try {
		return await response.clone().json();
	} catch (_) {
		try {
			return await response.text();
		} catch (__){
			return null;
		}
	}
}

function createAuth0UpstreamError(action, response, payload) {
	return new SAGError(
		`Auth0 ${action} failed`,
		AUTH0_UPSTREAM_ERROR_CODE,
		response.status,
		`Auth0 ${action} failed with status ${response.status}. payload=${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
	);
}

function createAuth0InternalError(error) {
	return new SAGError(
		'Internal Server Error',
		AUTH0_ERROR_CODE,
		500,
		error instanceof Error ? error.message : String(error),
	);
}

function createAuth0NetworkError(action, error) {
	return new SAGError(
		`Auth0 ${action} request failed`,
		AUTH0_NETWORK_ERROR_CODE,
		502,
		error instanceof Error ? error.message : String(error),
	);
}

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
            const errorData = await readErrorPayload(response);
            throw createAuth0UpstreamError('token exchange', response, errorData);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof SAGError || error instanceof AuthError) {
            throw error;
        }
        if (error instanceof TypeError) {
            throw createAuth0NetworkError('token exchange', error);
        }
        throw createAuth0InternalError(error);
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
            let jwksData;
            try {
                jwksData = JSON.parse(jwks);
            } catch (_) {
                throw new AuthError('JWKS configuration is not valid JSON.', 'AUTH_CONFIG_ERROR', 500);
            }
            jwksSet = createLocalJWKSet(jwksData);
        }
        else if (jwks_uri) {
            jwksSet = createRemoteJWKSet(new URL(jwks_uri));
        }

        if (!jwksSet) {
            throw new AuthError('No JWKS source configured.', 'AUTH_CONFIG_ERROR', 500);
        }

        const { payload } = await jwtVerify(jwt, jwksSet, {
            issuer: `https://${domain}/`,
        });
        return payload;
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }
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
            const errorData = await readErrorPayload(response);
            throw createAuth0UpstreamError('userinfo', response, errorData);
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        if (error instanceof SAGError || error instanceof AuthError) {
            throw error;
        }
        if (error instanceof TypeError) {
            throw createAuth0NetworkError('userinfo', error);
        }
        throw createAuth0InternalError(error);
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
            const errorData = await readErrorPayload(response);
            throw createAuth0UpstreamError('refresh token', response, errorData);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof SAGError || error instanceof AuthError) {
            throw error;
        }
        if (error instanceof TypeError) {
            throw createAuth0NetworkError('refresh token', error);
        }
        throw createAuth0InternalError(error);
    }
}

export { auth0CallbackHandler, validateIdToken, getProfile, redirectToLogin, refreshToken };
