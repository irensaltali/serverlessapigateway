import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fs from 'node:fs';

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function readText(filePath) {
	return readFile(filePath, 'utf8');
}

async function main() {
	const projectRoot = process.cwd();
	const gitbookCandidates = [
		path.resolve(projectRoot, '../serverlessapigateway-gitbook'),
		path.resolve(projectRoot, 'serverlessapigateway-gitbook'),
	];
	const gitbookRoot = gitbookCandidates.find((candidatePath) => fs.existsSync(candidatePath));
	assert(
		gitbookRoot,
		'Unable to locate serverlessapigateway-gitbook. Expected at ../serverlessapigateway-gitbook or ./serverlessapigateway-gitbook.',
	);

	const introPath = path.join(gitbookRoot, 'getting-started', 'introduction.md');
	const overviewPath = path.join(gitbookRoot, 'configuration', 'overview.md');
	const integrationsReadmePath = path.join(gitbookRoot, 'configuration', 'integrations', 'README.md');
	const schemaPath = path.join(projectRoot, 'src', 'api-config.schema.json');

	const intro = await readText(introPath);
	const overview = await readText(overviewPath);
	const integrationsReadme = await readText(integrationsReadmePath);
	const schema = JSON.parse(await readText(schemaPath));

	assert(!intro.includes('cd worker'), 'Docs drift: introduction still references "cd worker".');
	assert(!intro.includes('wrangler publish'), 'Docs drift: introduction still references "wrangler publish".');
	assert(
		!intro.includes('/worker/src/api-config.schema.json'),
		'Docs drift: introduction still references legacy schema path under /worker.',
	);

	assert(
		overview.includes('docs/config-examples'),
		'Docs drift: overview.md must reference canonical config examples under docs/config-examples.',
	);

	const integrationTypes =
		schema?.properties?.paths?.items?.properties?.integration?.properties?.type?.enum || [];
	for (const integrationType of integrationTypes) {
		assert(
			integrationsReadme.includes(`\`${integrationType}\``),
			`Docs drift: integration type "${integrationType}" missing from integrations README.`,
		);
	}

	console.log('Documentation sync checks passed.');
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
