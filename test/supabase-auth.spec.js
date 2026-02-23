import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const { createClientMock } = vi.hoisted(() => ({
	createClientMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: createClientMock,
}));

import {
	supabaseEmailOTP,
	supabaseJwtVerify,
	supabasePhoneOTP,
	supabaseVerifyOTP,
} from '../src/integrations/supabase-auth.js';

afterEach(() => {
	vi.restoreAllMocks();
	createClientMock.mockReset();
});

const validEnv = {
	SUPABASE_URL: 'https://example.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

describe('supabase auth error taxonomy', () => {
	it('returns SUPABASE_ENV_MISSING when environment bindings are absent', async () => {
		await expect(supabaseEmailOTP({}, 'test@example.com')).rejects.toMatchObject({
			name: 'AuthError',
			code: 'SUPABASE_ENV_MISSING',
			statusCode: 500,
		});
	});

	it('returns deterministic code/status when OTP send and fallback both fail', async () => {
		createClientMock
			.mockReturnValueOnce({
				auth: {
					signInWithOtp: vi.fn(async () => ({ error: { message: 'bad email' } })),
				},
			})
			.mockReturnValueOnce({
				auth: {
					admin: {
						generateLink: vi.fn(async () => ({ error: { message: 'upstream unavailable' } })),
					},
				},
			});

		await expect(supabaseEmailOTP(validEnv, 'test@example.com')).rejects.toMatchObject({
			name: 'AuthError',
			code: 'SUPABASE_OTP_SEND_FAILED',
			statusCode: 502,
		});
	});

	it('returns deterministic code/status for phone OTP failures', async () => {
		createClientMock.mockReturnValue({
			auth: {
				signInWithOtp: vi.fn(async () => ({ error: { message: 'invalid phone' } })),
			},
		});

		await expect(supabasePhoneOTP(validEnv, '+12025550100')).rejects.toMatchObject({
			name: 'AuthError',
			code: 'SUPABASE_OTP_SEND_FAILED',
			statusCode: 400,
		});
	});

	it('returns deterministic code/status for OTP verify failures', async () => {
		createClientMock.mockReturnValue({
			auth: {
				verifyOtp: vi.fn(async () => ({ error: { message: 'token mismatch' } })),
			},
		});

		await expect(supabaseVerifyOTP(validEnv, 'test@example.com', null, '123456')).rejects.toMatchObject({
			name: 'AuthError',
			code: 'SUPABASE_OTP_VERIFY_FAILED',
			statusCode: 401,
		});
	});
});

describe('supabaseJwtVerify', () => {
	const secret = 'secret-123';
	const authorizer = {
		jwt_secret: secret,
		issuer: 'https://issuer.example.com',
		audience: 'authenticated',
	};

	it('returns MISSING_JWT_SECRET when secret is absent', async () => {
		const request = new Request('https://api.example.com/private', {
			headers: { Authorization: 'Bearer token' },
		});

		await expect(supabaseJwtVerify(request, { issuer: authorizer.issuer, audience: authorizer.audience })).rejects.toMatchObject({
			name: 'AuthError',
			code: 'MISSING_JWT_SECRET',
			statusCode: 500,
		});
	});

	it('returns JWT_EXPIRED for expired tokens', async () => {
		const expiredToken = jwt.sign({ sub: 'u1' }, secret, {
			algorithm: 'HS256',
			expiresIn: -1,
			issuer: authorizer.issuer,
			audience: authorizer.audience,
		});
		const request = new Request('https://api.example.com/private', {
			headers: { Authorization: `Bearer ${expiredToken}` },
		});

		await expect(supabaseJwtVerify(request, authorizer)).rejects.toMatchObject({
			name: 'AuthError',
			code: 'JWT_EXPIRED',
			statusCode: 401,
		});
	});

	it('returns JWT_INVALID for malformed tokens', async () => {
		const request = new Request('https://api.example.com/private', {
			headers: { Authorization: 'Bearer malformed.token' },
		});

		await expect(supabaseJwtVerify(request, authorizer)).rejects.toMatchObject({
			name: 'AuthError',
			code: 'JWT_INVALID',
			statusCode: 401,
		});
	});
});
