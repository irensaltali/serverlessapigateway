import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { normalizeApiConfig, validateApiConfig } from '../src/utils/config.js';

const examplesDir = path.resolve(process.cwd(), 'docs/config-examples');

describe('canonical config examples', () => {
	it('all examples are schema-valid', async () => {
		const files = (await readdir(examplesDir)).filter((file) => file.endsWith('.json'));
		expect(files.length).toBeGreaterThan(0);

		for (const file of files) {
			const raw = await readFile(path.join(examplesDir, file), 'utf8');
			const parsed = JSON.parse(raw);
			const normalized = normalizeApiConfig(parsed);
			const { valid, errors } = await validateApiConfig(normalized);
			expect(valid, `${file} should be schema-valid. errors=${JSON.stringify(errors)}`).toBe(true);
		}
	});
});
