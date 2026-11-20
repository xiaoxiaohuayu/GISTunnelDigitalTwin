# 部署、离线配置与前后端联调手册

本文档说明如何将构建产物 `dist/` 部署至公网或内网离线环境，以及如何通过 `config.json` 接入真实遥测、控制和视频流服务。

## 1. 运行时配置（`dist/config.json`）

构建完成后，`public/config.json` 会复制到 `dist/config.json`。**修改该文件无需重新打包**，刷新浏览器即可生效（前端以 `cache: 'no-store'` 读取）。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cesium.ionToken` | `string` | `""` | Cesium ion 令牌；为空时回退构建期 `VITE_CESIUM_ION_TOKEN`；完全离线时可留空 |
| `cesium.terrain.type` | `'ion' \| 'url' \| 'ellipsoid'` | `'ion'` | `ion` 公网地形 / `url` 离线 quantized-mesh 地形 / `ellipsoid` 椭球兜底 |
| `cesium.terrain.url` | `string` | `""` | `terrain.type === "url"` 时必填（如 `/gis/terrain`） |
| `cesium.imagery.type` | `'ion' \| 'xyz' \| 'wmts' \| 'wms' \| 'single-tile'` | `'ion'` | 影像底图来源 |
| `cesium.imagery.url` | `string` | `""` | 非 `ion` 模式必填（如 `/gis/imagery/{z}/{x}/{y}.png`） |
| `cesium.imagery.layer` | `string` | `""` | `wmts` / `wms` 图层名 |
| `cesium.imagery.tileMatrixSetID` | `string` | `""` | `wmts` 矩阵集 ID（如 `w` 或 `EPSG:3857`） |
| `cesium.imagery.maximumLevel` | `number` | `18` | 瓦片最大缩放级别 |
| `dataMode` | `'mock' \| 'live'` | `'mock'` | `mock` 本地演示 / `live` 实时遥测与控制 |
| `apiBaseUrl` | `string` | `""` | 实时控制接口前缀（如 `/api`） |
| `wsUrl` | `string` | `""` | 实时遥测 WebSocket 地址 |
| `auth.defaultRole` | `'viewer' \| 'operator' \| 'admin'` | `'admin'` | 默认进入角色，可被 URL 参数 `?role=` 覆盖 |
| `streams` | `Record<string, string>` | `{}` | 摄像机 ID 到视频流地址的映射 |

### 内网离线 + 实时模式配置示例

```json
{
  "cesium": {
    "ionToken": "",
    "terrain": { "type": "url", "url": "/gis/terrain" },
    "imagery": { "type": "xyz", "url": "/gis/imagery/{z}/{x}/{y}.png", "maximumLevel": 17 }
  },
  "dataMode": "live",
  "apiBaseUrl": "/api",
  "wsUrl": "/ws/telemetry",
  "auth": { "defaultRole": "operator" },
  "streams": { "camera-1": "/hls/camera-1/index.m3u8" }
}
```

## 2. 静态服务器与缓存建议

发布时需完整部署 `dist/` 目录（包含 `cesium/`、`assets/`、`textures/` 与 `config.json`）：

- **`/config.json` 与 `/index.html`**：设置 `Cache-Control: no-store, no-cache, must-revalidate`，保证运维修改配置或发版后刷新立即生效。
- **`/assets/`**：文件名已含内容哈希，建议设置 `Cache-Control: public, max-age=31536000, immutable` 长期缓存（`vendor-cesium`、`vendor-element-plus`、`vendor-vue` 等 chunk 不会随业务发版失效）。
- **`/cesium/`**：建议开启 30 天缓存，并确保 `.wasm`、`.json`、`.glb` 启用 Gzip/Brotli 压缩。
- **`/api/` 与 `/ws/`**：反向代理到业务后端；WebSocket 路由需开启 HTTP/1.1 Upgrade 与长连接读超时（如 3600 s）。

## 3. 前后端联调接口契约

### WebSocket 遥测推送（`wsUrl`）

支持推送单条对象、`{ data: ... }`、数组或 `{ items: [...] }` 批量快照：

```json
{
  "items": [
    {
      "deviceId": "covi-1",
      "status": "正常",
      "value": "14 ppm / 0.002 m⁻¹",
      "severity": "normal",
      "note": "实时遥测",
      "updatedAt": 1763604000000
    }
  ]
}
```

- `severity` 枚举：`"normal" | "warning" | "alarm"`；断线后前端自动按指数退避重连（最长 30 s）。

### HTTP 控制网关（`apiBaseUrl`）

- **单设备控制**：`POST {apiBaseUrl}/devices/{deviceId}/control`，请求头携带 `X-Command-Id: <uuid>`，请求体 `{ "commandId", "timestamp", "deviceId", "patch" }`。
- **系统级控制**：`POST {apiBaseUrl}/systems/control`，请求体 `{ "commandId", "timestamp", "patch" }`。
- **响应格式（HTTP 200）**：`{ "commandId", "status": "applied" | "queued", "message?", "appliedPatch?" }`。非 2xx 或超过 10 秒超时时，前端不应用状态，展示错误提示并记录到操作审计列表。

## 4. 上线前交付验收清单

- [ ] 联网执行 `pnpm install && pnpm typecheck && pnpm build` 零错误完成，`dist/config.json` 与 `dist/cesium/` 完整存在。
- [ ] 修改 `dist/config.json` 后刷新浏览器，验证免重新打包即可切换底图/地形、数据源模式与默认角色。
- [ ] 验证三级权限（`?role=viewer`、`?role=operator`、`?role=admin`）的界面可见性与控制拦截。
- [ ] 验证高危操作（关闭横洞卷帘门、入口红灯、车道红叉）弹出二次确认并写入审计记录。
- [ ] 验证“配置与台账”懒加载打开、配置包导入导出与 3D 位置拖拽保存正常。
- [ ] 验证“全览”视角或后台标签页下 GPU 渲染休眠，无持续满帧空转。
- [ ] 在目标交付分辨率（`1920×1080`、`3840×2160`、`1366×768`）下确认抽屉、告警与底部导航无遮挡错位。
