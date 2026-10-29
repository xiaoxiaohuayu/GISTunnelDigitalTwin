// Keep runtime URLs in Vite's dependency graph, including dynamically selected models.
const files = import.meta.glob<string>(['../assets/modelAssets/**/*.glb', '!../assets/modelAssets/legacy/**'], {
  eager: true, query: '?url', import: 'default',
})
const urls = new Map(Object.entries(files)
  .map(([path, url]) => [path.split('/').at(-1)!.replace(/\.glb$/, ''), url]))

export function modelAssetUrl(name: string): string {
  const url = urls.get(name)
  if (!url) throw new Error(`未登记的模型资产：${name}`)
  return url
}
