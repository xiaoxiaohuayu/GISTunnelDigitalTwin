import { PostProcessStage, PostProcessStageComposite } from 'cesium'
import type { Viewer } from 'cesium'

// Only the soft occlusion mask is half size; scene color and final output stay native resolution.
export function addTunnelContactOcclusion(viewer:Viewer):PostProcessStageComposite {
  const noise=document.createElement('canvas');noise.width=noise.height=256
  const context=noise.getContext('2d')!,pixels=context.createImageData(256,256)
  for(let i=0;i<256*256;i++){
    const value=(Math.imul(i+1,1103515245)>>>16)&255
    pixels.data.set([value,value,value,255],i*4)
  }
  context.putImageData(pixels,0,0)
  const generator=viewer.scene.postProcessStages.ambientOcclusion.get(0) as PostProcessStage
  const mask=new PostProcessStage({name:'tunnel-contact-mask',textureScale:.5,
    fragmentShader:generator.fragmentShader,
    uniforms:{intensity:1.2,bias:.1,lengthCap:.35,directionCount:4,stepCount:8,randomTexture:noise}})
  const composite=new PostProcessStage({name:'tunnel-contact-composite',uniforms:{occlusionTexture:mask.name},fragmentShader:`
uniform sampler2D colorTexture;
uniform sampler2D occlusionTexture;
in vec2 v_textureCoordinates;
void main() {
  vec2 offset = 0.5/vec2(textureSize(occlusionTexture,0));
  float ao = (texture(occlusionTexture,v_textureCoordinates+offset).r
    +texture(occlusionTexture,v_textureCoordinates-offset).r
    +texture(occlusionTexture,v_textureCoordinates+vec2(offset.x,-offset.y)).r
    +texture(occlusionTexture,v_textureCoordinates+vec2(-offset.x,offset.y)).r)*0.25;
  vec4 color = texture(colorTexture,v_textureCoordinates);
  out_FragColor = vec4(color.rgb*ao,color.a);
}`})
  const stage=new PostProcessStageComposite({name:'tunnel-contact-occlusion',stages:[mask,composite],inputPreviousStageTexture:false,uniforms:mask.uniforms})
  stage.enabled=false
  viewer.scene.postProcessStages.add(stage)
  return stage
}
