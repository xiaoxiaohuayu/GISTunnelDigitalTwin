import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject } from '../src/engines/projectConfig.ts'
import { portalNameLateral } from '../src/engines/portalGeometry.ts'

test('each bore keeps its own lintel at both ends of the baked portal', () => {
  assert.equal(portalNameLateral(undefined, 0, 0), -12)
  assert.equal(portalNameLateral(undefined, 0, 1), 12)
  assert.equal(portalNameLateral(undefined, 1, 0), 12)
  assert.equal(portalNameLateral(undefined, 1, 1), -12)
  const project = defaultProject()
  project.bores[0]!.offset = -15
  project.bores[1]!.offset = 18
  assert.equal(portalNameLateral(project, 0, 0), 15)
  assert.equal(portalNameLateral(project, 0, 1), -18)
  assert.equal(portalNameLateral(project, 1, 0), -15)
  assert.equal(portalNameLateral(project, 1, 1), 18)
})
