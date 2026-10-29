import { Cartesian3, Cartographic, Matrix4, Request } from 'cesium'
import type { ImageryProvider } from 'cesium'

// Reuse the active map provider, so the excavation has the same imagery and attribution.
export async function portalImagery(provider: ImageryProvider, frame: Matrix4) {
  const scheme = provider.tilingScheme, level = Math.min(17,provider.maximumLevel ?? 17)
  const cartographic = (x:number,y:number) => Cartographic.fromCartesian(Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,0),new Cartesian3()))
  const corners=[cartographic(-240,-180),cartographic(320,180)]
  const tiles=corners.map(p=>scheme.positionToTileXY(p,level)!)
  const minX=Math.min(...tiles.map(p=>p.x)),maxX=Math.max(...tiles.map(p=>p.x))
  const minY=Math.min(...tiles.map(p=>p.y)),maxY=Math.max(...tiles.map(p=>p.y))
  const canvas=document.createElement('canvas'),width=provider.tileWidth,height=provider.tileHeight
  canvas.width=(maxX-minX+1)*width;canvas.height=(maxY-minY+1)*height
  const ctx=canvas.getContext('2d')!
  await Promise.all(Array.from({length:maxY-minY+1},(_,row)=>Array.from({length:maxX-minX+1},async(_,column)=>{
    const image=await provider.requestImage(minX+column,minY+row,level,new Request({throttle:false}))
    if(!image)throw new Error('洞口影像加载失败')
    ctx.drawImage(image as CanvasImageSource,column*width,row*height,width,height)
  })).flat())
  const nw=scheme.tileXYToNativeRectangle(minX,minY,level),se=scheme.tileXYToNativeRectangle(maxX,maxY,level)
  const uv=(point:Cartographic)=>{
    const projected=scheme.projection.project(point)
    return [(projected.x-nw.west)/(se.east-nw.west),(projected.y-se.south)/(nw.north-se.south)]
  }
  const origin=uv(cartographic(0,0)),east=uv(cartographic(100,0)),north=uv(cartographic(0,100))
  return {image:canvas.toDataURL('image/jpeg',.95),uv,
    u:new Cartesian3((east[0]!-origin[0]!)/100,(north[0]!-origin[0]!)/100,origin[0]!),
    v:new Cartesian3((east[1]!-origin[1]!)/100,(north[1]!-origin[1]!)/100,origin[1]!),
  }
}
