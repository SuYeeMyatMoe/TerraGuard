"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import "./pointer-effects.css";

const COLORS = ["#925e06", "#8da432", "#b18a42", "#365004", "#c5b66f"];
const MAX_PARTICLES = 3200;
type Particle = { x:number; y:number; ox:number; oy:number; vx:number; vy:number; age:number; life:number; size:number; alpha:number; color:string; seed:number; kind:"trail"|"cap"|"stem" };
type Wake = { x:number; y:number; strength:number; age:number };

/** Original local dust simulation, inspired by the supplied motion reference. */
export function TerraDustCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pathname !== "/") return;
    const context = canvas.getContext("2d", { alpha:true });
    if (!context) return;
    const media = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let particles:Particle[] = [], wakes:Wake[] = [];
    let frame=0, last=0, previous:{x:number;y:number;time:number}|null=null;
    let width=innerWidth, height=innerHeight;
    const clear = () => {
      cancelAnimationFrame(frame);frame=0;last=0;previous=null;particles=[];wakes=[];
      context.clearRect(0,0,width,height);
    };
    const resize = () => {
      clear();width=innerWidth;height=innerHeight;
      const dpr=Math.min(devicePixelRatio,1.5);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      context.setTransform(dpr,0,0,dpr,0,0);
    };
    const add = (x:number,y:number,vx:number,vy:number,kind:Particle["kind"]="trail") => {
      const seed=Math.random();
      particles.push({x,y,ox:x,oy:y,vx,vy,age:0,life:1.4+Math.random()*.8,size:.45+Math.random()*.75,alpha:.25+Math.random()*.3,color:COLORS[Math.floor(Math.random()*COLORS.length)],seed,kind});
    };
    const tick = (time:number) => {
      frame=0;
      if (!media.matches || document.hidden) {clear();return;}
      const dt=Math.min(.034,(last ? time-last : 16)/1000);last=time;
      context.clearRect(0,0,width,height);
      wakes=wakes.filter(wake => (wake.age+=dt)<.85);
      particles=particles.filter(p => (p.age+=dt)<p.life);
      for (const p of particles) {
        if (p.kind==="cap") {
          const expansion=1-Math.exp(-p.age*4);
          const angle=p.seed*Math.PI*2+p.age*.9;
          p.x=p.ox+Math.cos(angle)*p.vx*expansion;
          p.y=p.oy-30*expansion-p.age*38+Math.sin(angle)*p.vy*expansion;
        } else if(p.kind==="stem") {
          p.x=p.ox+Math.sin(p.age*4+p.seed*6)*p.vx*(1+p.age);
          p.y=p.oy-p.age*p.vy;
        } else {
          // Local curling wake advects grains; no viewport-sized fluid buffers.
          for(const wake of wakes) {
            const dx=p.x-wake.x,dy=p.y-wake.y,distance=Math.hypot(dx,dy);
            if(distance>75) continue;
            const force=(1-distance/75)*(1-wake.age/.85)*wake.strength;
            p.vx+=(-dy/Math.max(distance,5))*force*dt;
            p.vy+=(dx/Math.max(distance,5))*force*dt;
          }
          p.vx+=Math.sin(p.y*.035+p.seed*8+p.age)*9*dt;
          p.vy+=Math.cos(p.x*.028+p.seed*8+p.age)*8*dt;
          const damping=Math.exp(-dt*1.6);p.vx*=damping;p.vy*=damping;
          p.x+=p.vx*dt;p.y+=p.vy*dt-dt*7;
        }
        const fade=Math.pow(1-p.age/p.life,1.4)*Math.min(1,p.age/.06);
        context.globalAlpha=p.alpha*fade;context.fillStyle=p.color;
        context.beginPath();context.arc(p.x,p.y,p.size,0,Math.PI*2);context.fill();
      }
      context.globalAlpha=1;
      if(particles.length) frame=requestAnimationFrame(tick);else last=0;
    };
    const schedule = () => {if(!frame)frame=requestAnimationFrame(tick);};
    const allowed = (event:PointerEvent) => media.matches && event.pointerType==="mouse" && !document.querySelector("dialog[open]") && !(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-cursor="none"]'));
    const trim = () => {if(particles.length>MAX_PARTICLES)particles.splice(0,particles.length-MAX_PARTICLES);};
    const move = (event:PointerEvent) => {
      if(!allowed(event)){previous=null;return;}
      const x=event.clientX,y=event.clientY,time=performance.now();
      if(!previous || time-previous.time>160){previous={x,y,time};return;}
      const dx=x-previous.x,dy=y-previous.y,distance=Math.hypot(dx,dy);
      if(distance<2)return;
      const steps=Math.min(35,Math.ceil(distance/3));
      const nx=-dy/Math.max(distance,1),ny=dx/Math.max(distance,1);
      for(let i=0;i<steps;i++)for(let j=0;j<12;j++) {
        const t=(i+Math.random())/steps,spread=(Math.random()-.5)*36;
        add(previous.x+dx*t+nx*spread,previous.y+dy*t+ny*spread,-dx*.25+nx*(Math.random()-.5)*35,-dy*.25+ny*(Math.random()-.5)*35);
      }
      wakes.push({x,y,strength:Math.min(distance*2,110)*(wakes.length%2 ? 1:-1),age:0});
      if(wakes.length>8)wakes.shift();
      previous={x,y,time};trim();schedule();
    };
    const press = (event:PointerEvent) => {
      if(!allowed(event) || event.button!==0)return;
      for(let i=0;i<420;i++)add(event.clientX+(Math.random()-.5)*8,event.clientY+(Math.random()-.5)*12,22+Math.random()*29,5+Math.random()*10,"cap");
      for(let i=0;i<180;i++)add(event.clientX+(Math.random()-.5)*12,event.clientY+Math.random()*12,2+Math.random()*4,48+Math.random()*55,"stem");
      trim();schedule();
    };
    const leave = () => {previous=null;};
    const motionChange = () => {if(!media.matches)clear();};
    const keyboard = (event:KeyboardEvent) => {if(event.key==="Tab")clear();};
    resize();
    document.addEventListener("pointermove",move,{passive:true});document.addEventListener("pointerdown",press,{passive:true});
    document.addEventListener("pointerleave",leave);document.addEventListener("keydown",keyboard);document.addEventListener("visibilitychange",clear);
    window.addEventListener("blur",clear);window.addEventListener("resize",resize);media.addEventListener("change",motionChange);
    return () => {
      clear();document.removeEventListener("pointermove",move);document.removeEventListener("pointerdown",press);
      document.removeEventListener("pointerleave",leave);document.removeEventListener("keydown",keyboard);document.removeEventListener("visibilitychange",clear);
      window.removeEventListener("blur",clear);window.removeEventListener("resize",resize);media.removeEventListener("change",motionChange);
    };
  },[pathname]);
  return pathname==="/" ? <canvas ref={canvasRef} className="terra-dust-cursor" aria-hidden="true"/> : null;
}
