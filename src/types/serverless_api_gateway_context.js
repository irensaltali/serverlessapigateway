/**
 * @typedef {Object} ServerlessAPIGatewayContext
 * @property {string} apiConfig - The API Gateway configuration.
 * @property {URL} requestUrl - The request URL.
 * @property {JWTPayload} jwtPayload - The JWT payload.
 */
export class ServerlessAPIGatewayContext {
    /**
     * @param {string} [apiConfig]
     * @param {URL} [requestUrl]
     * @param {JWTPayload} [jwtPayload]
     */
    constructor(apiConfig = null, requestUrl = null, jwtPayload = null) {
        this.apiConfig = apiConfig;
        this.requestUrl = requestUrl;
        this.jwtPayload = jwtPayload;
    }
}
