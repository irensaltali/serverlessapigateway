import { describe, it, expect } from 'vitest';
import { ValueMapper } from '../src/mapping.js';

describe('ValueMapper.resolveValue', () => {
  it('resolves request header values', () => {
    const request = new Request('https://api.example.com/items', {
      headers: { 'X-Test': 'header-value' },
    });

    const result = ValueMapper.resolveValue('$request.header.X-Test', request, null, null, null);
    expect(result).toBe('header-value');
  });

  it('resolves jwt/config/global/query values', () => {
    const request = new Request('https://api.example.com/items?userId=42');

    expect(ValueMapper.resolveValue('$request.jwt.sub', request, { sub: 'abc' }, null, null)).toBe('abc');
    expect(ValueMapper.resolveValue('$config.api_key', request, null, { api_key: 'local' }, { api_key: 'global' })).toBe('local');
    expect(ValueMapper.resolveValue('$config.region', request, null, {}, { region: 'us' })).toBe('us');
    expect(ValueMapper.resolveValue('$request.query.userId', request, null, null, null)).toBe('42');
  });
});

describe('ValueMapper.modify', () => {
  it('modifies request headers and query params from mapping config', async () => {
    const request = new Request('https://api.example.com/orders?source=app', {
      headers: { Authorization: 'Bearer token' },
    });

    const updated = await ValueMapper.modify({
      request,
      mappingConfig: {
        headers: {
          'x-user-id': '$request.jwt.sub',
          'x-source': '$request.query.source',
        },
        query: {
          user: '$request.jwt.sub',
          source: '$request.query.source',
        },
      },
      jwtPayload: { sub: 'u1' },
      configVariables: {},
      globalVariables: {},
    });

    const updatedUrl = new URL(updated.url);
    expect(updated.headers.get('x-user-id')).toBe('u1');
    expect(updated.headers.get('x-source')).toBe('app');
    expect(updatedUrl.searchParams.get('user')).toBe('u1');
    expect(updatedUrl.searchParams.get('source')).toBe('app');
  });
});

describe('ValueMapper.replaceEnvAndSecrets', () => {
  it('replaces env and secret placeholders recursively', async () => {
    const config = {
      nested: {
        envVar: '$env.RUNTIME',
        secretVar: '$secrets.API_SECRET',
        secretAlias: '$secret.ANOTHER_SECRET',
      },
    };

    const replaced = await ValueMapper.replaceEnvAndSecrets(config, {
      RUNTIME: 'prod',
      API_SECRET: 'secret-1',
      ANOTHER_SECRET: 'secret-2',
    });

    expect(replaced.nested.envVar).toBe('prod');
    expect(replaced.nested.secretVar).toBe('secret-1');
    expect(replaced.nested.secretAlias).toBe('secret-2');
  });
});
