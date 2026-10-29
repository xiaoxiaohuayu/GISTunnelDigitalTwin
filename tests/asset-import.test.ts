import test from 'node:test'
import assert from 'node:assert/strict'
import { csvRows,previewAssetImport,assetCsvTemplate } from '../src/engines/assetImport.ts'
import { defaultProject,projectErrors } from '../src/engines/projectConfig.ts'
test('CSV supports BOM, quoted commas and newlines; preview does not mutate the ledger',()=>{
  assert.deepEqual(csvRows('\uFEFF编号,名称\r\n"A","a,b\nc"'),[['编号','名称'],['A','a,b\nc']])
  const p=defaultProject(),result=previewAssetImport(assetCsvTemplate(p),p)
  assert.equal(result.errors.length,0);assert.equal(result.assets.length,1);assert.equal(p.assets.length,0)
  const clone=JSON.parse(JSON.stringify({...p,assets:result.assets}));assert.deepEqual(projectErrors(clone),[])
  assert.equal(clone.assets[0].id,result.assets[0]!.id)
})
test('duplicates, malformed numbers, unknown bores and out of range chainages cannot be committed',()=>{
  const p=defaultProject(),text=assetCsvTemplate(p),first=previewAssetImport(text,p)
  p.assets=first.assets
  assert.ok(previewAssetImport(text,p).errors[0]!.includes('重复'))
  assert.ok(previewAssetImport(text.replace('bore-1','missing'),defaultProject()).errors.length)
  assert.ok(previewAssetImport(text.replace('"-3"','"abc"'),defaultProject()).errors.length)
  assert.ok(previewAssetImport(text.replace('"0","-3"','"K99+000","-3"'),defaultProject()).errors.length)
  assert.ok(projectErrors({version:1,bores:[null],assets:[]}).length)
})
