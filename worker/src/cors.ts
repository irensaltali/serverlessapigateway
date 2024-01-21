import apiConfig from './api-config.json';

function setCorsHeaders(response: Response) {
    const corsConfig = apiConfig.cors;

    response.headers.set('Access-Control-Allow-Origin', corsConfig.allow_origins.join(','));
    response.headers.set('Access-Control-Allow-Methods', corsConfig.allow_methods.join(','));
    response.headers.set('Access-Control-Allow-Headers', corsConfig.allow_headers.join(','));
    response.headers.set('Access-Control-Expose-Headers', corsConfig.expose_headers.join(','));
    response.headers.set('Access-Control-Allow-Credentials', corsConfig.allow_credentials.toString());
    response.headers.set('Access-Control-Max-Age', corsConfig.max_age.toString());

    return response;
}

export { setCorsHeaders }
