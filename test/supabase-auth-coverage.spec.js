import { afterEach, describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}));

import {
    supabaseEmailOTP,
    supabasePhoneOTP,
    supabaseVerifyOTP,
    supabaseJwtVerify,
    supabaseEmailOTPAlternative,
} from '../src/integrations/supabase-auth.js';
import { AuthError } from '../src/types/error_types.js';

afterEach(() => {
    vi.restoreAllMocks();
    createClientMock.mockReset();
});

const validEnv = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

// ─── supabaseEmailOTP: success path and admin fallback ───

describe('supabaseEmailOTP extended paths', () => {
    it('returns success response when signInWithOtp succeeds (line 56)', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signInWithOtp: vi.fn(async () => ({ error: null })),
            },
        });

        const response = await supabaseEmailOTP(validEnv, 'test@example.com');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.message).toContain('Email OTP sent successfully');
    });

    it('returns success via admin fallback when OTP fails but admin succeeds (line 83)', async () => {
        createClientMock
            .mockReturnValueOnce({
                auth: {
                    signInWithOtp: vi.fn(async () => ({ error: { message: 'rate limited' } })),
                },
            })
            .mockReturnValueOnce({
                auth: {
                    admin: {
                        generateLink: vi.fn(async () => ({ error: null })),
                    },
                },
            });

        const response = await supabaseEmailOTP(validEnv, 'test@example.com');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.message).toContain('admin API');
    });

    it('throws SUPABASE_ENV_MISSING for emailOTP with incomplete env', async () => {
        await expect(supabaseEmailOTP({ SUPABASE_URL: 'url' }, 'test@example.com')).rejects.toMatchObject({
            name: 'AuthError',
            code: 'SUPABASE_ENV_MISSING',
            statusCode: 500,
        });
    });
});

// ─── supabasePhoneOTP: success path (line 117) ───

describe('supabasePhoneOTP success path', () => {
    it('returns success response when phone OTP succeeds', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signInWithOtp: vi.fn(async () => ({ error: null })),
            },
        });

        const response = await supabasePhoneOTP(validEnv, '+12025550100');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.message).toContain('SMS OTP sent successfully');
    });
});

// ─── supabaseVerifyOTP: success path (line 141) ───

describe('supabaseVerifyOTP success path', () => {
    it('returns session data when OTP verification succeeds for email', async () => {
        const mockSession = {
            access_token: 'at',
            refresh_token: 'rt',
            user: { id: 'u1' },
        };
        createClientMock.mockReturnValue({
            auth: {
                verifyOtp: vi.fn(async () => ({
                    data: { session: mockSession },
                    error: null,
                })),
            },
        });

        const result = await supabaseVerifyOTP(validEnv, 'test@example.com', null, '123456');
        expect(result).toEqual(mockSession);
    });

    it('returns session data when OTP verification succeeds for phone', async () => {
        const mockSession = {
            access_token: 'at',
            refresh_token: 'rt',
            user: { id: 'u2' },
        };
        createClientMock.mockReturnValue({
            auth: {
                verifyOtp: vi.fn(async () => ({
                    data: { session: mockSession },
                    error: null,
                })),
            },
        });

        const result = await supabaseVerifyOTP(validEnv, null, '+12025550100', '654321');
        expect(result).toEqual(mockSession);
    });
});

// ─── supabaseEmailOTPAlternative: all paths (lines 145–184) ───

describe('supabaseEmailOTPAlternative', () => {
    it('returns success when signUp succeeds (no error)', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signUp: vi.fn(async () => ({ error: null })),
            },
        });

        const response = await supabaseEmailOTPAlternative(validEnv, 'test@example.com');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.message).toContain('Alternative OTP method attempted');
    });

    it('returns success when signUp reports "already registered" (non-fatal error)', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signUp: vi.fn(async () => ({
                    error: { message: 'User already registered' },
                })),
            },
        });

        const response = await supabaseEmailOTPAlternative(validEnv, 'test@example.com');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.message).toContain('Alternative OTP method attempted');
    });

    it('throws SUPABASE_OTP_ALT_FAILED when signUp returns a non-registration error', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signUp: vi.fn(async () => ({
                    error: { message: 'rate limit exceeded' },
                })),
            },
        });

        await expect(supabaseEmailOTPAlternative(validEnv, 'test@example.com')).rejects.toMatchObject({
            name: 'AuthError',
            code: 'SUPABASE_OTP_ALT_FAILED',
            statusCode: 400,
        });
    });

    it('throws SUPABASE_OTP_ALT_FAILED when signUp throws a non-AuthError exception', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signUp: vi.fn(async () => {
                    throw new Error('network failure');
                }),
            },
        });

        await expect(supabaseEmailOTPAlternative(validEnv, 'test@example.com')).rejects.toMatchObject({
            name: 'AuthError',
            code: 'SUPABASE_OTP_ALT_FAILED',
            statusCode: 502,
        });
    });

    it('re-throws AuthError from alternative OTP', async () => {
        createClientMock.mockReturnValue({
            auth: {
                signUp: vi.fn(async () => {
                    throw new AuthError('auth broke', 'AUTH_ERROR', 401);
                }),
            },
        });

        await expect(supabaseEmailOTPAlternative(validEnv, 'test@example.com')).rejects.toMatchObject({
            name: 'AuthError',
            code: 'AUTH_ERROR',
            statusCode: 401,
        });
    });

    it('throws SUPABASE_ENV_MISSING for alternative OTP with incomplete env', async () => {
        await expect(supabaseEmailOTPAlternative({}, 'test@example.com')).rejects.toMatchObject({
            name: 'AuthError',
            code: 'SUPABASE_ENV_MISSING',
            statusCode: 500,
        });
    });
});

// ─── supabaseJwtVerify: additional error branches (lines 218–221) ───

describe('supabaseJwtVerify additional branches', () => {
    const secret = 'secret-123';
    const authorizer = {
        jwt_secret: secret,
        issuer: 'https://issuer.example.com',
        audience: 'authenticated',
    };

    it('returns verified payload on success', async () => {
        const token = jwt.sign(
            { sub: 'u1', role: 'authenticated' },
            secret,
            {
                algorithm: 'HS256',
                issuer: authorizer.issuer,
                audience: authorizer.audience,
            },
        );

        const request = new Request('https://api.example.com/private', {
            headers: { Authorization: `Bearer ${token}` },
        });

        const payload = await supabaseJwtVerify(request, authorizer);
        expect(payload.sub).toBe('u1');
        expect(payload.role).toBe('authenticated');
    });

    it('returns JWT_NOT_ACTIVE for tokens with future nbf', async () => {
        const token = jwt.sign(
            { sub: 'u1' },
            secret,
            {
                algorithm: 'HS256',
                issuer: authorizer.issuer,
                audience: authorizer.audience,
                notBefore: '1h', // Token not valid for another hour
            },
        );

        const request = new Request('https://api.example.com/private', {
            headers: { Authorization: `Bearer ${token}` },
        });

        await expect(supabaseJwtVerify(request, authorizer)).rejects.toMatchObject({
            name: 'AuthError',
            code: 'JWT_NOT_ACTIVE',
            statusCode: 401,
        });
    });

    it('returns AUTH_ERROR for unexpected error types', async () => {
        // Token signed with wrong algorithm to trigger an unexpected error
        const token = jwt.sign(
            { sub: 'u1' },
            'different-secret',
            {
                algorithm: 'HS256',
                issuer: authorizer.issuer,
                audience: authorizer.audience,
            },
        );

        const request = new Request('https://api.example.com/private', {
            headers: { Authorization: `Bearer ${token}` },
        });

        await expect(supabaseJwtVerify(request, authorizer)).rejects.toMatchObject({
            name: 'AuthError',
            statusCode: 401,
        });
    });

    it('throws AUTH_ERROR when Authorization header is missing', async () => {
        const request = new Request('https://api.example.com/private');

        await expect(supabaseJwtVerify(request, authorizer)).rejects.toMatchObject({
            name: 'AuthError',
            code: 'AUTH_ERROR',
            statusCode: 401,
        });
    });

    it('throws AUTH_ERROR when Authorization header is not Bearer', async () => {
        const request = new Request('https://api.example.com/private', {
            headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        });

        await expect(supabaseJwtVerify(request, authorizer)).rejects.toMatchObject({
            name: 'AuthError',
            code: 'AUTH_ERROR',
            statusCode: 401,
        });
    });
});
