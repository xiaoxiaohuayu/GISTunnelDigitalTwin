import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject } from '../src/engines/projectConfig.ts'
import { encodeTunnelPackage, readTunnelPackage } from '../src/engines/projectPackage.ts'
import { layoutPassages } from '../src/engines/facilityLayout.ts'
import type { TunnelSurvey } from '../src/types/tunnel.ts'
import { basicSpacing, enhancedSpacing } from '../src/engines/sectionProfile.ts'

test('a package keeps the ledger, controls and sign images, and a legacy project still loads', async () => {
  const project = defaultProject()
  project.section = { templateHalf: 5, basicSpacing: 10 }
  project.passages = [{ station: 480, vehicle: true }]
  const image = new Blob(['portal'], { type: 'image/png' })
  const packed = await encodeTunnelPackage({
    project,
    controls: { 'basic-kept': { enabled: false } },
    portalSign: { mode: 'image', name: '青山隧道', length: '', image },
    trafficSigns: { images: [image, null, null] },
  })
  const loaded = readTunnelPackage(JSON.parse(JSON.stringify(packed)))
  assert.equal(loaded.project.section?.basicSpacing, 10)
  assert.equal(loaded.project.passages?.[0]?.station, 480)
  assert.equal(loaded.extras?.controls['basic-kept']?.enabled, false)
  assert.equal(await loaded.extras?.portalSign?.image?.text(), 'portal')
  assert.equal(await loaded.extras?.trafficSigns?.images[0]?.text(), 'portal')
  assert.equal(loaded.extras?.trafficSigns?.images[1], null)
  const legacy = readTunnelPackage(defaultProject())
  assert.equal(legacy.extras, undefined)
  assert.equal(legacy.project.version, 2)
  assert.throws(() => readTunnelPackage({ format: 'tunnel-package', version: 1, project: {}, controls: [] }))
})

test('recorded passages are used only when the ledger has no cross passage', () => {
  const project = defaultProject()
  project.passages = [{ station: 120, vehicle: false }, { station: 900, vehicle: true }]
  const survey = { tubes: [[], []], length: 1900, project } as TunnelSurvey
  assert.equal(layoutPassages(survey, 0)[1]?.station, 900)
  assert.equal(layoutPassages(survey, 0)[1]?.halfWidth, 3.5)
  project.assets = [{ id: 'walk-1', code: 'W', name: '人行横洞', kind: 'pedestrian', boreId: 'bore-1', chainage: 400, lateral: 4, height: 2, heading: 0, link: { targetBoreId: 'bore-2', targetChainage: 400, memberIds: [] } }]
  assert.equal(layoutPassages(survey, 0)[0]?.station, 400)
  assert.equal(layoutPassages(survey, 0)[0]?.assetId, 'walk-1')
  assert.equal(basicSpacing(undefined), 8)
  assert.equal(enhancedSpacing({ enhancedSpacing: 6 }), 6)
})
