import apiConfig from '../../api-config.json';

export default class Service {
    async auth0CallbackHandler(code) {
        const { domain, client_id, client_secret } = apiConfig.authorizer;

        const tokenUrl = `https://${domain}/oauth/token`;

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id,
            client_secret,
            code,
            redirect_uri: 'https://api-test.serverlessapigw.com/api/v1/auth0/callback'
        });

        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Failed to fetch token:', errorData);
                return new Response(JSON.stringify({
                    error: 'Failed to fetch token',
                    details: errorData
                }), {
                    status: response.status,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const data = await response.json();
            console.log('auth0CallbackHandler data', data);
            return new Response(JSON.stringify(data), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Error in auth0CallbackHandler:', error);
            return new Response(JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
}
