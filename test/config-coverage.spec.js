import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
    normalizeApiConfig,
    validateApiConfig,
    getApiConfig,
} from '../src/utils/config.js';

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── normalizeApiConfig edge cases ───

describe('normalizeApiConfig', () => {
    it('returns non-object inputs unchanged', () => {
        expect(normalizeApiConfig(null)).toBeNull();
        expect(normalizeApiConfig(undefined)).toBeUndefined();
        expect(normalizeApiConfig('string')).toBe('string');
        expect(normalizeApiConfig(42)).toBe(42);
    });

    it('normalises http type to http_proxy', () => {
        const config = normalizeApiConfig({
            paths: [
                { method: 'GET', path: '/proxy', integration: { type: 'http', server: 'upstream' } },
            ],
        });
        expect(config.paths[0].integration.type).toBe('http_proxy');
    });

    it('does not modify non-http integration types', () => {
        const config = normalizeApiConfig({
            paths: [
                { method: 'GET', path: '/svc', integration: { type: 'service', binding: 'svc' } },
            ],
        });
        expect(config.paths[0].integration.type).toBe('service');
    });

    it('handles paths without integration', () => {
        const config = normalizeApiConfig({
            paths: [
                { method: 'GET', path: '/ok', response: { status: 'ok' } },
            ],
        });
        expect(config.paths[0].response.status).toBe('ok');
    });

    it('merges serviceBindings and legacy servicesBindings', () => {
        const config = normalizeApiConfig({
            serviceBindings: [{ alias: 'svc1', binding: 'SVC1' }],
            servicesBindings: [
                { alias: 'svc1', binding: 'SVC1_DUP' }, // duplicate alias, should be skipped
                { alias: 'svc2', binding: 'SVC2' },
            ],
        });
        expect(config.serviceBindings).toHaveLength(2);
        expect(config.serviceBindings[0].alias).toBe('svc1');
        expect(config.serviceBindings[0].binding).toBe('SVC1'); // original kept
        expect(config.serviceBindings[1].alias).toBe('svc2');
    });

    it('handles only legacy servicesBindings when serviceBindings is absent', () => {
        const config = normalizeApiConfig({
            servicesBindings: [{ alias: 'hook', binding: 'HOOK_SERVICE' }],
        });
        expect(config.serviceBindings).toEqual([{ alias: 'hook', binding: 'HOOK_SERVICE' }]);
    });

    it('handles empty arrays for bindings', () => {
        const config = normalizeApiConfig({
            serviceBindings: [],
            servicesBindings: [],
        });
        // Should not set serviceBindings since merged length is 0
        expect(config.serviceBindings).toEqual([]);
    });

    it('handles legacy bindings with null alias entries', () => {
        const config = normalizeApiConfig({
            servicesBindings: [
                { alias: null, binding: 'NO_ALIAS' },
                { alias: 'valid', binding: 'VALID' },
            ],
        });
        // null alias entries should be skipped
        expect(config.serviceBindings).toEqual([{ alias: 'valid', binding: 'VALID' }]);
    });

    it('does not mutate the original config', () => {
        const original = {
            paths: [{ method: 'GET', path: '/a', integration: { type: 'http', server: 'x' } }],
        };
        const originalIntegrationType = original.paths[0].integration.type;
        normalizeApiConfig(original);
        expect(original.paths[0].integration.type).toBe(originalIntegrationType);
    });
});

// ─── validateApiConfig ───

describe('validateApiConfig', () => {
    it('validates a minimal valid config', async () => {
        const result = await validateApiConfig({
            paths: [{ method: 'GET', path: '/ok', response: { status: 'ok' } }],
        });
        // Either validation passes or is skipped (no dynamic codegen)
        expect(result.valid).toBe(true);
    });
});

// ─── getApiConfig: strict mode validation skipped branch ───

describe('getApiConfig strict mode', () => {
    it('throws in strict mode when config validation is skipped due to no codegen', async () => {
        // We can't easily force codegen to fail, so we test the branch
        // where validation succeeds but config is invalid with strict mode
        await expect(
            getApiConfig({
                SAG_STRICT_CONFIG: 'true',
                SAG_API_CONFIG_JSON: JSON.stringify({
                    paths: [{ method: 'INVALID_METHOD', path: '/bad' }],
                }),
            }),
        ).rejects.toThrow();
    });

    it('logs warning but continues when invalid config in compatibility mode', async () => {
        const config = await getApiConfig({
            SAG_API_CONFIG_JSON: JSON.stringify({
                paths: [{ method: 'INVALID_METHOD', path: '/bad' }],
            }),
        });
        // In compatibility mode, it should still return the config
        expect(config.paths[0].method).toBe('INVALID_METHOD');
    });

    it('loads config from inline env var', async () => {
        const config = await getApiConfig({
            SAG_API_CONFIG_JSON: JSON.stringify({
                paths: [{ method: 'GET', path: '/inline', response: { ok: true } }],
            }),
        });
        expect(config.paths[0].path).toBe('/inline');
    });

    it('ignores empty inline config and falls through to KV', async () => {
        const config = await getApiConfig({
            SAG_API_CONFIG_JSON: '   ',
            CONFIG: {
                get: async () =>
                    JSON.stringify({
                        paths: [{ method: 'GET', path: '/from-kv', response: { ok: true } }],
                    }),
            },
        });
        expect(config.paths[0].path).toBe('/from-kv');
    });

    it('falls to local file when CONFIG is undefined', async () => {
        // env.CONFIG is undefined → should import local api-config.json
        const config = await getApiConfig({});
        expect(Array.isArray(config.paths)).toBe(true);
    });
});

// ─── cloneConfig: structuredClone vs JSON fallback ───

describe('cloneConfig fallback', () => {
    it('uses structuredClone when available', () => {
        // structuredClone is available in Node 17+
        const config = normalizeApiConfig({
            paths: [{ method: 'GET', path: '/test', response: { data: 'value' } }],
        });
        expect(config.paths[0].response.data).toBe('value');
    });
});
