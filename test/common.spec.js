import { describe, it, expect } from 'vitest';
import { safeStringify, generateJsonResponse } from '../src/common.js';

describe('safeStringify', () => {
  it('filters out non-serializable fields', () => {
    const input = {
      ok: true,
      fn: () => {},
      undef: undefined,
      sym: Symbol('x'),
      p: Promise.resolve(1),
    };

    const parsed = JSON.parse(safeStringify(input));
    expect(parsed).toEqual({ ok: true });
  });
});

describe('generateJsonResponse', () => {
  it('passes through Response objects', async () => {
    const response = new Response('ok', { status: 201 });
    const result = generateJsonResponse(response);

    expect(result.status).toBe(201);
    expect(await result.text()).toBe('ok');
  });

  it('handles object payload with error fields', async () => {
    const result = generateJsonResponse({ error: 'boom', statusCode: 422, message: 'failed' });
    const body = await result.json();

    expect(result.status).toBe(422);
    expect(body.status).toBe('error');
    expect(body.error).toBe('boom');
  });

  it('handles plain object success payloads', async () => {
    const result = generateJsonResponse({ value: 123 });
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.status).toBe('success');
    expect(body.data.value).toBe(123);
  });

  it('handles null and string payloads', async () => {
    const nullResponse = generateJsonResponse(null);
    expect(nullResponse.status).toBe(200);
    expect(await nullResponse.text()).toBe('');

    const stringResponse = generateJsonResponse('plain');
    expect(stringResponse.status).toBe(200);
    expect(await stringResponse.text()).toBe('plain');
  });

  it('returns 400 for unsupported primitive payloads', () => {
    const result = generateJsonResponse(42);
    expect(result.status).toBe(400);
  });
});
