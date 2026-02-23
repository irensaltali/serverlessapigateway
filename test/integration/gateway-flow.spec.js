import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import gateway from '../../src/index.js';

function buildEnv(config, bindings = {}) {
	return {
		CONFIG: {
			get: async () => JSON.stringify(config),
		},
		...bindings,
	};
}

async function createJwtToken(secret, issuer, audience, payload = { sub: 'integration-user' }) {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuer(issuer)
		.setAudience(audience)
		.setExpirationTime('2h')
		.sign(new TextEncoder().encode(secret));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('gateway integration flow', () => {
	it('short-circuits request when pre_process hook returns a response', async () => {
		const beforeHook = vi.fn(async () => new Response(JSON.stringify({ blocked: true }), { status: 429 }));
		const serviceCall = vi.fn(async () => ({ ok: true }));
		const env = buildEnv(
			{
				serviceBindings: [
					{ alias: 'hooks', binding: 'HOOKS' },
					{ alias: 'target', binding: 'TARGET' },
				],
				paths: [
					{
						method: 'POST',
						path: '/orders',
						pre_process: { binding: 'hooks', function: 'before' },
						integration: { type: 'service_binding', binding: 'target', function: 'run' },
					},
				],
			},
			{
				HOOKS: { before: beforeHook },
				TARGET: { run: serviceCall },
			},
		);

		const response = await gateway.fetch(new Request('https://api.example.com/orders', { method: 'POST' }), env, {});
		expect(response.status).toBe(429);
		expect(serviceCall).not.toHaveBeenCalled();
		expect(beforeHook).toHaveBeenCalledTimes(1);
	});

	it('executes service_binding integration when pre_process allows request', async () => {
		const beforeHook = vi.fn(async () => true);
		const serviceCall = vi.fn(async () => ({ orderId: 42 }));
		const env = buildEnv(
			{
				serviceBindings: [
					{ alias: 'hooks', binding: 'HOOKS' },
					{ alias: 'target', binding: 'TARGET' },
				],
				paths: [
					{
						method: 'POST',
						path: '/orders',
						pre_process: { binding: 'hooks', function: 'before' },
						integration: { type: 'service_binding', binding: 'target', function: 'run' },
					},
				],
			},
			{
				HOOKS: { before: beforeHook },
				TARGET: { run: serviceCall },
			},
		);

		const response = await gateway.fetch(new Request('https://api.example.com/orders', { method: 'POST' }), env, {});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('success');
		expect(body.data.orderId).toBe(42);
		expect(serviceCall).toHaveBeenCalledTimes(1);
	});

	it('executes service integration with configured local entrypoint', async () => {
		const env = buildEnv({
			services: [{ alias: 'endpoint1', entrypoint: './services/endpoint1' }],
			paths: [{ method: 'GET', path: '/service', integration: { type: 'service', binding: 'endpoint1' } }],
		});

		const response = await gateway.fetch(new Request('https://api.example.com/service'), env, {});
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('Hello from Worker 1');
	});

	it('applies mapping and proxies request using http alias integration', async () => {
		const issuer = 'https://issuer.example.com';
		const audience = 'api-audience';
		const secret = 'proxy-secret';
		const token = await createJwtToken(secret, issuer, audience, { sub: 'user-123' });
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const env = buildEnv({
			servers: [{ alias: 'upstream', url: 'https://upstream.example.com/base' }],
			variables: { region: 'eu-west-1' },
			authorizer: {
				type: 'jwt',
				secret,
				algorithm: 'HS256',
				issuer,
				audience,
			},
			paths: [
				{
					method: 'GET',
					path: '/proxy/{.+}',
					auth: true,
					integration: { type: 'http', server: 'upstream' },
					mapping: {
						headers: {
							'x-user-id': '$request.jwt.sub',
							'x-source': '$request.query.source',
							'x-api-key': '$config.api_key',
							'x-region': '$config.region',
						},
						query: {
							user: '$request.jwt.sub',
						},
					},
					variables: { api_key: 'api-key-1' },
				},
			],
		});

		const response = await gateway.fetch(
			new Request('https://api.example.com/proxy/orders/7?source=web', {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}),
			env,
			{},
		);
		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const proxiedRequest = fetchMock.mock.calls[0][0];
		const proxiedUrl = new URL(proxiedRequest.url);
		expect(proxiedUrl.origin).toBe('https://upstream.example.com');
		expect(proxiedUrl.pathname).toBe('/base/orders/7');
		expect(proxiedUrl.searchParams.get('source')).toBe('web');
		expect(proxiedUrl.searchParams.get('user')).toBe('user-123');
		expect(proxiedRequest.headers.get('x-user-id')).toBe('user-123');
		expect(proxiedRequest.headers.get('x-source')).toBe('web');
		expect(proxiedRequest.headers.get('x-api-key')).toBe('api-key-1');
		expect(proxiedRequest.headers.get('x-region')).toBe('eu-west-1');
	});
});
