# 隧道数字孪生基础工程

Vue 3 + TypeScript + Vite + Three.js + Cesium。当前完成双引擎运行基础、真实山区地形与 GIS 地下双洞几何样板，已增加程序化洞门、联络通道和设施示意，不包含精细贴图资产、设备事件、数据看板或真实监测接口。

## 本地启动

需要 Node.js 22.12+ 和 pnpm 10.6.3。依赖版本记录在 `pnpm-lock.yaml`。

```bash
pnpm install --frozen-lockfile
# 首次配置：复制 .env.example 为 .env.local 并填写 Cesium ion Token
pnpm dev
```

访问 http://127.0.0.1:5180/ 。使用 5180 是因为本机 5173 已有其他服务。仅监听本机地址，端口占用时明确报错，不自动跳转端口。

```bash
pnpm typecheck
pnpm build
pnpm preview --port 4180
pnpm ci
```

`typecheck` 同时检查 Vue SFC 和 Vite 配置。`build` 先做类型检查，产物在 `dist/`。当前 `ci` 执行类型检查和生产构建，不代表自动化浏览器测试。Vite 能运行不等于 Vue 类型检查通过。

TypeScript 固定使用 5.9.x。初始化时实测 TypeScript 7.0.2 与 vue-tsc 3.3.13 不兼容，错误为 `Package subpath './lib/tsc' is not defined by "exports"`。不要未经验证直接升级到 TypeScript 7。

## 当前可操作功能

- 三维场景：网格、坐标轴、测试物体、OrbitControls、重置视角。
- GIS 地图：Cesium World Terrain 真实山体、卫星影像、倾斜观察与返回山区。
- 两个模式按需加载，切换时卸载旧组件；引擎不进入 Vue 深层响应式系统。
- Three.js 清理动画循环、ResizeObserver、控制器、几何、材质和 WebGL 上下文。
- Cesium 销毁 Viewer、ResizeObserver 和 WebGL 上下文。异步初始化完成前离开页面也会清理返回的实例。
- 初始化失败与模块加载失败分别有提示。

GIS 使用 Cesium ion 提供的 World Terrain 和 AERIAL 影像，需要网络及有资产访问权限的 Token。配置项为 `.env.local` 中的 `VITE_CESIUM_ION_TOKEN`，该文件已被忽略；`.env.example` 仅记录变量名。Vite 的客户端环境变量会进入浏览器构建产物，部署时应使用限制来源和必要读取权限的公开客户端 Token。

初始视角为青城山周边演示山区，不代表视频中的真实隧道位置。山体使用真实地形，不做高度夸张；尚未接入工程模型和地理锚点。缺少 Token 或初始化失败时显示错误，不静默退回平面地球。

## 文件职责

```text
src/
  App.vue                      应用壳、模式切换、引擎组件懒加载
  main.ts                      Vue 启动入口
  style.css                    全局基础布局与视口公共样式
  env.d.ts                     Cesium 资源地址的 Window 类型
  components/
    ThreeViewport.vue          三维容器、初始化状态、重置操作
    CesiumViewport.vue         地图容器、初始化状态、重置操作
    ViewportLoading.vue        异步组件加载状态
    ViewportError.vue          异步组件加载失败状态
  composables/useEngine.ts     挂载、异步竞态和卸载生命周期
  engines/threeScene.ts         Three.js 场景及资源所有权
  engines/cesiumMap.ts          Cesium Viewer、底图、相机和资源释放
  types/engine.ts              最小引擎接口和模式类型
src/assets/modelAssets/        按类别归档的运行时 GLB
blendFile/                     Blender 原始、处理后及场景源文件
modelSources/                  FBX、OBJ、glTF 和纹理等导入资源
```

当前只有两个模式，使用组件状态切换，无需先引入 Router、Pinia 或通用插件体系。后续需要可分享 URL、深层业务状态时再增加。

## Cesium 资源和部署

`vite.config.ts` 用 `vite-plugin-static-copy` 将 Cesium 的 Workers、Assets、Widgets、ThirdParty 提供到 `cesium/`。开发和生产均使用同一 URL 布局。

插件 4.x 默认保留源目录结构，这里使用 `rename.stripBase: 4` 去掉 `node_modules/cesium/Build/Cesium` 前缀，避免请求 XML 实际收到 SPA 的 HTML。

`window.CESIUM_BASE_URL` 在创建 Viewer 前设置为基于当前页面的绝对资源地址。Vite `base: './'` 支持静态子目录部署，发布时需要复制整个 `dist/`，不能只取 JS 文件。以 HTTP 服务访问，不直接双击 HTML。

Cesium 与 Three.js 已按视口分包。生产构建仍会提示大于 500 kB 的包，主要是引擎自身代码；未通过提高阈值隐藏警告。后续依据实际加载时间决定是否进一步优化。

## 后续接入位置

1. Blender 导出的 GLB 放进 `src/assets/modelAssets/`，通过 `modelAssetUrl()` 加载；源 `.blend` 统一放在 `blendFile/`。详见[模型资产说明](src/assets/modelAssets/README.md)。
2. 在 `threeScene.ts` 接入模型加载，模型拥有者负责纹理、材质、几何和动画资源的释放。
3. 模型稳定后再添加设备 ID、拾取、高亮、事件与漫游，不把业务逻辑堆进 `App.vue`。
4. 确认地理资料后，在独立数据文件中定义地理锚点与坐标约定，再连接地图和局部场景。

[视频还原方案](docs/隧道数字孪生_视频还原方案.md)记录后续完整目标，当前工程只完成基础阶段。

## 本次验证记录

2026-10-20：

- `pnpm build` 通过，包含 Vue 和 Vite 配置的 TypeScript 检查。
- ego-browser 实测开发服务和生产预览，三维网格与地球底图均正常显示。
- 生产页面 5 轮双引擎往返切换，跟踪的 10 个 WebGL 上下文最后只有当前场景 1 个有效，DOM 只有 1 个 Canvas。
- 同轮验证未捕获 window error / unhandledrejection，资源请求无 HTTP 4xx/5xx。
- 两个视口在 1280×720 容器内正确适配为 1280×606 Canvas，其余高度用于头部和页脚；重置视角可操作。
- 未执行长时间 GPU/内存压力测试，也未验证真实模型和多路视频性能。

[三维运行截图](docs/foundation-three.png) · [GIS 运行截图](docs/foundation-cesium.png)

### 山体接入验证

已接入 World Terrain 和 AERIAL，开发页面实测加载 131 个地形瓦片请求，未发现 HTTP 4xx/5xx；类型检查和生产构建通过。已目视检查山脊、沟谷起伏及影像贴合，山区复位按钮可用。该次数仅为当前视角记录，不是性能指标。

[山体实际运行截图](docs/gis-mountain.png)

## 山体内双洞初版

GIS 已增加地形约束的演示双洞，不需要 Blender 资产即可检查地下空间位置。

- `src/engines/tunnelSurvey.ts` 在青城山演示区域采样 9 条横向候选断面，每条 65 点，间距 50 m；选择纵坡不超过 4%、主体有足够覆土的直线候选。
- 按双洞中心距 24 m，再对两洞中心和左右外缘分别采样验证。断面外宽 12 m、内宽 11 m，拱顶相对路面最高 8.5 m。
- 两端各 100 m 作为洞口过渡范围，不计入主体覆土指标。该采样不是连续地形碰撞证明，不替代测绘、地质和工程设计。
- 当前服务数据实测：单洞 1.90 km，纵坡 1.42%，主体最小采样覆土 36.3 m。上游地形数据变化后结果可能变化。
- `tunnelModel.ts` 创建空心拱形衬砌和路面，衬砌使用灰色混凝土示意；洞口采用局部地形裁切、底板和两侧挡墙。精细化进展见下文。
- 默认完整山体遮挡地下主体。点击“查看地下隧道”开启地形透明观察，再点击恢复；“查看洞口”和“隧道全景”切换观察位置。
- 需要支持 Cesium clipping polygons 的 WebGL 环境才能显示洞口局部开挖；不支持时仍能使用透明地形查看地下主体。

当前只是 GIS 地下几何样板，不是视频完整还原，不涉及低代码编辑功能。

本次地下隧道验证：类型检查和生产构建通过；浏览器中完整山体遮挡、地形透明、洞口定位和全景复位可操作，未捕获运行错误或 HTTP 失败。截图：[完整山体](docs/tunnel-mountain.png)、[地下双洞](docs/tunnel-underground.png)、[洞口初版](docs/tunnel-portal.png)。洞口目前为简化开挖结构，需后续细化洞门、道路衔接和开挖边界。

## 洞口、联络通道和设施细化

2026-10-21：在原线路两端各延长 60 m 明洞，路面延伸到原端点外 160 m，包含洞门拱圈、立柱、限高牌、车道虚线、边线及人行道。洞口挡墙保留两侧，前后端开放。接线末端目前截断于演示开挖范围，尚未与现实道路和边坡连续衔接。

在主体 25%、50%、75% 桩号处增加 3 条人行联络通道。净宽 4 m、净高约 2.3 m，两洞相邻洞壁及人行道留口，横通道可直接看到另一洞路面。这里没有设置防火门，位置与尺寸是演示参数，不代表工程疏散设计。

`src/engines/tunnelDetails.ts` 管理沿线定位和设施。灯具间距 25 m，消防箱及疏散标识间距 100 m，双风机组间距 300 m。风机目前是简化箱体，灯具使用亮色几何，不产生真实照明，设施没有运行状态或监测数据。批量静态盒体合并到一个 Cesium Primitive，避免为每个部件建立 Entity。

新增“洞内视角”和“联络通道”按钮；洞内相机允许进入地形以下。默认完整山体遮挡地下主体，透明模式仍可查看双洞及横通道。联络通道是人行连通，不是上下行车辆调头车道。

验证：`pnpm build` 通过。ego-browser 已目视检查洞内、横通道开口及洞门接线路面，初轮检查无 window error / unhandledrejection。仍有 Cesium/Three.js 包体积提示，未进行长时间压力测试。当前属于程序化几何细化，尚未达到参考视频的 1:1 美术还原。

截图：[洞口延伸](docs/tunnel-portal-detail.png)、[洞内设施](docs/tunnel-interior-detail.png)、[联络通道](docs/tunnel-cross-passage.png)。

### 洞口山体裁切修正

原开挖矩形横跨双洞并深入原端点内 100 m，导致近景出现大面积长槽和外露拱顶。现改为每洞各 15 m 宽的独立入口裁切，在原端点处停止，保留双洞之间与主体上方的地形。外露的 60 m 延长明洞仍可见。洞外接线与挡墙仍为简化示意，未完成精细边坡衔接。

本次 `pnpm build` 通过；ego-browser 等待近景地形瓦片加载后，确认完整山体模式遮挡后方主体，未捕获运行异常。[修正后洞口](docs/tunnel-portal-terrain-fix.png)。

## Three.js 精细样板

局部三维场景已替换基础网格，新增 120 m 双洞样板。`src/engines/tunnelSample.ts` 生成可重复的衬砌环缝、路面和标线、检修道、墙面板、桥架、连续灯具、消防箱、限高与疏散标牌、带叶片与支架的圆筒风机，以及有实际开口的人行联络通道。`threeScene.ts` 为洞外和洞内设置独立的光照和雾效，风机叶片持续旋转。

三维页面提供洞口、洞内和联络通道三个固定观察位置。局部山体仅用于洞口构图，真实地形和隧道定位仍在 GIS 页面查看。样板使用程序化网格和生成纹理，尚未加载 Blender 制作的 GLB，也没有使用真实工程断面、设施型号或材质贴图。

验证：`pnpm build` 通过。ego-browser 实测三个视角均可切换，未捕获 `window error` 或 `unhandledrejection`。截图：[洞口样板](docs/sample-portal.png)、[洞内样板](docs/sample-interior.png)、[联络通道](docs/sample-passage.png)。
