import { jwtVerify } from 'jose';
import apiConfig from './api-config.json';


async function jwtAuth(request: Request): Promise<boolean> {
    try {
        const secret = new TextEncoder().encode(apiConfig.authorizer?.secret);
        const jwt = request.headers.get('Authorization')?.split(' ')[1] || '';

        const { payload, protectedHeader } = await jwtVerify(jwt, secret, {
            issuer: apiConfig.authorizer?.issuer,
            audience: apiConfig.authorizer?.audience,
        });

        return true;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return false;
    }
}

export { jwtAuth }
