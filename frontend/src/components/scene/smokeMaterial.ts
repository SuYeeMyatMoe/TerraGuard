import { DataTexture, DoubleSide, InstancedBufferAttribute, LinearFilter, PlaneGeometry, ShaderMaterial } from "three";

/** A small local cloud texture, generated once; no noise work in each frame. */
export function createSmokeVisuals() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const smooth = (x: number) => { const t=Math.max(0,Math.min(1,x)); return t*t*(3-2*t); };
  const hash = (x: number, y: number) => { const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); };
  const noise = (x: number, y: number) => {
    const ix=Math.floor(x), iy=Math.floor(y), fx=smooth(x-ix), fy=smooth(y-iy);
    const a=hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx;
    const b=hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx;
    return a*(1-fy)+b*fy;
  };
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const u=x/(size-1)*2-1, v=y/(size-1)*2-1;
    const detail=noise(u*3+7,v*3+9)*.55+noise(u*7+13,v*7+17)*.3+noise(u*15+19,v*15+23)*.15;
    const lobe=Math.max(
      1-Math.hypot((u+.23)/.66,(v-.1)/.68),
      1-Math.hypot((u-.27)/.65,(v+.08)/.63),
      1-Math.hypot((u+.05)/.55,(v-.37)/.55),
      1-Math.hypot((u-.02)/.57,(v+.35)/.57),
    );
    const alpha=smooth((lobe*(.55+detail*.8)-.015)/.5);
    const i=(y*size+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=Math.round((.3+detail*.7)*255);
    pixels[i+3]=Math.round(alpha*255);
  }
  const texture = new DataTexture(pixels,size,size);
  texture.minFilter=texture.magFilter=LinearFilter;
  texture.needsUpdate=true;
  const geometry = new PlaneGeometry(1,1);
  const opacity = new InstancedBufferAttribute(new Float32Array(1200),1);
  geometry.setAttribute("puffOpacity",opacity);
  const material = new ShaderMaterial({
    transparent:true, depthWrite:false, side:DoubleSide, toneMapped:false,
    uniforms:{cloud:{value:texture}},
    vertexShader:`
      attribute float puffOpacity;
      varying vec2 vUv;
      varying float vOpacity;
      void main() {
        vUv=uv; vOpacity=puffOpacity;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        vec2 extent=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        center.xy+=position.xy*extent;
        gl_Position=projectionMatrix*center;
      }`,
    fragmentShader:`
      uniform sampler2D cloud;
      varying vec2 vUv;
      varying float vOpacity;
      void main() {
        vec4 puff=texture2D(cloud,vUv);
        float alpha=puff.a*vOpacity;
        if(alpha<0.003) discard;
        vec3 color=mix(vec3(0.075,0.085,0.078),vec3(0.40,0.43,0.40),puff.r);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`,
  });
  return {geometry,material,opacity,texture};
}
