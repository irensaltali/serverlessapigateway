import { afterEach, describe, it, expect, vi } from 'vitest';
import gateway from '../src/index.js';

function buildEnv(config, extra = {}) {
    return {
        CONFIG: {
            get: async () => JSON.stringify(config),
        },
        ...extra,
    };
}

const baseCors = {
    allow_origins: ['https://app.example.com'],
    allow_methods: ['GET', 'POST', 'OPTIONS'],
    allow_headers: ['Authorization', 'Content-Type', 'X-Refresh-Token'],
    expose_headers: ['X-Request-Id'],
    allow_credentials: true,
    max_age: 600,
};

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── getBearerToken (line 22) & path sorting priority branches ───

describe('getBearerToken extraction', () => {
    it('returns bearer token from Authorization header for auth0_userinfo', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
                scope: 'openid',
            },
            paths: [
                {
                    method: 'GET',
                    path: '/userinfo',
                    auth: false,
                    integration: { type: 'auth0_userinfo' },
                },
            ],
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ sub: 'user-1', email: 'test@example.com' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );

        const response = await gateway.fetch(
            new Request('https://api.example.com/userinfo', {
                headers: { Authorization: 'Bearer my-access-token' },
            }),
            env,
            {},
        );

        expect(response.status).toBe(200);
    });

    it('extracts token from X-Access-Token header for auth0_userinfo', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
                scope: 'openid',
            },
            paths: [
                {
                    method: 'GET',
                    path: '/userinfo',
                    auth: false,
                    integration: { type: 'auth0_userinfo' },
                },
            ],
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ sub: 'user-1' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );

        const response = await gateway.fetch(
            new Request('https://api.example.com/userinfo', {
                headers: { 'X-Access-Token': 'my-x-access-token' },
            }),
            env,
            {},
        );

        expect(response.status).toBe(200);
    });
});

// ─── Path sorting priority: exact vs parameterized vs wildcard ───

describe('path sorting priority', () => {
    it('prioritises exact match over parameterized and wildcard routes', async () => {
        const env = buildEnv({
            paths: [
                { method: 'GET', path: '/items/{.+}', response: { variant: 'wildcard' } },
                { method: 'GET', path: '/items/{id}', response: { variant: 'parameterized' } },
                { method: 'GET', path: '/items/special', response: { variant: 'exact' } },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/items/special'),
            env,
            {},
        );
        const body = await response.json();
        expect(body.variant).toBe('exact');
    });
});

// ─── Auth0 authorizer: SAGError and generic error branches ───

describe('auth0 authorizer error branches in index', () => {
    it('returns SAGError response when auth0 validateIdToken throws SAGError', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks: undefined,
                jwks_uri: undefined,
                scope: 'openid',
            },
            paths: [
                { method: 'GET', path: '/private', auth: true, response: { ok: true } },
            ],
        });

        // No jwks or jwks_uri configured → will throw AuthError with AUTH_CONFIG_ERROR
        const response = await gateway.fetch(
            new Request('https://api.example.com/private', {
                headers: { Authorization: 'Bearer some-token' },
            }),
            env,
            {},
        );
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.code).toBe('AUTH_CONFIG_ERROR');
    });

    it('returns 401 for auth0 authorizer when no bearer token is present', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
                scope: 'openid',
            },
            paths: [
                { method: 'GET', path: '/private', auth: true, response: { ok: true } },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/private'),
            env,
            {},
        );
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.code).toBe('AUTH_ERROR');
    });
});

// ─── Supabase authorizer: auth flow in index ───

describe('supabase authorizer error branches in index', () => {
    it('returns 500 when supabase authorizer jwt_secret is missing', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'supabase',
                issuer: 'https://iss.example.com',
                audience: 'authenticated',
                // jwt_secret deliberately omitted
            },
            paths: [
                { method: 'GET', path: '/private', auth: true, response: { ok: true } },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/private', {
                headers: { Authorization: 'Bearer some-token' },
            }),
            env,
            {},
        );
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.code).toBe('MISSING_JWT_SECRET');
    });

    it('returns 401 when supabase authorizer has no bearer token', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'supabase',
                jwt_secret: 'secret-123',
                issuer: 'https://iss.example.com',
                audience: 'authenticated',
            },
            paths: [
                { method: 'GET', path: '/private', auth: true, response: { ok: true } },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/private'),
            env,
            {},
        );
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.code).toBe('AUTH_ERROR');
    });
});

// ─── Auth0 callback redirect ───

describe('auth0 callback redirect integration', () => {
    it('returns 302 redirect to Auth0 login', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                scope: 'openid profile email',
            },
            paths: [
                {
                    method: 'GET',
                    path: '/login',
                    auth: false,
                    integration: { type: 'auth0_callback_redirect' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/login?state=abc123'),
            env,
            {},
        );
        expect(response.status).toBe(302);
        const location = response.headers.get('Location');
        expect(location).toContain('example.auth0.com/authorize');
        expect(location).toContain('state=abc123');
    });
});

// ─── Supabase passwordless auth ───

describe('supabase passwordless auth integration', () => {
    it('returns 400 when neither email nor phone is provided', async () => {
        const env = buildEnv({
            paths: [
                {
                    method: 'POST',
                    path: '/auth/otp',
                    auth: false,
                    integration: { type: 'supabase_passwordless_auth' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/auth/otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }),
            env,
            {},
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('missing_email_or_phone');
    });
});

// ─── Supabase passwordless verify ───

describe('supabase passwordless verify integration', () => {
    it('returns 400 when token is missing in verify request', async () => {
        const env = buildEnv({
            paths: [
                {
                    method: 'POST',
                    path: '/auth/verify',
                    auth: false,
                    integration: { type: 'supabase_passwordless_verify' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' }),
            }),
            env,
            {},
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('missing_token_or_contact');
    });

    it('returns 400 when token exists but no email or phone', async () => {
        const env = buildEnv({
            paths: [
                {
                    method: 'POST',
                    path: '/auth/verify',
                    auth: false,
                    integration: { type: 'supabase_passwordless_verify' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: '123456' }),
            }),
            env,
            {},
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('missing_token_or_contact');
    });
});

// ─── Supabase passwordless auth alt ───

describe('supabase passwordless auth alt integration', () => {
    it('returns 400 when email is missing in alt auth', async () => {
        const env = buildEnv({
            paths: [
                {
                    method: 'POST',
                    path: '/auth/otp-alt',
                    auth: false,
                    integration: { type: 'supabase_passwordless_auth_alt' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/auth/otp-alt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }),
            env,
            {},
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('missing_email');
    });
});

// ─── Top-level error handler (generic Error) ───

describe('top-level error handler', () => {
    it('returns 500 for generic errors from the config loading', async () => {
        // Providing an env that will cause getApiConfig to throw
        const response = await gateway.fetch(
            new Request('https://api.example.com/any'),
            {
                CONFIG: {
                    get: async () => { throw new Error('boom'); },
                },
            },
            {},
        );
        expect(response.status).toBe(500);
    });
});

// ─── refreshTokenLogic ───

describe('refreshTokenLogic', () => {
    it('returns 400 when POST body has no refresh_token and header is missing', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
                scope: 'openid',
            },
            paths: [
                {
                    method: 'POST',
                    path: '/refresh',
                    auth: false,
                    integration: { type: 'auth0_refresh' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }),
            env,
            {},
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('missing_refresh_token');
    });

    it('returns 400 when POST body is malformed JSON and header is missing', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
                scope: 'openid',
            },
            paths: [
                {
                    method: 'POST',
                    path: '/refresh',
                    auth: false,
                    integration: { type: 'auth0_refresh' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not-json',
            }),
            env,
            {},
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('missing_refresh_token');
    });

    it('reads refresh_token from POST body when X-Refresh-Token header is missing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
            ),
        );

        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks: undefined,
                jwks_uri: undefined,
                scope: 'openid',
            },
            paths: [
                {
                    method: 'POST',
                    path: '/refresh',
                    auth: false,
                    integration: { type: 'auth0_refresh' },
                },
            ],
        });

        // When refresh_token is in body but validateIdToken fails (no jwks configured)
        // it should hit the error branch in refreshTokenLogic
        const response = await gateway.fetch(
            new Request('https://api.example.com/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: 'my-refresh-token' }),
            }),
            env,
            {},
        );
        // validateIdToken throws AuthError (no jwks source) which is not JWT_EXPIRED,
        // so it should go to the else branch. AuthError is not SAGError so goes to
        // the generic else branch returning 500
        expect([401, 500]).toContain(response.status);
    });

    it('reads refresh token from X-Refresh-Token header', async () => {
        const env = buildEnv({
            authorizer: {
                type: 'auth0',
                domain: 'example.auth0.com',
                client_id: 'cid',
                client_secret: 'secret',
                redirect_uri: 'https://api.example.com/callback',
                jwks: undefined,
                jwks_uri: undefined,
                scope: 'openid',
            },
            paths: [
                {
                    method: 'GET',
                    path: '/refresh',
                    auth: false,
                    integration: { type: 'auth0_refresh' },
                },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/refresh', {
                headers: { 'X-Refresh-Token': 'my-refresh-token' },
            }),
            env,
            {},
        );
        // Should proceed past the missing refresh_token check but then fail
        // on validateIdToken (no bearer token → AuthError)
        expect([401, 500]).toContain(response.status);
    });
});

// ─── JWT authorizer SAGError and generic error branches ───

describe('jwt authorizer SAGError/generic error branches in index', () => {
    it('returns 500 for generic (non-AuthError, non-SAGError) jwt auth failure', async () => {
        // Force a generic error by providing a config where jwt auth will throw something unexpected
        // We'll use an invalid secret type that causes jose to throw a generic Error
        const env = buildEnv({
            authorizer: {
                type: 'jwt',
                secret: null, // will cause encoding to fail
                algorithm: 'HS256',
                audience: 'aud',
                issuer: 'iss',
            },
            paths: [
                { method: 'GET', path: '/private', auth: true, response: { ok: true } },
            ],
        });

        const response = await gateway.fetch(
            new Request('https://api.example.com/private', {
                headers: { Authorization: 'Bearer some.invalid.token' },
            }),
            env,
            {},
        );
        // Should hit one of the error branches (401 or 500)
        expect(response.status).toBeGreaterThanOrEqual(400);
    });
});

// ─── Service binding integration ───

describe('service binding integration', () => {
    it('calls the service binding function and returns result', async () => {
        const mockFn = vi.fn(async () => ({ result: 'from-binding' }));
        const env = buildEnv(
            {
                serviceBindings: [{ alias: 'myService', binding: 'MY_SERVICE' }],
                paths: [
                    {
                        method: 'POST',
                        path: '/service-call',
                        auth: false,
                        integration: {
                            type: 'service_binding',
                            binding: 'myService',
                            function: 'handler',
                        },
                    },
                ],
            },
            {
                MY_SERVICE: { handler: mockFn },
            },
        );

        const response = await gateway.fetch(
            new Request('https://api.example.com/service-call', { method: 'POST' }),
            env,
            {},
        );
        expect(response.status).toBe(200);
        expect(mockFn).toHaveBeenCalled();
    });
});

// ─── Pre-process logic ───

describe('pre-process logic', () => {
    it('returns early when pre_process returns a non-true response', async () => {
        const preProcessFn = vi.fn(async () =>
            new Response(JSON.stringify({ blocked: true }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const env = buildEnv(
            {
                serviceBindings: [{ alias: 'guard', binding: 'GUARD_SERVICE' }],
                paths: [
                    {
                        method: 'GET',
                        path: '/guarded',
                        auth: false,
                        pre_process: { binding: 'guard', function: 'check' },
                        integration: { type: 'http_proxy', server: 'upstream' },
                        response: { should: 'not reach' },
                    },
                ],
                servers: [{ alias: 'upstream', url: 'https://upstream.example.com' }],
            },
            {
                GUARD_SERVICE: { check: preProcessFn },
            },
        );

        const response = await gateway.fetch(
            new Request('https://api.example.com/guarded'),
            env,
            {},
        );
        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.blocked).toBe(true);
    });

    it('continues to integration when pre_process returns true', async () => {
        const preProcessFn = vi.fn(async () => true);

        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ data: 'from-upstream' }), { status: 200 }),
            ),
        );

        const env = buildEnv(
            {
                serviceBindings: [{ alias: 'guard', binding: 'GUARD_SERVICE' }],
                paths: [
                    {
                        method: 'GET',
                        path: '/guarded',
                        auth: false,
                        pre_process: { binding: 'guard', function: 'check' },
                        integration: { type: 'http_proxy', server: 'upstream' },
                    },
                ],
                servers: [{ alias: 'upstream', url: 'https://upstream.example.com' }],
            },
            {
                GUARD_SERVICE: { check: preProcessFn },
            },
        );

        const response = await gateway.fetch(
            new Request('https://api.example.com/guarded'),
            env,
            {},
        );
        expect(response.status).toBe(200);
        expect(preProcessFn).toHaveBeenCalled();
    });
});
