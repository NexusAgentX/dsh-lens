#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

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
  plugins: [cssModulesPlugin()],
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

function cssModulesPlugin() {
  return {
    name: 'css-modules',
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.module\.css$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8')
        const prefix = `dshl${createHash('sha1').update(basename(args.path)).digest('hex').slice(0, 6)}`
        const locals = {}
        const css = source.replace(/\.([A-Za-z_][\w-]*)/g, (_, name) => {
          locals[name] ??= `${prefix}_${name}`
          return `.${locals[name]}`
        })
        const tagId = `dsh-lens/${basename(args.path)}`
        const js = `
const css = ${JSON.stringify(css)};
const tagId = ${JSON.stringify(tagId)};
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-lens";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
export default ${JSON.stringify(locals)};
`
        return { contents: js, loader: 'js' }
      })
    },
  }
}
