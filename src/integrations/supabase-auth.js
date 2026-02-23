import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { AuthError } from "../types/error_types";

const SUPABASE_ERROR_CODES = {
	ENV_MISSING: 'SUPABASE_ENV_MISSING',
	OTP_SEND_FAILED: 'SUPABASE_OTP_SEND_FAILED',
	OTP_VERIFY_FAILED: 'SUPABASE_OTP_VERIFY_FAILED',
	OTP_ALT_FAILED: 'SUPABASE_OTP_ALT_FAILED',
	MISSING_JWT_SECRET: 'MISSING_JWT_SECRET',
	JWT_EXPIRED: 'JWT_EXPIRED',
	JWT_INVALID: 'JWT_INVALID',
	JWT_NOT_ACTIVE: 'JWT_NOT_ACTIVE',
	AUTH_ERROR: 'AUTH_ERROR',
};

function createSupabaseError(message, code, statusCode) {
	return new AuthError(message, code, statusCode);
}

function assertSupabaseEnvironment(env) {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
		throw createSupabaseError(
			'Supabase environment is not configured.',
			SUPABASE_ERROR_CODES.ENV_MISSING,
			500,
		);
	}
}

async function supabaseEmailOTP(env, email, shouldCreateUser = true) {
	assertSupabaseEnvironment(env);
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	// Try multiple approaches to force OTP instead of magic link
	try {
		// Approach 1: Use signInWithOtp with explicit configuration
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				shouldCreateUser,
				// Explicitly disable redirect to force OTP
				emailRedirectTo: undefined,
				data: {}
			},
		});

		if (error) {
			throw createSupabaseError(
				`Supabase OTP Error: ${error.message}`,
				SUPABASE_ERROR_CODES.OTP_SEND_FAILED,
				400,
			);
		}

		return new Response(JSON.stringify({ 
			message: 'Email OTP sent successfully',
			note: 'Check your email for a 6-digit verification code (not a link)',
			debug: 'If you received a magic link, check your Supabase project Auth settings'
		}), { headers: { 'Content-Type': 'application/json' } });

	} catch (otpError) {
		// Approach 2: Try using auth admin API if regular OTP fails
		try {
			const adminSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
			
			const { error } = await adminSupabase.auth.admin.generateLink({
				type: 'magiclink',
				email: email,
				options: {
					redirectTo: 'otp://verify' // Custom scheme to indicate OTP
				}
			});

			if (error) {
				throw createSupabaseError(
					`Admin API Error: ${error.message}`,
					SUPABASE_ERROR_CODES.OTP_SEND_FAILED,
					502,
				);
			}

			return new Response(JSON.stringify({
				message: 'Email OTP request sent via admin API',
				note: 'Check your email for verification code'
			}), { headers: { 'Content-Type': 'application/json' } });

		} catch (adminError) {
			throw createSupabaseError(
				`Failed to send OTP: ${otpError.message}. Admin fallback failed: ${adminError.message}`,
				SUPABASE_ERROR_CODES.OTP_SEND_FAILED,
				502,
			);
		}
	}
}

async function supabasePhoneOTP(env, phone, shouldCreateUser = true) {
	assertSupabaseEnvironment(env);
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	const { error } = await supabase.auth.signInWithOtp({
		phone,
		options: {
			shouldCreateUser
		},
	})

	if (error) {
		throw createSupabaseError(
			`Phone OTP Error: ${error.message}`,
			SUPABASE_ERROR_CODES.OTP_SEND_FAILED,
			400,
		);
	}

	return new Response(JSON.stringify({ 
		message: 'SMS OTP sent successfully',
		note: 'Check your phone for a 6-digit verification code'
	}), { headers: { 'Content-Type': 'application/json' } });
}

async function supabaseVerifyOTP(env, email, phone, token) {
	assertSupabaseEnvironment(env);
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	const { data, error } = await supabase.auth.verifyOtp({
		[email ? 'email' : 'phone']: email || phone,
		token,
		type: email ? 'email' : 'sms',
	});

	if (error) {
		throw createSupabaseError(
			`OTP Verification Error: ${error.message}`,
			SUPABASE_ERROR_CODES.OTP_VERIFY_FAILED,
			401,
		);
	}

	return data.session;
}

// Alternative function that tries to use a different approach for email OTP
async function supabaseEmailOTPAlternative(env, email) {
	assertSupabaseEnvironment(env);
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	try {
		// Try using the auth.signUp method which might behave differently
			const { error } = await supabase.auth.signUp({
				email,
				password: crypto.randomUUID(), // Not used; only to satisfy API requirements
				options: {
				emailRedirectTo: undefined, // No redirect
				data: {
					otp_only: true // Custom flag
				}
			}
			});

			if (error && !error.message.includes('already registered')) {
				throw createSupabaseError(
					error.message,
					SUPABASE_ERROR_CODES.OTP_ALT_FAILED,
					400,
				);
			}

		return new Response(JSON.stringify({
			message: 'Alternative OTP method attempted',
			note: 'Check your email for verification code'
		}), { headers: { 'Content-Type': 'application/json' } });

	} catch (altError) {
		if (altError instanceof AuthError) {
			throw altError;
		}
		throw createSupabaseError(
			`Alternative OTP method failed: ${altError.message}`,
			SUPABASE_ERROR_CODES.OTP_ALT_FAILED,
			502,
		);
	}
}

async function supabaseJwtVerify(request, authorizer) {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new AuthError('No token provided or token format is invalid.', 'AUTH_ERROR', 401);
	}
	const jwtToken = authHeader.split(' ')[1];
	
	// Check if we have the JWT secret
	if (!authorizer.jwt_secret) {
		throw createSupabaseError(
			'JWT secret not configured. Please set SUPABASE_JWT_SECRET in your environment.',
			SUPABASE_ERROR_CODES.MISSING_JWT_SECRET,
			500,
		);
	}

	try {
		const verifyOptions = {
			algorithms: ['HS256'], // Supabase defaults to HS256; change if needed
			issuer: authorizer.issuer,
			audience: authorizer.audience,
		};

			const verifiedPayload = jwt.verify(jwtToken, authorizer.jwt_secret, verifyOptions);
			return verifiedPayload;

	} catch (error) {
		if (error.name === 'TokenExpiredError') {
			throw createSupabaseError('Token has expired.', SUPABASE_ERROR_CODES.JWT_EXPIRED, 401);
		} else if (error.name === 'JsonWebTokenError') {
			throw createSupabaseError(`JWT verification failed: ${error.message}`, SUPABASE_ERROR_CODES.JWT_INVALID, 401);
		} else if (error.name === 'NotBeforeError') {
			throw createSupabaseError('Token not active yet (nbf)', SUPABASE_ERROR_CODES.JWT_NOT_ACTIVE, 401);
		} else {
			throw createSupabaseError(
				'JWT verification failed due to an unexpected error.',
				SUPABASE_ERROR_CODES.AUTH_ERROR,
				401,
			);
		}
	}
}

export { supabaseEmailOTP, supabasePhoneOTP, supabaseVerifyOTP, supabaseJwtVerify, supabaseEmailOTPAlternative };
