# 洞口开放连通道、反光条及可替换交通牌

## 使用

两个洞口前的中央分隔带各增加一条开放连通道，连接两侧道路。通道长 24 m、跨向宽 15 m，内侧护栏与路侧标线留口，没有封闭围栏。西端原消防水泵已移到水箱旁，避免占用通道；设备信息及定位同步更新。现有车辆仍沿原车道行驶，不增加掉头或跨道路行驶逻辑。

四个洞门开口增加黄黑相间的金属反光包边，覆盖拱顶及两侧竖边。

原固定的禁行人、禁停和限速 60 模型已停止加载。新交通牌默认使用本次提供的三张图片：

1. 禁止变更车道，按用户确认采用上传图片。
2. 限速 80。
3. 限高 1.9 m。

直接点击三维交通牌即可打开图片编辑器；也可从“系统控制”底部进入。每块图片可分别替换和恢复默认，点击“保存交通标志”后两端同步更新。图片存于当前浏览器和当前站点的 IndexedDB，刷新后恢复。

## 验证

- `pnpm test`：31 项通过；`pnpm build`：类型检查及生产构建通过。
- Blender 模型检查通过：24 × 15 m 路面存在，通道两侧内护栏和灯杆开口畅通。
- 浏览器实际点击限速牌，编辑区正确定位到第二块标志。
- 替换第二块图片保存，刷新后仍读取到 31982 字节的图片 Blob；其余两块配置不变。测试后已恢复三张默认图片。
- 浏览器资源记录确认不再请求 `portal-signs.glb`。
- 本次只重建 `portal-structures.glb`，优化过的山体和植被 `portal-terrain.glb` SHA-256 前后保持一致。

## 截图

- [西端开放连通道俯视](portal-crossover-top.png)
- [东端开放连通道俯视](portal-crossover-east-top.png)
- [西洞口反光条与交通牌](portal-access-west.png)
- [东洞口反光条与交通牌](portal-access-east.png)
- [交通牌图片编辑器](traffic-sign-editor.png)

## 资源维护

`/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-portal-access.py` 从原洞口源场景生成开放通道、清理护栏并增加反光条，保存 `blendFile/scenes/portal-access.blend` 并仅导出 `src/assets/modelAssets/portal/portal-structures.glb`。完整洞口生成脚本也会调用同一处理函数，避免以后重建丢失本次调整。

连通道位置在 `src/config/portalAccess.json`，运行时内侧边线和模型共用此配置。
