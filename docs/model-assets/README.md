# 模型归档与接入验收

验收日期：2026-10-27。使用本地生产预览进行检查，未部署到 Vercel。

## 归档结果

147 个迁移文件共 1,784,835,576 字节。复制后核对 SHA-256，再移除旧位置；迁移后的原文件逐一通过哈希复核。原洞口组合 GLB 的迁移前版本另存于运行资产的 `legacy/`，新版仅移除旧变电所的显示节点及其悬空文字，其他洞口结构保持原有几何。

运行资产共 52 个 GLB，统一位于 `src/assets/modelAssets/`。Blender 源文件及备份统一位于 `blendFile/`，其他原始导入资源位于 `modelSources/`。运行时映射排除 `legacy/`，生产构建不包含 Blender、FBX、OBJ 源文件或旧变电所归档。

- `migration.json`：每个迁移文件的原路径、新路径、大小及 SHA-256。`preservedAt` 指向被修改运行副本的完整归档。
- `conversion.json`：新增模型的尺寸、三角形数量、材质数及 GLB 大小。
- `runtime.json`：最终 GLB 文件清单及 SHA-256。
- [资产使用及重建说明](../../src/assets/modelAssets/README.md)。

## 验证结果

- `pnpm test`：35 项通过，包括迁移原文件完整性、GLB 内嵌依赖、模型尺寸、人物网格、骨架和动作、源 glTF 外部资源完整性。
- `pnpm build`：通过。保留原有 Cesium 大包提示，没有通过调整阈值隐藏提示。
- 两个洞口均使用新版独立变电所，运行时模型实例数为 2。旧建筑没有与新版重叠。
- 24 辆车保留，其中面包车为 `traffic-4`、`traffic-10`、`traffic-16`、`traffic-22`，每洞两辆。四辆面包车的运动位移与车头方向点积均为正，确认沿车头前进。
- 行人事件使用自带低模人物。施工事件使用 FBX 人物，骨架及原动作保留，默认不播放；检查了上下行场景和近景。解除演练后，人物实体清除。
- 修复 FBX 蒙皮网格继承厘米缩放时的 Cesium 包围盒问题，包围半径从约 0.00288 米恢复为约 1.06549 米；加入回归检查。
- 消防水箱继续使用 `tank-1`，液位显示 `82 %`，定位和选中高亮有效。
- 原生分辨率 `resolutionScale=1`，FXAA 开启。未承诺稳定帧率。
- 页面验收中未捕获到运行时异常。临时检查入口已从源码及最终构建移除。

## 截图

- 迁移前：`before-west.png`、`before-substation.png`。
- 两端洞口：`after-west.png`、`after-east.png`。
- 新变电所：`after-substation.png`。
- 双向面包车：`after-van-up.png`、`after-van-down.png`。
- 人物：`after-pedestrian.png`、`after-construction-up.png`、`after-construction-down.png`、`after-worker-close.png`。
- 水箱交互：`after-water-tank.png`。

面包车近景截图临时暂停了采样页中的车流以固定镜头，随后重新加载页面恢复正常运行；产品代码没有增加暂停逻辑。`*-preview.png` 为转换过程的 Blender 检查图，运行页面截图使用 `after-` 前缀。

原始模型和迁移前档案保持完整。以后有意修改归档源文件时，迁移哈希检查会提示差异，需核实改动来源后再更新对应清单。
