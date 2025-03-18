import { logger } from './logger';
import { ValueMapper } from '../mapping';
import { configIsMissingResponse } from '../responses';
import { setPoweredByHeader } from '../powered-by';

export async function getApiConfig(env) {
    let apiConfig;
    try {
        logger.debug('Loading API configuration');
        if (typeof env.CONFIG === 'undefined' || await env.CONFIG.get("api-config.json") === null) {
            apiConfig = await import('../api-config.json');
            logger.debug('Loaded API configuration from local file');
        } else {
            apiConfig = JSON.parse(await env.CONFIG.get("api-config.json"));
            logger.debug('Loaded API configuration from KV store');
        }
    } catch (e) {
        logger.error('Error loading API configuration', e);
        return setPoweredByHeader(request, configIsMissingResponse());
    }

    // Replace environment variables and secrets in the API configuration
    logger.debug('Replacing environment variables and secrets in API configuration');
    apiConfig = await ValueMapper.replaceEnvAndSecrets(apiConfig, env);

    return apiConfig;
} 
