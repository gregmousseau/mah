import assert from 'node:assert/strict'
import test from 'node:test'
import { bumpTier } from './qaTier.js'

test('chain planning may promote but never reduce generated QA risk', () => {
  assert.equal(bumpTier('full', 'smoke'), 'full')
  assert.equal(bumpTier('full', 'targeted'), 'full')
  assert.equal(bumpTier('smoke', 'targeted'), 'targeted')
})
