import { HttpMethod, RequestMethod } from '../enums/http-method';
import { IntegrationTypeEnum } from '../enums/integration-type';

/**
 * Configuration for the Serverless API Gateway
 */
export interface APIGatewayConfig {
	servers?: Server[];
	cors?: Cors;
	authorizer?: Authorizor;
	paths: PathConfig[];
	variables?: {
		[k: string]: string;
	};
}

export interface Server {
	alias: string;
	url: string;
}

export interface Cors {
	allow_origins: string[];
	allow_methods: HttpMethod[];
	allow_headers: string[];
	expose_headers: string[];
	allow_credentials: boolean;
	max_age: number;
}

export interface Authorizor {
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
		headers?: Record<string, string>;
		query?: Record<string, any>;
	};
	variables?: Record<string, any>;
	response?:
		| {
				status?: string;
		  }
		| string;
}
