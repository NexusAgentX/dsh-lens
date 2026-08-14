#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listBundledSkills, resolvePiLensRoot } from './skills.js'

const version = readPackageVersion()

const help = `dsh-lens ${version}

Real-time code feedback for DeepSeek Harness.

Usage:
  dsh-lens --help
  dsh-lens --version
  dsh-lens status
  dsh-lens build-graph [--cwd <dir>]

status        Print the resolved pi-lens engine root and bundled skills
build-graph   Build and persist the review graph (same as \`pi-lens build-graph\`)

Install into a Harness profile:

  dsh plugin --profile web add dsh-lens
`

const command = process.argv[2]

if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
  process.stdout.write(help)
  process.exit(0)
}

if (command === '-v' || command === '--version' || command === 'version') {
  console.log(version)
  process.exit(0)
}

if (command === 'status') {
  const root = resolvePiLensRoot()
  const skills = listBundledSkills(root)
  console.log(`dsh-lens ${version}`)
  console.log(`cwd: ${process.cwd()}`)
  console.log(`pi-lens engine: ${root}`)
  console.log(`bundled skills: ${skills.length}`)
  for (const skill of skills) {
    console.log(`  • ${skill.name}`)
  }
  process.exit(0)
}

if (command === 'build-graph') {
  const root = resolvePiLensRoot()
  const cli = join(root, 'dist', 'mcp', 'cli.js')
  if (!existsSync(cli)) {
    console.error(`dsh-lens: missing ${cli}`)
    process.exit(1)
  }
  const child = spawn(process.execPath, [cli, 'build-graph', ...process.argv.slice(3)], {
    stdio: 'inherit',
  })
  child.on('exit', code => process.exit(code ?? 1))
} else {
  console.error(`dsh-lens: unknown command ${JSON.stringify(command)}`)
  console.error('Run dsh-lens --help')
  process.exit(1)
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.2.0'
  } catch {
    return '0.2.0'
  }
}
