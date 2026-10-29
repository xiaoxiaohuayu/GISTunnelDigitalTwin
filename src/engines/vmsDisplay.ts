export interface VmsDisplay {
  width: number
  height: number
  enabled: boolean
  color: string
  fontSize: number
  font: 'sans' | 'serif' | 'kai'
  align: 'left' | 'center' | 'right'
  vertical: 'top' | 'middle' | 'bottom'
  scroll: 'none' | 'left' | 'right' | 'up' | 'down'
  speed: number
  dots: boolean
}
export const defaultVmsDisplay: VmsDisplay = {
  width:6.6,height:.88,enabled:true,color:'#ffb000',fontSize:56,font:'sans',align:'center',vertical:'middle',scroll:'none',speed:60,dots:false,
}
export const vmsWidth=768,vmsHeight=102
export function vmsSize(display:VmsDisplay) {
  return {width:Math.round(vmsWidth*display.width/6.6),height:Math.round(vmsHeight*display.height/.88)}
}
export const vmsFonts = {
  sans:'"PingFang SC", "Microsoft YaHei", sans-serif',
  serif:'"Songti SC", SimSun, serif',
  kai:'"Kaiti SC", KaiTi, monospace',
}
export function vmsOffset(display:VmsDisplay,width:number,height:number,seconds:number):{x:number;y:number} {
  const size=vmsSize(display)
  const horizontal=display.scroll==='left'||display.scroll==='right'
  const vertical=display.scroll==='up'||display.scroll==='down'
  const distance=seconds*display.speed
  return {
    x:horizontal ? (display.scroll==='left' ? size.width-distance%(size.width+width) : -width+distance%(size.width+width)) : 0,
    y:vertical ? (display.scroll==='up' ? size.height-distance%(size.height+height) : -height+distance%(size.height+height)) : 0,
  }
}
// One text texture is reused by every board in the same bore. Motion only changes shader uniforms.
export function createVmsText(text:string,display:VmsDisplay):HTMLCanvasElement {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!
  const font=`bold ${display.fontSize}px ${vmsFonts[display.font]}`
  ctx.font=font
  const size=vmsSize(display)
  const horizontal=display.scroll==='left'||display.scroll==='right'
  const lines:string[]=[]
  for(const paragraph of text.split('\n')) {
    let line=''
    for(const character of paragraph) {
      if(!horizontal && line && ctx.measureText(line+character).width>size.width-24){lines.push(line);line=''}
      line+=character
    }
    lines.push(line)
  }
  const lineHeight=display.fontSize*1.2
  canvas.width=horizontal?Math.max(size.width,Math.ceil(Math.max(...lines.map(line=>ctx.measureText(line).width)))+24):size.width
  canvas.height=Math.max(size.height,Math.ceil(lines.length*lineHeight)+8)
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height)
  if(!display.enabled)return canvas
  ctx.font=font;ctx.fillStyle=display.color;ctx.textAlign=display.align;ctx.textBaseline='middle'
  const x=display.align==='left'?12:display.align==='right'?canvas.width-12:canvas.width/2
  const blockHeight=lines.length*lineHeight
  const top=display.vertical==='top'?4:display.vertical==='bottom'?canvas.height-blockHeight-4:(canvas.height-blockHeight)/2
  lines.forEach((line,index)=>ctx.fillText(line,x,top+(index+.5)*lineHeight))
  return canvas
}
export function drawVmsPreview(canvas:HTMLCanvasElement,text:HTMLCanvasElement,display:VmsDisplay,seconds:number):void {
  const size=vmsSize(display)
  const ctx=canvas.getContext('2d')!,offset=vmsOffset(display,text.width,text.height,seconds)
  ctx.fillStyle='#000';ctx.fillRect(0,0,size.width,size.height)
  ctx.drawImage(text,offset.x,offset.y)
  if(display.dots) {
    const pixels=ctx.getImageData(0,0,size.width,size.height)
    ctx.fillStyle='#000';ctx.fillRect(0,0,size.width,size.height)
    for(let y=2;y<size.height;y+=4)for(let x=2;x<size.width;x+=4) {
      const i=(y*size.width+x)*4
      if(!pixels.data[i]&&!pixels.data[i+1]&&!pixels.data[i+2])continue
      ctx.fillStyle=`rgb(${pixels.data[i]} ${pixels.data[i+1]} ${pixels.data[i+2]})`
      ctx.beginPath();ctx.arc(x,y,1.55,0,Math.PI*2);ctx.fill()
    }
  }
}
