import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import gateway from '../src/index.js';

function buildEnv(config) {
  return {
    CONFIG: {
      get: async () => JSON.stringify(config),
    },
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

async function createJwtToken(secret, issuer, audience, payload = { sub: 'user-1' }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret));
}

describe('gateway fetch', () => {
  it('returns 404 for unmatched routes', async () => {
    const env = buildEnv({
      paths: [{ method: 'GET', path: '/ok', response: { status: 'ok' } }],
    });

    const response = await gateway.fetch(new Request('https://api.example.com/missing'), env, {});
    expect(response.status).toBe(404);
  });

  it('handles default CORS preflight responses', async () => {
    const env = buildEnv({
      cors: baseCors,
      paths: [{ method: 'GET', path: '/ok', response: { status: 'ok' } }],
    });

    const response = await gateway.fetch(
      new Request('https://api.example.com/ok', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      }),
      env,
      {}
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });

  it('returns 401 when jwt-protected route has no bearer token', async () => {
    const env = buildEnv({
      authorizer: {
        type: 'jwt',
        secret: 'secret',
        algorithm: 'HS256',
        audience: 'aud',
        issuer: 'iss',
      },
      paths: [{ method: 'GET', path: '/private', auth: true, response: { ok: true } }],
    });

    const response = await gateway.fetch(new Request('https://api.example.com/private'), env, {});
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe('AUTH_ERROR');
  });

  it('returns 401 for auth0 userinfo route without token', async () => {
    const env = buildEnv({
      paths: [
        {
          method: 'GET',
          path: '/userinfo',
          auth: false,
          integration: { type: 'auth0_userinfo' },
        },
      ],
    });

    const response = await gateway.fetch(new Request('https://api.example.com/userinfo'), env, {});
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe('missing_access_token');
  });

  it('returns 400 for refresh route when refresh token is missing', async () => {
    const env = buildEnv({
      authorizer: {
        type: 'auth0',
        domain: 'example.auth0.com',
        client_id: 'cid',
        client_secret: 'secret',
        redirect_uri: 'https://api.example.com/callback',
        callback_uri: 'https://api.example.com/callback-redirect',
        jwks: JSON.stringify({ keys: [] }),
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

    const response = await gateway.fetch(new Request('https://api.example.com/refresh'), env, {});
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('missing_refresh_token');
  });

  it('returns static response payloads for matched route', async () => {
    const env = buildEnv({
      paths: [{ method: 'GET', path: '/ok', response: { status: 'healthy' } }],
    });

    const response = await gateway.fetch(new Request('https://api.example.com/ok'), env, {});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  it('prefers exact method match over ANY for the same route', async () => {
    const env = buildEnv({
      paths: [
        { method: 'ANY', path: '/method', response: { variant: 'any' } },
        { method: 'GET', path: '/method', response: { variant: 'get' } },
      ],
    });

    const response = await gateway.fetch(new Request('https://api.example.com/method'), env, {});
    const body = await response.json();
    expect(body.variant).toBe('get');
  });

  it('uses explicit OPTIONS route if present', async () => {
    const env = buildEnv({
      cors: baseCors,
      paths: [
        { method: 'GET', path: '/ok', response: { status: 'ok' } },
        { method: 'OPTIONS', path: '/ok', response: { status: 'explicit-options' } },
      ],
    });

    const response = await gateway.fetch(
      new Request('https://api.example.com/ok', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      }),
      env,
      {}
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('explicit-options');
  });

  it('accepts valid jwt for protected routes', async () => {
    const secret = 'secret';
    const issuer = 'iss';
    const audience = 'aud';
    const token = await createJwtToken(secret, issuer, audience, { sub: 'user-2' });
    const env = buildEnv({
      authorizer: {
        type: 'jwt',
        secret,
        algorithm: 'HS256',
        audience,
        issuer,
      },
      paths: [{ method: 'GET', path: '/private', auth: true, response: { ok: true } }],
    });

    const response = await gateway.fetch(
      new Request('https://api.example.com/private', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      {}
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
