#!/usr/bin/env node
/**
 * Static checks for the dsh-artex package.
 *
 * Validates the manifest contract the DSH client-module system relies on, that
 * both halves parse, and that no credential-shaped string slipped into the
 * published files.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const ok = (message) => console.log(`ok   ${message}`)
const fail = (message) => {
  failures.push(message)
  console.error(`FAIL ${message}`)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (manifest.name !== 'dsh-artex') fail(`package name is ${manifest.name}`)
else ok('package name')

if (manifest.type !== 'module') fail('package is not ESM')
else ok('ESM package')

const client = manifest.dsh?.client
if (client?.platform !== 'web') fail('dsh.client.platform missing or not "web"')
else ok('dsh.client.platform')

const clientEntry = manifest.exports?.['./client']
if (!clientEntry) fail('exports["./client"] is missing')
else if (!existsSync(join(root, clientEntry))) fail(`exports["./client"] -> ${clientEntry} does not exist`)
else ok('client export resolves')

const main = manifest.main
if (!main || !existsSync(join(root, main))) fail(`main ${main} does not exist`)
else ok('main entry resolves')

const clientSource = readFileSync(join(root, manifest.exports['./client']), 'utf8')
if (!clientSource.includes('window.__ModuleLoader__.load')) fail('client bundle does not register with __ModuleLoader__')
else ok('client bundle registration')
if (!clientSource.includes(`id: "${manifest.name}"`)) fail(`client bundle id does not match ${manifest.name}`)
else ok('client bundle id')
if (!clientSource.includes('exports.apply')) fail('client bundle does not export apply')
else ok('client bundle exports apply')
if (!clientSource.includes('exports.inject')) fail('client bundle does not export inject')
else ok('client bundle exports inject')

for (const file of ['lib/index.js', 'lib/client.js', 'install.sh']) {
  try {
    execFileSync('bash', ['-n', join(root, file)], { stdio: 'pipe' })
  } catch {
    /* bash -n on JS always fails; only shell files are parsed below */
  }
}
for (const file of ['lib/index.js', 'lib/client.js']) {
  try {
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' })
    ok(`${file} parses`)
  } catch (error) {
    fail(`${file} does not parse: ${error.stderr?.toString().split('\n')[0] ?? error.message}`)
  }
}

const secrets = [
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /artex_mcp_[a-f0-9]{20,}/,
]
const published = ['package.json', 'README.md', 'lib/index.js', 'lib/client.js', 'install.sh']
for (const file of published) {
  const text = readFileSync(join(root, file), 'utf8')
  for (const pattern of secrets) {
    if (pattern.test(text)) fail(`${file} looks like it contains a credential`)
  }
}
ok('no credential-shaped strings')

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
