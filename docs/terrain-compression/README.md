# 洞口地形压缩与植被恢复

2026-10-27，从完整备份重新生成运行模型，保留树木、石头、草地及全部实例布置，未部署到 Vercel。

本页记录 15.23 MB 压缩基线。后续 Fir 替换版及当前下载状态见 [Fir 接入记录](../fab-replacement/README.md)，该压缩基线仍完整保留在 legacy 中。

## 结果

| 项目 | 完整备份 | 新运行模型 |
| --- | ---: | ---: |
| 文件大小，十进制 MB | 39.22 | 15.23 |
| 基础网格 | 7 | 7 |
| 基础三角形 | 186,738 | 186,738 |
| 实例布置 | 287 | 287 |
| 材质 / 内嵌贴图 | 8 / 10 | 8 / 10 |

体积减少 61.17%。没有减面、合并或裁掉植被。节点变换和全部实例的平移、旋转、缩放数据逐字节相同。

Draco 使用每个网格独立的 16 位位置量化、14 位法线和 16 位 UV。将最终文件实际解码后，确认各网格三角形数量不变；解码顶点相对原始顶点的最近位置距离最大约 2.79 毫米，并通过了逐顶点容差检查。

贴图分辨率保持不变，所有透明通道完全相同。草地法线采用 WebP near-lossless 80，RGB PSNR 为 51.2 dB；粗糙度使用无损 WebP，其余彩色贴图使用质量 90。未采用法线损失较大的普通有损编码方案。

## 文件

- 当前使用：`src/assets/modelAssets/portal/portal-terrain.glb`。
- 完整备份：`src/assets/modelAssets/legacy/portal-terrain_back.glb`，SHA-256 保持为 `da31d6bafc14ed9284cf38a1bfdaedca40af2c6c9436d81c2ffa02e2d5ae9f98`。
- 用户之前丢失布置的压缩版：`src/assets/modelAssets/legacy/portal-terrain-missing-instances.glb`，保留备查。

两份归档均排除在运行时映射和生产构建之外。迁移清单的 `preservedAt` 指向完整备份，运行文件清单已更新。

`report.json` 记录最终结果，`texture-report.json` 记录贴图阶段，`geometry-validation.json` 记录解码验证结果。

## 重建

需要本机 `cwebp` 和 Python Pillow。执行纹理压缩，再执行单独的 Draco 编码，保留实例扩展；不使用会改变场景结构的一键优化。

```sh
python3 scripts/compress-portal-terrain.py --output /tmp/portal-terrain-textures.glb
npm exec --yes --package=@gltf-transform/cli@4.3.0 -- gltf-transform draco \
  /tmp/portal-terrain-textures.glb src/assets/modelAssets/portal/portal-terrain.glb \
  --quantize-position 16 --quantize-normal 14 --quantize-texcoord 16 \
  --quantize-generic 16 --quantization-volume mesh --encode-speed 2 --decode-speed 5
pnpm test
pnpm build
```

现有 Cesium 加载器支持 `EXT_mesh_gpu_instancing`、`EXT_texture_webp` 和 `KHR_draco_mesh_compression`，无需修改页面加载代码或新增项目运行依赖。

## 验证

- 36 项测试通过。新增回归检查比较 287 处布置的实际属性数据、节点变换、网格面数和材质，防止再次丢失。
- 生产构建通过，保留原有引擎大包提示。
- 对比完整备份与压缩版的西、东洞口截图，树木、石头、灌木及草地均正常显示；并检查本地生产预览的 Draco 解码加载。
- `before-missing-west.png` 为用户原压缩版的缺失状态；`reference-full-*.png` 为完整备份；`after-compressed-*.png` 为开发页面；`production-*.png` 为生产预览。
