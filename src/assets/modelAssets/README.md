# 模型资产

运行时模型的唯一目录。使用 GLB，内嵌纹理和缓冲数据。交通标志图片仍在相邻的 `traffic-signs/`。

| 子目录 | 内容 |
| --- | --- |
| portal | 洞口结构、地形和历史标志模型 |
| vehicles | Audi、轿车和新增面包车 |
| characters | 行人低模与带骨架的施工人物 |
| equipment | 变电所、水箱、风机及其他设备 |
| environment | 落石等环境模型 |
| legacy | 完整保留的旧变电所、原洞口组合模型、旧水箱和旧施工人物 |

代码通过 `src/engines/modelAssets.ts` 的 `modelAssetUrl(name)` 获取 Vite 生成的 URL，参数为不带扩展名的文件名。运行目录中的文件名应唯一。`legacy/` 不参与运行时映射，也不会打入生产包。

Blender 使用米制、X 朝前、Z 朝上，导出 GLB 时使用 Y-up。Cesium Primitive 使用 `upAxis: Axis.Y, forwardAxis: Axis.X`；Entity 模型沿用事件模块的朝向校正。

## 源文件与重建

- `blendFile/originals/` 保存原始 Blender 文件，新版变电所为 `substation-new.blend`，旧版在 `originals/legacy/变电所.blend`。
- `blendFile/prepared/` 保存可复用的处理后模型，`blendFile/scenes/` 保存洞口场景和备份。
- 树木源文件的 `leaf/`、`bark/` 依赖与 `.blend` 同目录保存，保留相对路径。
- `modelSources/new/` 保存本次新增 glTF、FBX 和原贴图，包括人物原始高低模；`modelSources/legacy/` 保存历史导入资源；`modelSources/prepared/` 保存树木生成贴图。

本次新增模型重建命令：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-new-assets.py
```

该脚本输出检查预览及转换指标，排除变电所摄影棚地面，保留人物骨架和动作。施工人物默认显示源动作首帧，不自动播放动画。蒙皮网格放在 glTF 场景根节点，避免 Cesium 对 FBX 厘米单位重复计算包围盒。GLB 使用标准四权重蒙皮，原始 FBX 保留完整数据。

已有导出脚本通过 `scripts/asset_paths.py` 使用同一分类规则。完整重建洞口或执行历史设备生成脚本后，再运行上述转换命令，以更新新版模型及分离历史变电所。运行 `pnpm test` 和 `pnpm build` 验证归档完整性及构建结果。

迁移来源和 SHA-256 在 `docs/model-assets/migration.json`，转换尺寸及三角形统计在 `docs/model-assets/conversion.json`。原始文件保持字节不变；洞口组合 GLB 的迁移前版本在 `legacy/portal-structures-original.glb`。

## 洞口地形压缩

`portal-terrain.glb` 的压缩基线为 15.23 MB，已保存在 `legacy/portal-terrain-before-fab.glb`。当前 Fir 树木与草丛版约 17.56 MB，保留原有 287 处树木、石头布局，另补充路边草丛。摄像机与车辆检测器也已接入免费 Fab 模型，详情见 [模型替换记录](../../../docs/fab-replacement/README.md)。完整 `portal-terrain_back.glb` 放在 `legacy/` 中保留。重建和验证步骤见 [地形压缩说明](../../../docs/terrain-compression/README.md)。
