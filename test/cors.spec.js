import { describe, it, expect } from 'vitest';
import { setCorsHeaders } from '../src/cors.js';

const corsConfig = {
  allow_origins: ['https://app.example.com', 'https://*.example.org', '*'],
  allow_methods: ['GET', 'POST', 'OPTIONS'],
  allow_headers: ['Content-Type', 'Authorization'],
  expose_headers: ['X-Request-Id'],
  allow_credentials: true,
  max_age: 3600,
};

describe('setCorsHeaders', () => {
  it('returns same response when cors config is missing', async () => {
    const request = new Request('https://api.example.com/items');
    const response = new Response('ok', { status: 200 });

    const result = setCorsHeaders(request, response);

    expect(result).toBe(response);
  });

  it('sets exact origin and CORS headers', () => {
    const request = new Request('https://api.example.com/items', {
      headers: { Origin: 'https://app.example.com' },
    });
    const response = new Response('ok', { status: 200 });

    const result = setCorsHeaders(request, response, corsConfig);

    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(result.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,OPTIONS');
    expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(result.headers.get('Vary')).toBe('Origin');
  });

  it('matches wildcard domain patterns', () => {
    const request = new Request('https://api.example.com/items', {
      headers: { Origin: 'https://eu.example.org' },
    });
    const response = new Response('ok', { status: 200 });

    const result = setCorsHeaders(request, response, {
      ...corsConfig,
      allow_origins: ['https://*.example.org'],
    });

    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://eu.example.org');
  });

  it('uses request origin when allow_origins contains * with credentials true', () => {
    const request = new Request('https://api.example.com/items', {
      headers: { Origin: 'https://mobile.example.net' },
    });
    const response = new Response('ok', { status: 200 });

    const result = setCorsHeaders(request, response, {
      ...corsConfig,
      allow_origins: ['*'],
      allow_credentials: true,
    });

    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://mobile.example.net');
  });

  it('does not set allow-origin when request origin is not allowed', () => {
    const request = new Request('https://api.example.com/items', {
      headers: { Origin: 'https://blocked.example.net' },
    });
    const response = new Response('ok', { status: 200 });

    const result = setCorsHeaders(request, response, {
      ...corsConfig,
      allow_origins: ['https://allowed.example.com'],
    });

    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
