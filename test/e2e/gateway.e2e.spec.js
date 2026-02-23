import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';

let worker;
const runE2E = process.env.RUN_LOCAL_WORKER_E2E === 'true';
const describeE2E = runE2E ? describe : describe.skip;

describeE2E('gateway e2e (local worker runtime)', () => {
	beforeAll(async () => {
		const e2eConfig = {
			cors: {
				allow_origins: ['https://app.example.com'],
				allow_methods: ['GET', 'POST', 'OPTIONS'],
				allow_headers: ['Authorization', 'Content-Type', 'X-Refresh-Token'],
				expose_headers: ['X-Request-Id'],
				allow_credentials: true,
				max_age: 300,
			},
			authorizer: {
				type: 'auth0',
				domain: 'tenant.auth0.com',
				client_id: 'client-id',
				client_secret: 'client-secret',
				redirect_uri: 'https://api.example.com/callback',
				scope: 'openid',
				jwks: JSON.stringify({ keys: [] }),
			},
			servers: [{ alias: 'local-upstream', url: 'https://example.invalid/backend' }],
			paths: [
				{ method: 'GET', path: '/health', response: { status: 'ok' } },
				{
					method: 'GET',
					path: '/private',
					auth: true,
					response: { private: true },
				},
				{
					method: 'GET',
					path: '/refresh',
					auth: false,
					integration: { type: 'auth0_refresh' },
				},
				{
					method: 'GET',
					path: '/proxy/{.+}',
					integration: { type: 'http_proxy', server: 'local-upstream' },
				},
			],
		};

		worker = await unstable_dev('src/index.js', {
			experimental: { disableExperimentalWarning: true },
			vars: {
				SAG_API_CONFIG_JSON: JSON.stringify(e2eConfig),
			},
		});
	}, 120_000);

	afterAll(async () => {
		if (worker) {
			await worker.stop();
		}
	});

	it('serves static endpoint', async () => {
		const response = await worker.fetch('/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('handles CORS preflight with default 204 response', async () => {
		const response = await worker.fetch('/health', {
			method: 'OPTIONS',
			headers: { Origin: 'https://app.example.com' },
		});
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
	});

	it('rejects unauthorized access to protected routes', async () => {
		const response = await worker.fetch('/private');
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.code).toBe('AUTH_ERROR');
	});

	it('returns deterministic 400 for refresh route without token', async () => {
		const response = await worker.fetch('/refresh');
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.code).toBe('missing_refresh_token');
	});

	it('handles wildcard proxy route with a deterministic upstream failure', async () => {
		const response = await worker.fetch('/proxy/orders/1?x=1');
		expect(response.status).toBe(500);
	});
}, 90_000);
