import { HttpMethod, RequestMethod } from '../enums/http-method';
import { IntegrationTypeEnum } from '../enums/integration-type';

/**
 * Configuration for the Serverless API Gateway
 */
export interface APIGatewayConfig {
	servers?: ServerConfig[];
	cors?: CorsConfig;
	authorizer?: AuthorizorConfig;
	paths: PathConfig[];
	variables?: {
		[k: string]: string;
	};
}

export interface ServerConfig {
	alias: string;
	url: string;
}

export interface CorsConfig {
	allow_origins: string[];
	allow_methods: HttpMethod[];
	allow_headers: string[];
	expose_headers: string[];
	allow_credentials: boolean;
	max_age: number;
}

export interface AuthorizorConfig {
	type: 'jwt';
	secret: string;
	algorithm: 'HS256';
	audience?: string;
	issuer: string;
}

export interface PathConfig {
	method: RequestMethod;
	path: string;
	integration?: {
		type: IntegrationTypeEnum;
		server: string;
	};
	auth?: boolean;
	mapping?: {
		headers?: {
			[key: string]: string;
		};
		query?: {
			[key: string]: any;
		};
	};
	variables?: {
		[key: string]: string;
	};
	response?:
		| {
				status?: string;
		  }
		| string;
}
