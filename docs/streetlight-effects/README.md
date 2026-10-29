# 洞口路灯亮灭效果

## 模型来源与原因

当前路灯是已有的单臂模型，源文件 `modelSources/legacy/路灯.fbx`，运行副本为 `src/assets/modelAssets/equipment/streetlight.glb`，实际洞口通过 `portal-structures.glb` 中的 `streetlight.*` 节点使用。当前配置每端 26 盏，共 52 盏，保留所有原模型和设备 ID，无需另行下载 Fab 模型。

旧 shader 主要缩放 `lights` 材质的 emissive，灯面的基础色仍接近浅灰；也没有灯头光晕和局部路面光斑，因此开关在白天或俯视角下不明显。

## 本次效果

- 灯面从暗色过渡到暖白发光，约 420 ms 渐亮、渐灭，反向切换从当前亮度继续。
- 光晕绑定原 GLB 发光面的中心，随单灯亮度变化，不移动杆体和原灯头。
- 夜间显示柔和的路面光斑；雾天下调强度，白天隐藏路面光斑，保留灯面和光晕反馈。
- 光晕和光斑是局部照明的视觉模拟，不新增物理点光源、实时阴影或体积光。地面光斑裁在道路内，软边衰减，避免照到草地或墙面。
- 所有效果读取现有 `deviceEnabled`，保留单灯设置及 PLC 默认策略，控制一盏不影响同端其他灯或另一端。
- 尊重减少动态效果偏好；地下结构模式隐藏洞口光效；销毁场景时移除动画事件订阅。
- 每个洞口共用一组光晕和一个地面光斑批次，原生渲染分辨率不变。

## 验证

`pnpm build` 通过。13 项路灯、设备独立控制和拾取专项测试通过。全量 `pnpm test` 共 59 项，58 通过，1 项为现有 `blendFile/scenes/portal-access.blend` 与资产迁移清单哈希不一致；本次没有改动该源文件或迁移记录。

网页检查白天单灯开启、夜间单灯关闭、西/东洞口和雾天。`ramp-audit.json` 通过临时拦截 Cesium 公共 `CustomShader.setUniform` 方法记录实际渲染值：西端第一盏从 1 连续下降到 0，相邻灯和东端对应灯保持 1。记录后已恢复原方法并删除临时浏览器变量，未添加生产调试接口。减少动态效果下直接到达 0。

截图：`west-day-off.png`、`west-day-on.png`、`west-night-on.png`、`west-night-one-off.png`、`east-night-on.png`、`east-night-one-off.png`、`east-overview-night.png`、`east-fog.png`。

源码回退副本：`/tmp/codexaigis-streetlight-effects-20261028/`。本次没有修改 GLB、Blender 源文件、模型授权或部署配置，未部署。

## 夜间环境补光修正

用户反馈山体、树木近乎全黑后，将山体/植被的夜间环境光系数从 0.08 调整至 0.65；洞口构筑物的夜间漫反射系数从 0.08 调整至 0.6。洞门及变电所在夜间、雾天下使用稳定的天空漫射补光，切回白天恢复其原天空系数。白天强度参数、灯具渐变、光晕和路面光斑保持原逻辑，不改变全局定向光或渲染分辨率。

这是一种以设备巡检可读性为目标的夜景补光。修正前后同视角截图为 `night-fill-before-west/east.png` 和 `night-fill-after-west/east.png`，山体和树木区域亮度统计见 `night-fill-qa.json`。两端夜间画面及日夜切换已检查，构建通过。源码修改前副本为 `/tmp/codexaigis-night-fill-20261028.ts`。
