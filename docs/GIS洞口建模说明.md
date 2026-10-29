# GIS 洞口场景建模

以 `video-analysis/frames/second-001.jpg`、`second-005.jpg`、`second-056.jpg` 和用户提供的洞口近景为外观参考。本轮集中处理 GIS 入口场景，不增加设备数据统计。

## 文件

- `blendFile/scenes/portal-site.blend`：可在 Blender 4.5 打开的可编辑源场景，单位为米。
- `scripts/build-portal-site.py`：重建模型的脚本，固定随机种子。
- `src/assets/modelAssets/portal/portal-terrain.glb`：带双洞开孔的山体、岩石和植被。
- `src/assets/modelAssets/portal/portal-structures.glb`：端墙、拱圈、入口场地、挡墙、护栏、路灯、情报板和管理房。
- `src/engines/portalSite.ts`：坐标定位、局部地形替换和周边高程衔接。

重建命令，在项目目录执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-portal-site.py
pnpm build
```

## 坐标与地形

Blender 的 X 轴沿隧道，Y 轴横跨双洞，Z 轴向上，双洞中心在 Y = ±12 m。模型原点位于西侧明洞口中央。Cesium 按线路纵坡旋转模型，GLB 加载显式指定 `upAxis: Axis.Y`、`forwardAxis: Axis.X`，避免默认 Z-forward 转换额外旋转 90°。

入口使用同一条 GIS 道路，模型不重复创建路面。东、西两端共用同一套洞口模型；东端旋转 180°，纵坡随线路方向反转。两端分别开挖地形、采样影像并建立外围过渡环，不再保留旧的东侧简化洞门和挡墙。两端均有遮雨棚、路灯、护栏、岩石、树林与管理建筑。地下查看时同时隐藏两端局部山体和过渡环。导航可直接定位西洞口或东洞口；选择固定视角会停止漫游。

## 车辆与事件素材

`scripts/build-vehicles.py` 从用户提供的 Audi 源模型导出精细版 `car-audi.glb` 和三种颜色的行驶简化版。保留原模型材质分区，使用 glTF PBR 材质重建车漆、玻璃、轮胎、轮毂和灯具。原始低模颜色贴图和 Audi 轮胎贴图缺失，因此这不是恢复原贴图。精细版约 25 万三角面，简化版约 3 万三角面；每个方向安排一辆精细版，事件主车也使用精细版。

`scripts/build-incident-props.py` 导出不规则落石、反光锥桶、带支脚围挡和安全作业人员。落石包含下落、回弹、落定与短时扬尘；施工包含警示灯与人员手势。`src/engines/incidentEffects.ts` 管理火焰、烟雾与扬尘，切换或解除事件会移除旧粒子，烟雾随通风方向漂移并限制在洞顶以内。这些均为本地演示效果，不是物理仿真。减弱动画模式保留事件标识并减少空间运动。

素材重建命令：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-vehicles.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-incident-props.py
```

## 事件反馈与入口标志

两洞的两条车道均有白色直行导向箭头，覆盖两端引道与洞内，箭头方向随各洞车流方向旋转。洞外情报板文字只朝向对应车道的来车方向，驶出侧面板反向安装；东端通过整组洞口旋转保持一致。洞内情报板与双面车道指示器分别按正、反面设置三角形绕序并剔除背面，避免从壳体背面读取文字，同时保留反向红叉。

事件设备读数使用同一个本地状态：停车带占用区分上下行洞，火灾影响距事发点 120 m 内的感温、温湿度和火焰探测器，火灾及烟雾影响 220 m 内的 CO / VI 读数。检测器显示拥堵低速或附近占道状态。切换事发方向和解除演练会重新计算反馈，非事发洞与远处设备保留正常读数。数值与范围均为演练预设，不代表现场测量或烟气、温度仿真。

两端驶入方向增加视频中的禁止行人、禁止停车、限速 60 组合牌。独立资源为 `src/assets/modelAssets/portal/portal-signs.glb`，可编辑源文件为 `blendFile/scenes/portal-signs.blend`，沿用两端洞口坐标变换。仅重建标志时运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-portal-signs.py
```

## 当前限制

这是按视频外观制作的演示模型，尚非原始工程模型的严格 1:1 复刻。树木、岩石和地面仍与视频中的精细贴图资产有差距。两端复用相同的洞口场地布局，外围分别与当地地形衔接。主体覆土统计来自原地形，不能作为替换后的局部山体工程校核值。
