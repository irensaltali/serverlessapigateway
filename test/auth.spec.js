import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { jwtAuth } from '../src/auth.js';
import { AuthError } from '../src/types/error_types.js';

const SECRET = 'super-secret-for-tests';
const issuer = 'https://issuer.example.com';
const audience = 'test-audience';

async function createToken(payload = {}, exp = '2h') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(SECRET));
}

describe('jwtAuth', () => {
  it('validates and returns payload for a valid JWT', async () => {
    const token = await createToken({ sub: 'user-1', role: 'admin' });
    const request = new Request('https://api.example.com/private', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = await jwtAuth(request, {
      authorizer: { secret: SECRET, issuer, audience },
    });

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('admin');
  });

  it('throws AuthError when Authorization header is missing', async () => {
    const request = new Request('https://api.example.com/private');

    await expect(
      jwtAuth(request, {
        authorizer: { secret: SECRET, issuer, audience },
      })
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws JWT expired error for expired tokens', async () => {
    const token = await createToken({ sub: 'user-2' }, 1);
    const request = new Request('https://api.example.com/private', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(
      jwtAuth(request, {
        authorizer: { secret: SECRET, issuer, audience },
      })
    ).rejects.toMatchObject({
      name: 'AuthError',
      code: 'ERR_JWT_EXPIRED',
    });
  });

  it('throws claim validation error for wrong audience', async () => {
    const token = await new SignJWT({ sub: 'user-3' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer)
      .setAudience('different-audience')
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(SECRET));

    const request = new Request('https://api.example.com/private', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(
      jwtAuth(request, {
        authorizer: { secret: SECRET, issuer, audience },
      })
    ).rejects.toMatchObject({
      name: 'AuthError',
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
  });

  it('throws auth error for malformed JWT', async () => {
    const request = new Request('https://api.example.com/private', {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });

    await expect(
      jwtAuth(request, {
        authorizer: { secret: SECRET, issuer, audience },
      })
    ).rejects.toMatchObject({
      name: 'AuthError',
      code: 'ERR_JWS_INVALID',
    });
  });
});
