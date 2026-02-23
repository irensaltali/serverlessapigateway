import { describe, it, expect } from 'vitest';
import { PathOperator } from '../src/path-ops.js';

describe('PathOperator.match', () => {
  it('matches exact paths and methods', () => {
    const result = PathOperator.match('/v1/health', '/v1/health', 'GET', 'GET');

    expect(result.methodMatches).toBe(true);
    expect(result.isExact).toBe(true);
    expect(result.matchedCount).toBe(3);
  });

  it('matches path params and captures values', () => {
    const result = PathOperator.match('/v1/users/{id}', '/v1/users/99', 'GET', 'GET');

    expect(result.methodMatches).toBe(true);
    expect(result.isExact).toBe(false);
    expect(result.params.id).toBe('99');
  });

  it('matches wildcard tail route', () => {
    const result = PathOperator.match('/v1/files/{.+}', '/v1/files/a/b/c', 'GET', 'ANY');

    expect(result.methodMatches).toBe(true);
    expect(result.isWildcard).toBe(true);
    expect(result.matchedCount).toBeGreaterThan(0);
  });

  it('fails on method mismatch', () => {
    const result = PathOperator.match('/v1/health', '/v1/health', 'POST', 'GET');
    expect(result.methodMatches).toBe(false);
    expect(result.matchedCount).toBe(0);
  });

  it('fails when segment counts mismatch without wildcard', () => {
    const result = PathOperator.match('/v1/items', '/v1/items/extra', 'GET', 'GET');
    expect(result.matchedCount).toBe(0);
  });
});
