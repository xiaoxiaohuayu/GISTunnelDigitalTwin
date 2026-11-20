# 隧道数字孪生前端系统（Tunnel Digital Twin）

基于 **Vue 3 + TypeScript + Vite + Cesium + Element Plus（按需引入）** 构建的公路双洞隧道数字孪生前端工程。支持地球到洞口的四段式入场、程序化可配置双洞/联络通道/停车带建模、28+ 类机电与交通设施三维实景、设备点选与 3D 位置拖拽调整、交通/设备事件演练联动、CSV 台账与配置包导入导出，以及**运行时离线底图/地形切换、双轨遥测/控制适配、三级角色权限、高危操作二次确认与视频流监控**。

## 环境要求

- Node.js `>= 22.12.0`
- pnpm `10.6.3`（依赖锁定于 `pnpm-lock.yaml`）
- 现代浏览器（需支持 WebGL2；不支持 Cesium Clipping Polygons 的显卡将自动降级为地下透明观察模式）

## 快速启动

```bash
pnpm install
# 方式一（推荐）：在 public/config.json 中填写 cesium.ionToken 或离线地形/影像地址
# 方式二：复制 .env.example 为 .env.local 并填写 VITE_CESIUM_ION_TOKEN
pnpm dev
```

开发服务默认监听 5180 端口（端口占用时直接报错，不自动漂移）。

```bash
pnpm typecheck   # vue-tsc + tsconfig.node.json 类型检查
pnpm test        # 运行 tests/*.test.ts 单元测试
pnpm build       # 类型检查 + 生产构建（输出到 dist/）
pnpm preview     # 预览生产构建产物
```

## 核心功能

- **空间与建模**：支持单洞/双洞、多车道与独立行车方向、人行/车行横洞、紧急停车带、洞口门楣与交通标志定制，以及洞口遮雨棚、隧道墙体和地下透明结构切换。
- **设备与交互**：覆盖交通、照明、通风、通信、消防、环境监测与设施 7 大类三维模型；支持三维点选、分类/桩号/状态检索、3D Gizmo 拖拽微调位置与台账联动更新。
- **双轨数据与控制适配层（`src/services/`）**：
  - 默认运行于 `mock` 本地演示模式，所有读数与告警明确标注“本地模拟”。
  - 在 `public/config.json` 中切换 `dataMode: "live"` 并配置 `wsUrl` / `apiBaseUrl` 后，自动启用 WebSocket 实时遥测（带指数退避重连）与 HTTP 控制网关（带 `X-Command-Id` 幂等键与超时保护）。
- **权限、安全与审计**：
  - 支持 `viewer`（只读观察）、`operator`（调度运维）、`admin`（系统管理）三级角色，可通过 `config.json` 的 `auth.defaultRole` 或 URL 参数 `?role=viewer|operator|admin` 切换。
  - 关闭横洞卷帘门、入口信号切红灯、车道切红叉等高危单控需二次确认，所有控制指令均记录到系统控制面板底部的操作审计记录。
- **监控视频与巡检漫游**：支持按摄像机 ID 配置实时视频流地址（`config.json` 中 `streams` 字段），并在视频流与三维模拟视角间切换；支持双向、变速、暂停/拖动进度的洞内巡检漫游。
- **运行时容错与性能优化**：
  - 内置 `webglcontextlost` / `webglcontextrestored` 与持久 `renderError` 恢复卡片。
  - Element Plus 按需引入、配置编辑器与标牌编辑器异步懒加载、Vite `manualChunks` 拆分引擎与依赖包；远景与后台标签页自动休眠按需渲染循环。

## 目录结构

```text
public/
  config.json                       运行时配置（无需重新打包即可修改地形/影像/接口/权限/视频流）
  model-credits.html                第三方 3D 模型署名
  textures/                         路面、墙面与地表贴图
src/
  App.vue                           应用壳（ElConfigProvider 中文语言包 + 异步主视口）
  main.ts                           入口与 Element Plus 按需注册
  plugins/elementPlus.ts            Element Plus 按需组件与样式清单
  config/runtimeConfig.ts           运行时配置加载、合并与校验
  services/                         数据、控制、权限与审计适配层
    types.ts                        遥测与控制契约类型
    telemetryProvider.ts            Mock / WebSocket 遥测实现
    controlGateway.ts               Mock / HTTP 控制网关实现
    auth.ts                         三级角色权限解析
    auditLog.ts                     高危二次确认文案与操作审计记录
  components/
    CesiumViewport.vue              主视口与面板编排
    CameraPlayer.vue                实时视频流 / 三维模拟视角播放器
    DeviceExplorer.vue              设备分类检索与定位
    DeviceInspector.vue             设备详情、实时/模拟读数与单控
    SystemsControls.vue             环境照明策略、单控与操作审计
    EventConsole.vue                交通/设备事件演练与处置记录
    configuration/                  隧道配置、洞筒编辑、台账与配置包导入导出
  engines/                          Cesium 场景、地形、设备、车流、光照与持久化核心引擎
docs/
  DEPLOYMENT.md                     离线部署、Nginx 配置、接口契约与交付验收清单
tests/                              Node 原生 TypeScript 单元测试
```

## 部署与联调

完整的 `public/config.json` 配置说明、内网离线地形/影像部署、Nginx 缓存与代理模板、WebSocket/HTTP 联调协议及上线验收清单，请参见 [部署与联调手册](docs/DEPLOYMENT.md)。
