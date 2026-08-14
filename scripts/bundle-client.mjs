#!/usr/bin/env node
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bodyPath = join(root, 'dist', 'client.body.cjs')
const outPath = join(root, 'dist', 'client.js')

mkdirSync(dirname(outPath), { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.tsx'],
  outfile: bodyPath,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  logLevel: 'info',
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    '@deepseek-ai/*',
  ],
})

const body = readFileSync(bodyPath, 'utf8')
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-lens",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`
writeFileSync(outPath, wrapped)
console.log(`wrote ${outPath}`)
