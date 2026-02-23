import { afterEach, describe, it, expect, vi } from 'vitest';
import {
    auth0CallbackHandler,
    getProfile,
    refreshToken,
    validateIdToken,
    redirectToLogin,
} from '../src/integrations/auth0.js';
import { AuthError, SAGError } from '../src/types/error_types.js';

const authorizer = {
    domain: 'tenant.auth0.com',
    client_id: 'client-id',
    client_secret: 'client-secret',
    redirect_uri: 'https://api.example.com/auth/callback',
    scope: 'openid profile email',
    jwks_uri: 'https://tenant.auth0.com/.well-known/jwks.json',
};

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── readErrorPayload branches (lines 8–17) ───

describe('readErrorPayload fallback paths', () => {
    it('reads text body when JSON parsing fails on callback error', async () => {
        // Return non-JSON body so readErrorPayload falls back to .text()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('plain text error', { status: 500 })),
        );

        await expect(auth0CallbackHandler('code-123', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_UPSTREAM_ERROR',
            statusCode: 500,
        });
    });

    it('reads text body when JSON parsing fails on refresh error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('text error body', { status: 502 })),
        );

        await expect(refreshToken('refresh-tok', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_UPSTREAM_ERROR',
            statusCode: 502,
        });
    });

    it('reads text body when JSON parsing fails on getProfile error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('forbidden text', { status: 403 })),
        );

        await expect(getProfile('access-tok', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_UPSTREAM_ERROR',
            statusCode: 403,
        });
    });
});

// ─── auth0CallbackHandler: internal error path (line 82) ───

describe('auth0CallbackHandler internal error handling', () => {
    it('wraps non-TypeError, non-SAGError errors as AUTH0_ERROR', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('unexpected');
            }),
        );

        await expect(auth0CallbackHandler('code-123', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_ERROR',
            statusCode: 500,
        });
    });

    it('wraps TypeError as AUTH0_NETWORK_ERROR on callback', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new TypeError('network failure');
            }),
        );

        await expect(auth0CallbackHandler('code-123', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_NETWORK_ERROR',
            statusCode: 502,
        });
    });
});

// ─── validateIdToken: JWT validation error branches (lines 116–151) ───

describe('validateIdToken error classification', () => {
    it('extracts bearer token from request when jwt param is null', async () => {
        // Token will fail verification but we exercise the header parsing logic (line 93)
        const request = new Request('https://api.example.com/private', {
            headers: { Authorization: 'Bearer invalid.jwt.value' },
        });

        await expect(
            validateIdToken(request, null, {
                ...authorizer,
                jwks: JSON.stringify({
                    keys: [
                        {
                            kty: 'RSA',
                            n: 'test',
                            e: 'AQAB',
                            alg: 'RS256',
                            use: 'sig',
                            kid: 'test-kid',
                        },
                    ],
                }),
                jwks_uri: undefined,
            }),
        ).rejects.toBeInstanceOf(AuthError);
    });

    it('uses jwks_uri when jwks is not present', async () => {
        // Will fail during verification, but exercises remote JWKS set creation (line 109)
        await expect(
            validateIdToken(null, 'some.jwt.token', {
                ...authorizer,
                jwks: undefined,
                jwks_uri: 'https://tenant.auth0.com/.well-known/jwks.json',
            }),
        ).rejects.toBeInstanceOf(AuthError);
    });

    it('re-throws AuthError instances without wrapping', async () => {
        await expect(
            validateIdToken(null, 'token', {
                ...authorizer,
                jwks_uri: undefined,
                jwks: undefined,
            }),
        ).rejects.toMatchObject({
            name: 'AuthError',
            code: 'AUTH_CONFIG_ERROR',
        });
    });
});

// ─── getProfile: success path and network error (lines 173–192) ───

describe('getProfile', () => {
    it('returns profile data on success', async () => {
        const profileData = { sub: 'user-1', name: 'Test', email: 'test@example.com' };
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify(profileData), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );

        const response = await getProfile('valid-access-token', authorizer);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.sub).toBe('user-1');
    });

    it('wraps TypeError as AUTH0_NETWORK_ERROR on userinfo', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new TypeError('network failure');
            }),
        );

        await expect(getProfile('token', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_NETWORK_ERROR',
            statusCode: 502,
        });
    });

    it('wraps generic errors as AUTH0_ERROR on userinfo', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('unexpected userinfo error');
            }),
        );

        await expect(getProfile('token', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_ERROR',
            statusCode: 500,
        });
    });
});

// ─── redirectToLogin (lines 189–193) ───

describe('redirectToLogin', () => {
    it('returns 302 redirect to Auth0 authorize URL', async () => {
        const response = await redirectToLogin({ state: 'abc123' }, authorizer);
        expect(response.status).toBe(302);
        const location = response.headers.get('Location');
        expect(location).toContain('tenant.auth0.com/authorize');
        expect(location).toContain('state=abc123');
        expect(location).toContain('client_id=client-id');
        expect(location).toContain('scope=openid%20profile%20email');
    });
});

// ─── refreshToken: success, upstream error, network error, internal error (lines 195–231) ───

describe('refreshToken', () => {
    it('returns new tokens on success', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(
                    JSON.stringify({ access_token: 'new-at', id_token: 'new-id', refresh_token: 'new-rt' }),
                    { status: 200 },
                ),
            ),
        );

        const result = await refreshToken('old-refresh-token', authorizer);
        expect(result.access_token).toBe('new-at');
        expect(result.refresh_token).toBe('new-rt');
    });

    it('wraps generic errors as AUTH0_ERROR on refresh', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('unexpected refresh error');
            }),
        );

        await expect(refreshToken('old-rt', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_ERROR',
            statusCode: 500,
        });
    });

    it('re-throws SAGError from refresh', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new SAGError('upstream broke', 'AUTH0_UPSTREAM_ERROR', 502, 'detail');
            }),
        );

        await expect(refreshToken('old-rt', authorizer)).rejects.toMatchObject({
            name: 'SAGError',
            code: 'AUTH0_UPSTREAM_ERROR',
        });
    });

    it('re-throws AuthError from refresh', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new AuthError('auth broke', 'AUTH_ERROR', 401);
            }),
        );

        await expect(refreshToken('old-rt', authorizer)).rejects.toMatchObject({
            name: 'AuthError',
            code: 'AUTH_ERROR',
        });
    });
});
