import {jwtVerify, errors } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { AuthError } from "../types/error_types";

async function supabaseEmailOTP(env, email, shouldCreateUser = true) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser
        },
    })

    return new Response(JSON.stringify({ message: 'OTP sent successfully' }), { headers: { 'Content-Type': 'application/json' } });
}

async function supabasePhoneOTP(env, phone, shouldCreateUser = true) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    const { data, error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
            shouldCreateUser,
        },
    })

    return new Response(JSON.stringify({ message: 'OTP sent successfully' }), { headers: { 'Content-Type': 'application/json' } });
}


async function supabaseVerifyOTP(env, email, phone, token) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    const { data, error } = await supabase.auth.verifyOtp({
        [email ? 'email' : 'phone']: email || phone,
        token,
        type: email ? 'email' : 'sms',
    });

    if (error) {
        throw new AuthError(error.message);
    }

    console.log(data);
    return data.session;
}

async function supabaseJwtVerify(env, request, apiConfig) {
	const secret = env.SUPABASE_KEY;
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new AuthError('No token provided or token format is invalid.', 'AUTH_ERROR', 401);
	}
	const jwt = authHeader.split(' ')[1];

	try {
		const { payload, protectedHeader } = await jwtVerify(jwt, secret, {
			issuer: apiConfig.authorizer?.issuer,
			audience: apiConfig.authorizer?.audience,
		});

		return payload;
	} catch (error) {
		if (error instanceof errors.JOSEAlgNotAllowed) {
			throw new AuthError('Algorithm not allowed', error.code, 401);
		} else if (error instanceof errors.JWEDecryptionFailed) {
			throw new AuthError('Decryption failed', error.code, 401);
		} else if (error instanceof errors.JWEInvalid) {
			throw new AuthError('Invalid JWE', error.code, 401);
		} else if (error instanceof errors.JWTExpired) {
			throw new AuthError('Token has expired.', error.code, 401);
		} else if (error instanceof errors.JWTClaimValidationFailed) {
			throw new AuthError('JWT claim validation failed', error.code, 401);
		} else if (error instanceof errors.JWTInvalid) {
			throw new AuthError('Invalid JWT', error.code, 401);
		} else if (error instanceof errors.JWKSNoMatchingKey) {
			throw new AuthError('No matching key found in JWKS.', error.code, 401);
		} else if (error instanceof errors.JWKSInvalid) {
			throw new AuthError('Invalid JWKS', error.code, 401);
		} else if (error instanceof errors.JWKSMultipleMatchingKeys) {
			throw new AuthError('Multiple matching keys found in JWKS.', error.code, 401);
		} else if (error instanceof errors.JWKSNoMatchingKey) {
			throw new AuthError('No matching key in JWKS.', error.code, 401);
		} else if (error instanceof errors.JWSInvalid) {
			throw new AuthError('Invalid JWS', error.code, 401);
		} else if (error instanceof errors.JWSSignatureVerificationFailed) {
			throw new AuthError('Signature verification failed', error.code, 401);
		} else if (error instanceof Error) {
			throw new AuthError('JWT verification failed', 'AUTH_ERROR', 401);
		}
		// Fallback in case error is not an instance of Error
		throw new AuthError('JWT verification failed due to an unexpected error.', 'AUTH_ERROR', 401);
	}
}

export { supabaseEmailOTP, supabasePhoneOTP, supabaseVerifyOTP, supabaseJwtVerify };
