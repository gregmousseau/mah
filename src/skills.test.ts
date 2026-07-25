import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  loadSkills,
  resolveSkillRoot,
  resolveSkillsForPrompt,
} from './skills.js'

function writeSkill(root: string, name: string): void {
  const dir = join(root, '.mah', 'skills')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.yaml`), `
name: ${name}
type: capability
description: Fixture skill
agent_types: [generator]
constraints:
  - Fixture constraint
`)
}

test('detached orchestrators resolve skills from the configured project worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-skill-root-'))
  const orchestrator = join(root, 'orchestrator')
  const project = join(root, 'project')
  mkdirSync(join(orchestrator, '.mah'), { recursive: true })
  writeSkill(project, 'react-forms')

  const skillRoot = resolveSkillRoot(orchestrator, project)
  assert.equal(skillRoot, project)
  assert.deepEqual([...loadSkills(skillRoot).keys()], ['react-forms'])
})

test('skill resolution falls back to the orchestrator catalog', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-skill-fallback-'))
  const orchestrator = join(root, 'orchestrator')
  writeSkill(orchestrator, 'local-skill')

  assert.equal(resolveSkillRoot(orchestrator, join(root, 'missing-project')), orchestrator)
})

test('skill resolution tries the configured repository after a package cwd', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-skill-project-fallback-'))
  const orchestrator = join(root, 'orchestrator')
  const project = join(root, 'project')
  const packageRoot = join(project, 'packages', 'app')
  mkdirSync(orchestrator, { recursive: true })
  mkdirSync(packageRoot, { recursive: true })
  writeSkill(project, 'project-skill')

  assert.equal(resolveSkillRoot(orchestrator, [packageRoot, project]), project)
})

test('configured missing skills fail closed instead of silently weakening the prompt', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-skill-missing-'))
  writeSkill(root, 'react-forms')
  const skills = loadSkills(root)

  assert.throws(
    () => resolveSkillsForPrompt(
      ['react-forms', 'awc-worktree-handoff'],
      skills,
      root,
      { missing: 'error' },
    ),
    /awc-worktree-handoff/,
  )
})

test('configured skills are injected from the selected project catalog', () => {
  const root = mkdtempSync(join(tmpdir(), 'mah-skill-inject-'))
  writeSkill(root, 'react-forms')
  const resolved = resolveSkillsForPrompt(
    ['react-forms'],
    loadSkills(root),
    root,
    { missing: 'error' },
  )

  assert.equal(resolved.length, 1)
  assert.match(resolved[0]?.promptBlock ?? '', /Fixture constraint/)
})
