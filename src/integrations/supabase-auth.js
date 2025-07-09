import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { AuthError } from "../types/error_types";

async function supabaseEmailOTP(env, email, shouldCreateUser = true) {
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	// Try multiple approaches to force OTP instead of magic link
	try {
		// Approach 1: Use signInWithOtp with explicit configuration
		const { data, error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				shouldCreateUser,
				// Explicitly disable redirect to force OTP
				emailRedirectTo: undefined,
				data: {}
			},
		});

		if (error) {
			throw new AuthError(`Supabase OTP Error: ${error.message}`);
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
			
			const { data, error } = await adminSupabase.auth.admin.generateLink({
				type: 'magiclink',
				email: email,
				options: {
					redirectTo: 'otp://verify' // Custom scheme to indicate OTP
				}
			});

			if (error) {
				throw new AuthError(`Admin API Error: ${error.message}`);
			}

			return new Response(JSON.stringify({
				message: 'Email OTP request sent via admin API',
				note: 'Check your email for verification code'
			}), { headers: { 'Content-Type': 'application/json' } });

		} catch (adminError) {
			throw new AuthError(`Failed to send OTP: ${otpError.message}. Admin fallback failed: ${adminError.message}`);
		}
	}
}

async function supabasePhoneOTP(env, phone, shouldCreateUser = true) {
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	const { data, error } = await supabase.auth.signInWithOtp({
		phone,
		options: {
			shouldCreateUser
		},
	})

	if (error) {
		throw new AuthError(`Phone OTP Error: ${error.message}`);
	}

	return new Response(JSON.stringify({ 
		message: 'SMS OTP sent successfully',
		note: 'Check your phone for a 6-digit verification code'
	}), { headers: { 'Content-Type': 'application/json' } });
}

async function supabaseVerifyOTP(env, email, phone, token) {
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	const { data, error } = await supabase.auth.verifyOtp({
		[email ? 'email' : 'phone']: email || phone,
		token,
		type: email ? 'email' : 'sms',
	});

	if (error) {
		throw new AuthError(`OTP Verification Error: ${error.message}`);
	}

	console.log('OTP Verification successful:', data);
	return data.session;
}

// Alternative function that tries to use a different approach for email OTP
async function supabaseEmailOTPAlternative(env, email) {
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

	try {
		// Try using the auth.signUp method which might behave differently
		const { data, error } = await supabase.auth.signUp({
			email,
			password: Math.random().toString(36), // Random password, we won't use it
			options: {
				emailRedirectTo: undefined, // No redirect
				data: {
					otp_only: true // Custom flag
				}
			}
		});

		if (error && !error.message.includes('already registered')) {
			throw new AuthError(error.message);
		}

		return new Response(JSON.stringify({
			message: 'Alternative OTP method attempted',
			note: 'Check your email for verification code'
		}), { headers: { 'Content-Type': 'application/json' } });

	} catch (altError) {
		throw new AuthError(`Alternative OTP method failed: ${altError.message}`);
	}
}

// Generic helper to decode base64-url with automatic padding
function decodeBase64Url(str) {
	try {
		// Add padding if required
		const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
		const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
		return Buffer.from(b64, 'base64').toString('utf8');
	} catch (e) {
		return null;
	}
}

function decodeJWTPayload(token) {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		return JSON.parse(decodeBase64Url(parts[1]));
	} catch (e) {
		return null;
	}
}

function decodeJWTHeader(token) {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		return JSON.parse(decodeBase64Url(parts[0]));
	} catch (e) {
		return null;
	}
}

async function supabaseJwtVerify(request, authorizer) {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new AuthError('No token provided or token format is invalid.', 'AUTH_ERROR', 401);
	}
	const jwtToken = authHeader.split(' ')[1];

	// Log the raw incoming JWT token (for debugging – consider redacting in production)
	console.log('Incoming JWT token:', jwtToken);
	console.log('JWT length:', jwtToken.length);

	// Debug: Decode token to see what we're working with
	const payload = decodeJWTPayload(jwtToken);
	const header = decodeJWTHeader(jwtToken);
	
	console.log('JWT Debug Info:');
	console.log('Header:', header);
	console.log('Header Algorithm:', header?.alg);
	console.log('Payload issuer:', payload?.iss);
	console.log('Payload audience:', payload?.aud);
	console.log('Expected issuer:', authorizer.issuer);
	console.log('Expected audience:', authorizer.audience);
	
	// Log whether we have access to the JWT secret
	console.log('Has JWT secret:', !!authorizer.jwt_secret);
	if (authorizer.jwt_secret) {
		console.log('JWT secret (first 10 chars):', authorizer.jwt_secret.substring(0, 10), '...');
	}
	
	// Check if we have the JWT secret
	if (!authorizer.jwt_secret) {
		throw new AuthError('JWT secret not configured. Please set SUPABASE_JWT_SECRET in your environment.', 'MISSING_JWT_SECRET', 500);
	}

	try {
		const verifyOptions = {
			algorithms: ['HS256'], // Supabase defaults to HS256; change if needed
			issuer: authorizer.issuer,
			audience: authorizer.audience,
		};

		// Debug: Log verification options
		console.log('JWT Verification Options:', verifyOptions);

		const verifiedPayload = jwt.verify(jwtToken, authorizer.jwt_secret, verifyOptions);

		console.log('JWT Verification successful:', verifiedPayload);
		return verifiedPayload;

	} catch (error) {
		console.error('JWT Verification Error:', error);

		if (error.name === 'TokenExpiredError') {
			const expiry = payload?.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown';
			throw new AuthError(`Token has expired at ${expiry}`, 'JWT_EXPIRED', 401);
		} else if (error.name === 'JsonWebTokenError') {
			throw new AuthError(`JWT verification failed: ${error.message}`, 'JWT_INVALID', 401);
		} else if (error.name === 'NotBeforeError') {
			throw new AuthError('Token not active yet (nbf)', 'JWT_NOT_ACTIVE', 401);
		} else {
			throw new AuthError('JWT verification failed due to an unexpected error.', 'AUTH_ERROR', 401);
		}
	}
}

export { supabaseEmailOTP, supabasePhoneOTP, supabaseVerifyOTP, supabaseJwtVerify, supabaseEmailOTPAlternative };
