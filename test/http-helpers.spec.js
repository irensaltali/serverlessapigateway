import { describe, it, expect } from 'vitest';
import { createProxiedRequest } from '../src/requests.js';
import { setPoweredByHeader } from '../src/powered-by.js';
import {
  badRequestResponse,
  noMatchResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalServerErrorResponse,
  configIsMissingResponse,
} from '../src/responses.js';

describe('createProxiedRequest', () => {
  it('creates a proxied request for wildcard proxy routes', () => {
    const request = new Request('https://gateway.example.com/api/v1/proxy/orders/1?x=1', {
      method: 'GET',
      headers: { Authorization: 'Bearer abc' },
    });

    const proxied = createProxiedRequest(
      request,
      { url: 'https://backend.example.com' },
      {
        path: '/api/v1/proxy/{.+}',
        integration: { type: 'http_proxy' },
      }
    );

    expect(proxied.url).toBe('https://backend.example.com/orders/1?x=1');
    expect(proxied.headers.get('Authorization')).toBe('Bearer abc');
  });

  it('keeps full request path for non-wildcard proxy routes', () => {
    const request = new Request('https://gateway.example.com/api/v1/health?x=1', {
      method: 'GET',
    });

    const proxied = createProxiedRequest(
      request,
      { url: 'https://backend.example.com/base' },
      {
        path: '/api/v1/health',
        integration: { type: 'http_proxy' },
      }
    );

    expect(proxied.url).toBe('https://backend.example.com/base/api/v1/health?x=1');
  });

  it('preserves request path for root wildcard route', () => {
    const request = new Request('https://gateway.example.com/v1/items/2?debug=true', {
      method: 'GET',
    });

    const proxied = createProxiedRequest(
      request,
      { url: 'https://backend.example.com/prefix/' },
      {
        path: '/{.+}',
        integration: { type: 'http_proxy' },
      }
    );

    expect(proxied.url).toBe('https://backend.example.com/prefix/v1/items/2?debug=true');
  });

  it('removes configured wildcard prefix and keeps trailing slash semantics', () => {
    const request = new Request('https://gateway.example.com/prefix', {
      method: 'GET',
    });

    const proxied = createProxiedRequest(
      request,
      { url: 'https://backend.example.com/base' },
      {
        path: '/prefix/{.+}',
        integration: { type: 'http_proxy' },
      }
    );

    expect(proxied.url).toBe('https://backend.example.com/base/');
  });
});

describe('setPoweredByHeader', () => {
  it('adds x-powered-by header to responses', () => {
    const input = new Response('ok', { status: 200 });
    const output = setPoweredByHeader(input);
    expect(output.headers.get('X-Powered-By')).toContain('serverlessapigateway');
  });
});

describe('response factories', () => {
  it('returns expected status codes', () => {
    expect(badRequestResponse().status).toBe(400);
    expect(noMatchResponse().status).toBe(404);
    expect(unauthorizedResponse().status).toBe(401);
    expect(forbiddenResponse().status).toBe(403);
    expect(notFoundResponse().status).toBe(404);
    expect(internalServerErrorResponse().status).toBe(500);
    expect(configIsMissingResponse().status).toBe(501);
  });
});
