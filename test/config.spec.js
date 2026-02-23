import { describe, it, expect } from 'vitest';
import { getApiConfig } from '../src/utils/config.js';

describe('getApiConfig', () => {
  it('loads config from KV and replaces env/secrets placeholders', async () => {
    const rawConfig = {
      paths: [{ method: 'GET', path: '/health', response: { runtime: '$env.RUNTIME' } }],
      authorizer: {
        type: 'auth0',
        domain: 'auth.example.com',
        client_id: 'abc',
        client_secret: '$secret.AUTH0_CLIENT_SECRET',
        redirect_uri: 'https://api.example.com/callback',
        callback_uri: 'https://api.example.com/callback-redirect',
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
        scope: 'openid profile email',
      },
    };

    const env = {
      RUNTIME: 'staging',
      AUTH0_CLIENT_SECRET: 'top-secret',
      CONFIG: {
        get: async () => JSON.stringify(rawConfig),
      },
    };

    const config = await getApiConfig(env);
    expect(config.paths[0].response.runtime).toBe('staging');
    expect(config.authorizer.client_secret).toBe('top-secret');
  });

  it('falls back to local api-config.json when KV config is missing', async () => {
    const config = await getApiConfig({
      CONFIG: {
        get: async () => null,
      },
    });

    expect(Array.isArray(config.paths)).toBe(true);
    expect(config.paths.length).toBeGreaterThan(0);
  });

  it('throws when config retrieval fails', async () => {
    await expect(
      getApiConfig({
        CONFIG: {
          get: async () => {
            throw new Error('kv down');
          },
        },
      })
    ).rejects.toThrow('API configuration is missing or invalid.');
  });

  it('normalizes legacy service bindings and http integration alias', async () => {
    const config = await getApiConfig({
      CONFIG: {
        get: async () =>
          JSON.stringify({
            servicesBindings: [{ alias: 'hook', binding: 'HOOK_SERVICE' }],
            paths: [
              {
                method: 'GET',
                path: '/proxy/{.+}',
                integration: { type: 'http', server: 'upstream' },
              },
            ],
          }),
      },
    });

    expect(config.serviceBindings).toEqual([{ alias: 'hook', binding: 'HOOK_SERVICE' }]);
    expect(config.paths[0].integration.type).toBe('http_proxy');
  });

  it('loads inline config from SAG_API_CONFIG_JSON', async () => {
    const config = await getApiConfig({
      SAG_API_CONFIG_JSON: JSON.stringify({
        paths: [{ method: 'GET', path: '/inline', response: { ok: true } }],
      }),
    });

    expect(config.paths[0].path).toBe('/inline');
  });

  it('throws on schema validation errors in strict mode', async () => {
    await expect(
      getApiConfig({
        SAG_STRICT_CONFIG: 'true',
        SAG_API_CONFIG_JSON: JSON.stringify({
          paths: [{ method: 'INVALID', path: '/bad' }],
        }),
      })
    ).rejects.toThrow('API configuration validation failed');
  });

  it('keeps fail-open behavior for invalid config in compatibility mode', async () => {
    const config = await getApiConfig({
      SAG_API_CONFIG_JSON: JSON.stringify({
        paths: [{ method: 'INVALID', path: '/bad' }],
      }),
    });

    expect(config.paths[0].method).toBe('INVALID');
  });
});
