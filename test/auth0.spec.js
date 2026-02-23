import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	auth0CallbackHandler,
	getProfile,
	refreshToken,
	validateIdToken,
} from '../src/integrations/auth0.js';
import { AuthError } from '../src/types/error_types.js';

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

describe('auth0 integration error mapping', () => {
	it('returns token payload when callback exchange succeeds', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', id_token: 'b' }), { status: 200 })),
		);

		const payload = await auth0CallbackHandler('code-123', authorizer);
		expect(payload.access_token).toBe('a');
		expect(payload.id_token).toBe('b');
	});

	it('preserves upstream status on callback exchange failure', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })));

		await expect(auth0CallbackHandler('code-123', authorizer)).rejects.toMatchObject({
			name: 'SAGError',
			code: 'AUTH0_UPSTREAM_ERROR',
			statusCode: 400,
		});
	});

	it('maps network failures to 502', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new TypeError('network unavailable');
		}));

		await expect(refreshToken('refresh-token', authorizer)).rejects.toMatchObject({
			name: 'SAGError',
			code: 'AUTH0_NETWORK_ERROR',
			statusCode: 502,
		});
	});

	it('preserves upstream status on userinfo failure', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })));

		await expect(getProfile('token', authorizer)).rejects.toMatchObject({
			name: 'SAGError',
			code: 'AUTH0_UPSTREAM_ERROR',
			statusCode: 403,
		});
	});
});

describe('validateIdToken', () => {
	it('returns auth error when bearer token is missing', async () => {
		await expect(validateIdToken(new Request('https://api.example.com/private'), null, authorizer)).rejects.toBeInstanceOf(AuthError);
	});

	it('returns config error when local jwks config is malformed json', async () => {
		await expect(
			validateIdToken(
				null,
				'test.jwt.token',
				{
					...authorizer,
					jwks_uri: undefined,
					jwks: '{invalid-json',
				},
			),
		).rejects.toMatchObject({
			name: 'AuthError',
			code: 'AUTH_CONFIG_ERROR',
			statusCode: 500,
		});
	});

	it('throws AUTH_CONFIG_ERROR when no jwks source is configured', async () => {
		await expect(
			validateIdToken(
				null,
				'test.jwt.token',
				{
					...authorizer,
					jwks_uri: undefined,
					jwks: undefined,
				},
			),
		).rejects.toMatchObject({
			name: 'AuthError',
			code: 'AUTH_CONFIG_ERROR',
			statusCode: 500,
		});
	});
});
