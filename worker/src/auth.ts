import { JWTPayload, jwtVerify } from 'jose';
import apiConfig from './api-config.json';


async function jwtAuth(request: Request): Promise<JWTPayload> {
    try {
        const secret = new TextEncoder().encode(apiConfig.authorizer?.secret);
        const jwt = request.headers.get('Authorization')?.split(' ')[1] || '';

        const { payload, protectedHeader } = await jwtVerify(jwt, secret, {
            issuer: apiConfig.authorizer?.issuer,
            audience: apiConfig.authorizer?.audience,
        });
        console.log('JWT verification successful:', payload, protectedHeader);

        return payload;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return {};
    }
}

export { jwtAuth }
