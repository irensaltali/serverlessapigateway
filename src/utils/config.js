import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { logger } from './logger';
import { ValueMapper } from '../mapping';

const STRICT_CONFIG_ENV = 'SAG_STRICT_CONFIG';
const INLINE_CONFIG_ENV = 'SAG_API_CONFIG_JSON';
const DYNAMIC_CODEGEN_BLOCKED_MESSAGE = 'Code generation from strings disallowed';

let validatorPromise;
let dynamicCodegenAvailable;

function isDynamicCodegenBlocked(error) {
	const message = String(error?.message || '');
	return error instanceof EvalError || message.includes(DYNAMIC_CODEGEN_BLOCKED_MESSAGE);
}

function supportsDynamicCodegen() {
	if (typeof dynamicCodegenAvailable !== 'undefined') {
		return dynamicCodegenAvailable;
	}

	try {
		// eslint-disable-next-line no-new-func
		new Function('return true;');
		dynamicCodegenAvailable = true;
	} catch {
		dynamicCodegenAvailable = false;
	}

	return dynamicCodegenAvailable;
}

function isStrictModeEnabled(env) {
	return String(env?.[STRICT_CONFIG_ENV] ?? '').toLowerCase() === 'true';
}

function cloneConfig(config) {
	if (typeof structuredClone === 'function') {
		return structuredClone(config);
	}

	return JSON.parse(JSON.stringify(config));
}

function normalizePathConfig(pathConfig) {
	if (!pathConfig?.integration) {
		return pathConfig;
	}

	if (pathConfig.integration.type === 'http') {
		return {
			...pathConfig,
			integration: {
				...pathConfig.integration,
				type: 'http_proxy',
			},
		};
	}

	return pathConfig;
}

function mergeServiceBindings(primaryBindings, legacyBindings) {
	const merged = Array.isArray(primaryBindings) ? [...primaryBindings] : [];
	const knownAliases = new Set(merged.map((binding) => binding?.alias).filter(Boolean));

	for (const legacyBinding of Array.isArray(legacyBindings) ? legacyBindings : []) {
		if (!legacyBinding?.alias || knownAliases.has(legacyBinding.alias)) {
			continue;
		}
		merged.push(legacyBinding);
		knownAliases.add(legacyBinding.alias);
	}

	return merged;
}

function summarizeValidationErrors(errors) {
	if (!Array.isArray(errors) || errors.length === 0) {
		return 'Unknown validation error';
	}

	return errors
		.map((error) => {
			const atPath = error.instancePath || '(root)';
			return `${atPath} ${error.message}`.trim();
		})
		.join('; ');
}

export function normalizeApiConfig(apiConfig) {
	if (!apiConfig || typeof apiConfig !== 'object') {
		return apiConfig;
	}

	const normalizedConfig = cloneConfig(apiConfig);

	if (Array.isArray(normalizedConfig.paths)) {
		normalizedConfig.paths = normalizedConfig.paths.map(normalizePathConfig);
	}

	const mergedServiceBindings = mergeServiceBindings(
		normalizedConfig.serviceBindings,
		normalizedConfig.servicesBindings,
	);
	if (mergedServiceBindings.length > 0) {
		normalizedConfig.serviceBindings = mergedServiceBindings;
	}

	return normalizedConfig;
}

async function getApiConfigValidator() {
	if (!validatorPromise) {
		validatorPromise = (async () => {
			if (!supportsDynamicCodegen()) {
				logger.warn('API configuration schema validation is disabled because runtime code generation is unavailable.');
				return null;
			}

			try {
				const schemaModule = await import('../api-config.schema.json');
				const schema = schemaModule.default || schemaModule;
				const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
				addFormats(ajv);
				return ajv.compile(schema);
			} catch (error) {
				if (isDynamicCodegenBlocked(error)) {
					logger.warn('API configuration schema validation is disabled because runtime blocks dynamic code generation.');
					return null;
				}
				throw error;
			}
		})();
	}

	return validatorPromise;
}

export async function validateApiConfig(apiConfig) {
	const validate = await getApiConfigValidator();
	if (!validate) {
		return {
			valid: true,
			errors: [],
			skipped: true,
		};
	}

	const valid = validate(apiConfig);

	return {
		valid: Boolean(valid),
		errors: validate.errors || [],
		skipped: false,
	};
}

export async function getApiConfig(env) {
	let apiConfig;
	let source = 'unknown';

	try {
		logger.debug('Loading API configuration');
		const inlineConfig = env?.[INLINE_CONFIG_ENV];

		if (typeof inlineConfig === 'string' && inlineConfig.trim() !== '') {
			apiConfig = JSON.parse(inlineConfig);
			source = 'inline variable';
		} else {
			const kvConfig = typeof env.CONFIG === 'undefined' ? null : await env.CONFIG.get('api-config.json');
			if (kvConfig === null) {
				const localConfig = await import('../api-config.json');
				apiConfig = localConfig.default || localConfig;
				source = 'local file';
			} else {
				apiConfig = JSON.parse(kvConfig);
				source = 'KV store';
			}
		}
		logger.debug(`Loaded API configuration from ${source}`);
	} catch (error) {
		logger.error('Error loading API configuration', error);
		throw new Error('API configuration is missing or invalid.');
	}

	apiConfig = normalizeApiConfig(apiConfig);
	apiConfig = await ValueMapper.replaceEnvAndSecrets(apiConfig, env);

	const { valid, errors, skipped } = await validateApiConfig(apiConfig);
	if (skipped) {
		if (isStrictModeEnabled(env)) {
			throw new Error(
				'API configuration validation is required in strict mode, but runtime blocks dynamic code generation.',
			);
		}
		return apiConfig;
	}

	if (!valid) {
		const details = summarizeValidationErrors(errors);
		const message = `API configuration validation failed: ${details}`;
		if (isStrictModeEnabled(env)) {
			throw new Error(message);
		}
		logger.warn(`${message}. Continuing in compatibility mode.`);
	}

	return apiConfig;
}
