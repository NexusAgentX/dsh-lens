import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { logger } from './logger.js'

interface SkillCandidate {
  name: string
  description: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  provider: string
  source: 'bundled'
  resourceBase: { kind: 'directory'; path: string }
  locator: string
}

const PROVIDER = 'dsh-lens'
const INVOCATION = { modelInvocable: true, userInvocable: true } as const

export function resolvePiLensRoot(): string {
  const require = createRequire(import.meta.url)
  return dirname(require.resolve('pi-lens/package.json'))
}

export function listBundledSkills(root = resolvePiLensRoot()): SkillCandidate[] {
  const skillsDir = join(root, 'skills')
  if (!existsSync(skillsDir)) return []
  const skills: SkillCandidate[] = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillFile = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const body = readFileSync(skillFile, 'utf8')
    skills.push({
      name: entry.name,
      description: extractDescription(body) || `pi-lens skill ${entry.name}`,
      invocation: INVOCATION,
      provider: PROVIDER,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: join(skillsDir, entry.name) },
      locator: skillFile,
    })
  }
  return skills
}

export function registerLensSkills(ctx: Context): void {
  const skills = ctx.get('skills') as {
    registerProvider(factory: () => unknown): unknown
  } | undefined
  if (!skills) return
  const candidates = listBundledSkills()
  if (candidates.length === 0) {
    logger.warn('no bundled pi-lens skills found')
    return
  }
  const provider = {
    name: PROVIDER,
    list: () => Promise.resolve(candidates),
    async get(candidate: SkillCandidate) {
      return {
        name: candidate.name,
        description: candidate.description,
        invocation: candidate.invocation,
        provider: candidate.provider,
        source: candidate.source,
        resourceBase: candidate.resourceBase,
        content: readFileSync(candidate.locator, 'utf8'),
      }
    },
  }
  skills.registerProvider(() => provider)
  logger.debug(`registered ${candidates.length} bundled lens skills`)
}

function extractDescription(markdown: string): string | undefined {
  const match = /^---\n([\s\S]*?)\n---/u.exec(markdown)
  if (!match) return firstParagraph(markdown)
  const described = /^description:\s*(.+)$/mu.exec(match[1] ?? '')
  return described?.[1]?.replace(/^['"]|['"]$/g, '').trim() || firstParagraph(markdown)
}

function firstParagraph(markdown: string): string | undefined {
  const body = markdown.replace(/^---[\s\S]*?---\n?/u, '')
  const line = body.split('\n').map(item => item.trim()).find(item => item && !item.startsWith('#'))
  return line
}
