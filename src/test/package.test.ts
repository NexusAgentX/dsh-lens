import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..', '..');

describe('dsh-lens package', () => {
	it('publishes the unscoped name as a dsh bundle', () => {
		const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
			name: string;
			publishConfig?: { access?: string };
			dsh?: { bundle?: { patch?: string }; client?: { platform?: string; immediately?: boolean } };
			dependencies?: { 'pi-lens'?: string };
		};
		assert.equal(pkg.name, 'dsh-lens');
		assert.equal(pkg.publishConfig?.access, 'public');
		assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
		assert.ok(pkg.dependencies?.['pi-lens']);
		assert.equal(pkg.dsh?.client?.platform, 'web');
		assert.equal(pkg.dsh?.client?.immediately, true);
	});

	it('exports a Cordis plugin entry', async () => {
		const mod = (await import('../index.js')) as {
			name: string;
			apply: unknown;
			Config: unknown;
			inject: unknown;
		};
		assert.equal(mod.name, 'dsh-lens');
		assert.equal(typeof mod.apply, 'function');
		assert.ok(mod.Config);
		assert.deepEqual(mod.inject, ['tools']);
	});

	it('waits for optional host services instead of ctx.get without inject', () => {
		const plugin = readFileSync(join(pkgRoot, 'src/plugin.ts'), 'utf8');
		const commands = readFileSync(join(pkgRoot, 'src/commands.ts'), 'utf8');
		const prompt = readFileSync(join(pkgRoot, 'src/prompt.ts'), 'utf8');
		const skills = readFileSync(join(pkgRoot, 'src/skills.ts'), 'utf8');
		assert.match(plugin, /export const inject = \['tools'\]/);
		assert.match(commands, /ctx\.inject\(\['commands'\]/);
		assert.match(prompt, /ctx\.inject\(\['systemPrompt'\]/);
		assert.match(skills, /ctx\.inject\(\['skills'\]/);
		const client = readFileSync(join(pkgRoot, 'src/client/index.tsx'), 'utf8');
		assert.match(client, /export const inject = \['slots', 'locale'\]/);
		assert.doesNotMatch(client, /if \(ctx\.locale\)/);
		assert.doesNotMatch(commands, /ctx\.get\('commands'\)/);
		assert.doesNotMatch(prompt, /ctx\.get\('systemPrompt'\)/);
		assert.doesNotMatch(skills, /ctx\.get\('skills'\)/);
	});

	it('registers the browser half into the composer usage row', () => {
		const client = readFileSync(join(pkgRoot, 'src/client/index.tsx'), 'utf8');
		assert.match(client, /ctx\.slots\.inject\('conversation\.composer\.dock'/);
		assert.match(client, /name: 'conversation\.composer\.dock'/);
		assert.doesNotMatch(client, /conversation\.session\.header\.actions/);
		assert.doesNotMatch(client, /conversation\.input\.dock/);
	});

	it('ships a client bundle that never references an unresolved primitives export', () => {
		// The 0.3.2 bundle imported `IconChevronDownOutline14`, which the primitives
		// package does not export. An undefined element type throws while rendering,
		// the slot entry abdicates, and the UI silently shows nothing — with a clean
		// build. `tsconfig.client.json` is the real gate; this guards the artifact.
		const bundle = readFileSync(join(pkgRoot, 'dist/client.js'), 'utf8');
		assert.match(bundle, /composer\.dock/);
		assert.doesNotMatch(bundle, /Outline14/);
		assert.doesNotMatch(bundle, /conversation\.session\.header\.actions/);
	});
});
