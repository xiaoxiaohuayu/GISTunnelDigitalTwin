# 树木、草丛与设备模型替换

## 当前接入

使用用户提供的 `blendFile/scenes/christmass_trees_pack.blend`，选择树形 1、2、3，各提取 LOD0、LOD2、LOD3。近景用 LOD0，中景用 LOD2，远景用公告板 LOD3；这是按洞口空间位置预分配的 LOD，不是新增的动态 LOD 系统。

保留原有 200 处树木、灌木位置及缩放、旋转，也保留 87 处石头和地形、草地。更换树木网格和相关材质，另添加 548 处低密度草丛，避开车行道和变电所底座。树木有效三角形从 648,192 降至 447,766，减少 30.92%。

当前 `src/assets/modelAssets/portal/portal-terrain.glb` 为 17,559,956 字节，约 17.56 MB。对比此前 15.23 MB 的景观增加约 2.33 MB，原始 212 MB 树包及中间库不会打包到网页。

原始树包未保存或改动。提取的可编辑模型在 `blendFile/prepared/fab-firs.blend`；中间 GLB 在 `modelSources/processed/`。枝叶颜色图最多 2K，法线及远景图最多 1K，叶片使用 MASK 透明裁剪，公告板使用 unlit。

来源：[Fir trees pack (9 models+LODS and billboards)](https://www.fab.com/listings/0015d682-64e8-4d70-9ea6-d5f6faaa22be)，作者 LOLIPOP。使用用户已有的源文件及授权；本次没有执行领取、购买或下载该包。

## 回退点

- `src/assets/modelAssets/legacy/portal-terrain-before-fab.glb`：用户确认保留的 15.23 MB 景观。
- 同目录的 `camera-before-fab.glb`、`vehicle-detector-before-fab.glb`：设备备份。两类设备的原始字节均已保留，迁移清单指向归档副本。
- `checkpoint.json` 记录回退文件的 SHA-256。

## 已完成验证

- 原有树木、石头的平移、旋转、缩放数据保持一致。
- 保留所有地形和石头网格的索引数量，使用 sequential Draco 编码避免二次编码丢弃退化三角形。
- 检查 9 组 Fir 网格、近中景的树干及针叶材质、远景透明及 unlit 材质。
- 38 项测试通过，生产构建通过；本地 Vite 返回正确的 GLB 类型与文件大小。构建产物不含 `.blend`、FBX、OBJ、下载压缩包和回退模型。
- `fir-preview.png`、`portal-before-offline.png`、`portal-after-offline.png` 为 Blender 离线检查图。洞口离线图不包含 Cesium 动态生成的道路、车流和洞内设备，不能当作网页最终截图。
- 已在本地网页检查上、下行洞的摄像机、车辆检测器；摄像机三维模型直接拾取可打开原设备详情，离线演练禁用监控预览，解除后恢复在线与预览。截图包含 `camera-up-web.png`、`camera-down-web.png`、`radar-web.png`、`radar-down-web.png`、`camera-alarm-web.png`、`camera-recovered-web.png`。
- 已在本地网页检查西、东洞口树木和草丛，保存 `west-final-web.png`、`east-final-web.png`、`grass-close-web.png`。构建后预览页也已检查两端，见 `production-west-web.png` 和 `production-east-web.png`；画布与页面均为 2548 × 1287，原生分辨率不变。未对稳定帧率作保证，详见 `qa.json`。

## 免费下载与设备接入

安全验证由用户完成后继续下载，原始下载文件及 SHA-256 在 `modelSources/fab/sources.json`，不打入网页构建。

1. [Game ready grass](https://www.fab.com/listings/ce4a3934-00e7-4343-8553-8667d4c4bd1c)，Charlie catling，CC BY 4.0。选取一个 132 三角形草丛，尺寸 0.85 × 0.85 × 0.48 米；GPU 实例化 548 处，仅布置平整绿地，MASK 裁剪保留透明轮廓。
2. [Gatso RT4](https://www.fab.com/listings/ba5e6da4-c649-4b2f-996b-b294c499c942)，GoldenBlack，CC BY 4.0。提取雷达机身，移除三脚架、独立闪光灯和电源箱，添加吊架，替换 6 处车辆检测器外观。保留设备编号、定位、拾取和模拟数值；这是演示外观适配，不代表现场设备型号。9,674 三角形，11 个材质。
3. [CC0 - Camera](https://www.fab.com/listings/846f71a7-6951-4082-844d-3a7395dfde17)，plaggy。作者描述写 CC0，Fab 下载面板写 CC BY 4.0，按 CC BY 4.0 保留署名。替换 20 处壁挂摄像机，统一为 0.55 米高、底部原点，1K 贴图、WebP，1,016 三角形、4 个材质，运行文件约 0.87 MB。
4. CO/VI、NO₂、风速、FBG、湿度、红外火焰探测器继续保留现有模型。没有将烟感替换成红外探测器，也没有将裸 DHT11 模块当作工业监测器。

发布署名位于 `public/model-credits.html`，网页左下角有“模型署名”入口。两个新设备沿用原业务模型文件名，不改设备目录、遥测或事件业务接口。

## 重建本次模型版本

需要 Blender、`cwebp`、Python Pillow，以及 glTF Transform CLI。输出先写到临时位置，核对后再覆盖运行文件。

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-fab-firs.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/prepare-fab-assets.py
npm exec --yes --package=@gltf-transform/cli@4.3.0 -- node scripts/assemble-fab-landscape.cjs
python3 scripts/compress-portal-terrain.py \
  --source modelSources/processed/portal-terrain-fir-uncompressed.glb \
  --output /tmp/portal-terrain-fir-textures.glb \
  --report docs/fab-replacement/texture-report.json
npm exec --yes --package=@gltf-transform/cli@4.3.0 -- gltf-transform draco \
  /tmp/portal-terrain-fir-textures.glb /tmp/portal-terrain-fir-final.glb \
  --method sequential --quantize-position 16 --quantize-normal 14 \
  --quantize-texcoord 16 --quantize-generic 16 --quantization-volume mesh \
  --encode-speed 2 --decode-speed 5
```

本次组装固定读取 `portal-terrain-before-fab.glb`，以保留该回退点的地形和布局；以后若调整地形，需明确选择新的组装输入，不覆盖原回退点。

设备生成：`prepare-fab-assets.py` 写入 `blendFile/prepared/` 和 `modelSources/processed/`，不覆盖下载原件。将 `fab-gatso-overhead.glb` 核对后复制到运行目录的 `equipment/vehicle-detector.glb`；摄像机先执行 `gltf-transform webp modelSources/processed/fab-plaggy-camera.glb /tmp/fab-camera-webp.glb --quality 90`，核对后复制到 `equipment/camera.glb`。原生成脚本默认保留现有摄像机和车辆检测器，避免重新生成覆盖此次接入。
