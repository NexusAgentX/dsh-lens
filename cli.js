#!/usr/bin/env node

const version = '0.0.1'

const help = `dsh-lens ${version}

Real-time code feedback for DeepSeek Harness.

Usage:
  dsh-lens --help
  dsh-lens --version

This 0.0.1 release only reserves the npm name and ships an installable
dsh bundle stub. The host-native lens pipeline lands later.

Install into a Harness profile:

  dsh plugin --profile web add dsh-lens
`

const arg = process.argv[2]

if (arg === '-v' || arg === '--version' || arg === 'version') {
  console.log(version)
  process.exit(0)
}

if (arg === undefined || arg === '-h' || arg === '--help' || arg === 'help') {
  process.stdout.write(help)
  process.exit(0)
}

console.error(`dsh-lens: unknown command ${JSON.stringify(arg)}`)
console.error('Run dsh-lens --help')
process.exit(1)
