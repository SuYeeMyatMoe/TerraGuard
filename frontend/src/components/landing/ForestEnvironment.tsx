"use client";
import { useEffect, useRef, type RefObject } from "react";
import { ramp, sceneAt } from "./story";
import styles from "./cinematic.module.css";

/** Matched camera framing across a single generated forest-state sheet.
 * The renderer uses cached strips and a small, bounded particle field.
 */
export function ForestEnvironment({ progress }: { progress: RefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d", { alpha: true });
    if (!ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, frame = 0, visible = true, last = 0;
    const image = new Image();
    let layers: HTMLCanvasElement[] = [];
    const makeLayers = () => {
      if (!image.complete || !image.naturalWidth || !width || !height) return;
      // Strip boundaries follow the ground baselines in the generated sheet.
      const strips = [[0, 348], [348, 343], [691, 333]];
      layers = strips.map(([y,h]) => {
        const layer = document.createElement("canvas");
        layer.width=width; layer.height=height;
        const c=layer.getContext("2d")!;
        c.drawImage(image,0,y,image.naturalWidth,h,0,0,width,height);
        // Organic canopy detail remains visible while the backdrop dissolves into the page.
        c.globalCompositeOperation="destination-in";
        const fade=c.createLinearGradient(0,0,0,height);
        fade.addColorStop(0,"transparent");fade.addColorStop(.16,"#0002");fade.addColorStop(.44,"#000");fade.addColorStop(1,"#000");
        c.fillStyle=fade;c.fillRect(0,0,width,height);
        return layer;
      });
    };
    const paint = (time: number) => {
      if (!width || !height || layers.length !== 3) return;
      const p=progress.current;
      const { fire, smoke } = sceneAt(p);
      const ignition=ramp(p,.2,.58), aftermath=ramp(p,.76,.96);
      ctx.clearRect(0,0,width,height);
      ctx.globalAlpha=(1-ignition)*(1-aftermath);ctx.drawImage(layers[0],0,0);
      ctx.globalAlpha=ignition*(1-aftermath);ctx.drawImage(layers[1],0,0);
      ctx.globalAlpha=aftermath;ctx.drawImage(layers[2],0,0);
      ctx.globalAlpha=1;
      if(fire>.001 && !motion.matches) {
        // Fire itself comes from the photographed-style scene; only light and embers animate.
        ctx.globalCompositeOperation="screen";
        const light=ctx.createRadialGradient(width*.5,height*.9,0,width*.5,height*.9,width*.55);
        light.addColorStop(0,`rgba(235,136,40,${fire*(.065+Math.sin(time*.003)*.012)})`);light.addColorStop(1,"transparent");
        ctx.fillStyle=light;ctx.fillRect(0,height*.4,width,height*.6);
        ctx.globalCompositeOperation="source-over";
        const count=width<800?12:24;
        for(let i=0;i<count;i++) {
          const phase=(time*.00006*(.6+(i%5)*.16)+i*.618)%1;
          ctx.globalAlpha=fire*Math.sin(phase*Math.PI)*.7;
          ctx.fillStyle=i%3?"#ffc778":"#ede383";
          ctx.beginPath();ctx.ellipse(((i*.754)%1)*width+Math.sin(phase*7+i)*16,height*.92-phase*height*.65,1+(i%2)*.5,1.8,phase,0,Math.PI*2);ctx.fill();
        }
        ctx.globalAlpha=1;
      }
      if(smoke>.001 && !motion.matches) {
        for(let i=0;i<5;i++) {
          const phase=(time*.000025+i*.2)%1;
          const x=((i*.37)%1)*width+Math.sin(phase*5+i)*30;
          const y=height*.8-phase*height*.4, radius=height*(.14+phase*.14);
          const fog=ctx.createRadialGradient(x,y,0,x,y,radius);
          fog.addColorStop(0,`rgba(112,96,74,${smoke*.1*Math.sin(phase*Math.PI)})`);fog.addColorStop(1,"rgba(112,96,74,0)");
          ctx.fillStyle=fog;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
        }
      }
    };
    const resize = () => {
      const bounds=element.getBoundingClientRect();
      const ratio=Math.min(window.devicePixelRatio||1,1.5);
      width=Math.round(bounds.width*ratio);height=Math.round(bounds.height*ratio);
      element.width=width;element.height=height;makeLayers();paint(0);
    };
    const tick=(time: number) => {
      const scene=element.closest("section");
      const ambientActive=scene?.dataset.ambient !== "false";
      if(visible && ambientActive && !document.hidden && time-last>33) {paint(time);last=time;}
      if(visible && !motion.matches)frame=requestAnimationFrame(tick);
    };
    const observeMotion=()=>{cancelAnimationFrame(frame);paint(0);if(visible && !motion.matches)frame=requestAnimationFrame(tick);};
    image.onload=()=>{makeLayers();paint(0);};
    image.src="/forest/lifecycle.png";
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;observeMotion();});observer.observe(element);
    const resizer=new ResizeObserver(resize);resizer.observe(element);
    motion.addEventListener("change",observeMotion);
    resize();
    return () => {cancelAnimationFrame(frame);observer.disconnect();resizer.disconnect();motion.removeEventListener("change",observeMotion);image.onload=null;};
  }, [progress]);
  return <canvas ref={canvas} className={styles.forest} aria-hidden="true"/>;
}


