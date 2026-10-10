"use client";
import { useEffect } from "react";
import "./magnetic-cursor.css";

export const CURSOR_CONFIG = {
  size: 14,
  padding: 3,
  attractionDistance: 8,
  trackingMs: 28,
  morphMs: 85,
  pulseMs: 220,
} as const;
const INTERACTIVE = 'a[href],button,[role="button"],[role="link"],[data-cursor="interactive"],summary';
const NATIVE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),iframe';
const TEXT = 'p,h1,h2,h3,h4,h5,h6,li,td,th,label,blockquote,pre,code,span';

/** One visual overlay; no React renders on pointer or animation frames.
 * Button transforms are left untouched. Magnetism attracts only the cursor.
 */
export function GlobalMagneticCursor() {
  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const overlay = document.createElement("div");
    overlay.className = "tg-magnetic-cursor";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
    let pointer = { x: 0, y: 0 }, present = false, native = true;
    let target: HTMLElement | null = null, frame = 0, dirty = true, last = 0, scrollUntil = 0, pulse = 0;
    let geometry = { x: 0, y: 0, width: CURSOR_CONFIG.size as number, height: CURSOR_CONFIG.size as number, radii: [7,7,7,7] };
    let current = { ...geometry, radii: [...geometry.radii] }, initialized = false, hoverBlend = 0;
    let animations: Animation[] = [];
    let nearby: HTMLElement[] = [], nextScan = 0;
    const html = document.documentElement;
    const resizeObserver = new ResizeObserver(() => { dirty = true; schedule(); });
    const targetAnimations = () => {
      const running: Animation[] = [];
      for (let element = target; element; element = element.parentElement) running.push(...element.getAnimations());
      return running;
    };
    const targetObserver = new MutationObserver(() => {
      dirty=true; scrollUntil=performance.now()+400; animations=targetAnimations(); schedule();
    });
    const hide = () => {
      html.removeAttribute("data-tg-cursor-active");
      overlay.style.opacity = "0";
      cancelAnimationFrame(frame); frame = 0; last = 0;
    };
    const switchTarget = (next: HTMLElement | null) => {
      if (target === next) return;
      if (target) resizeObserver.unobserve(target);
      targetObserver.disconnect();
      target = next; dirty = true;
      animations = targetAnimations();
      if (target) {
        resizeObserver.observe(target);
        // Ancestor transforms and scene visibility can move a stationary hover target.
        for (let element: HTMLElement | null = target; element; element = element.parentElement) {
          targetObserver.observe(element,{attributes:true,attributeFilter:["class","style","hidden","inert","aria-hidden"]});
        }
      }
    };
    const eligible = (element: HTMLElement | null) => !!element && element.isConnected && !element.closest('[inert],[disabled],[aria-disabled="true"],[data-cursor="none"],[data-cursor="default"]') && element.getClientRects().length > 0;
    const detect = (time: number) => {
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      if (!hit) { native = true; switchTarget(null); return; }
      const override = hit.closest('[data-cursor="none"],[data-cursor="default"]');
      if (override) { native = override.getAttribute("data-cursor") === "none"; switchTarget(null); return; }
      if (hit.closest(NATIVE)) { native = true; switchTarget(null); return; }
      let next = hit.closest<HTMLElement>(INTERACTIVE);
      if (!eligible(next)) next = null;
      native = !next && !!hit.closest(TEXT) && getComputedStyle(hit).userSelect !== "none";
      // Small attraction zone, refreshed only as the pointer moves. No button displacement.
      if (!next && !native && media.matches) {
        if (time >= nextScan) {
          const scope = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter(dialog => dialog.matches(':modal')).at(-1) ?? document;
          nearby = Array.from(scope.querySelectorAll<HTMLElement>(INTERACTIVE));
          nextScan = time + 120;
        }
        let best: number = CURSOR_CONFIG.attractionDistance;
        for (const candidate of nearby) {
          if (!eligible(candidate)) continue;
          const rect = candidate.getBoundingClientRect();
          const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
          const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
          const distance = Math.hypot(dx,dy);
          if (distance < best) { best = distance; next = candidate; }
        }
      }
      switchTarget(next);
    };
    const updateGeometry = () => {
      if (target && eligible(target)) {
        const rect = target.getBoundingClientRect();
        const padding = CURSOR_CONFIG.padding;
        const style = getComputedStyle(target);
        const limit = Math.min(rect.width,rect.height)/2;
        const radius = (value: string) => value.includes("%") ? limit * parseFloat(value)/50 : Math.min(limit,parseFloat(value)||0);
        geometry = { x: rect.left-padding, y: rect.top-padding, width: rect.width+padding*2, height: rect.height+padding*2,
          radii: [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(value=>radius(value)+padding) };
      } else {
        switchTarget(null);
        geometry = { x:pointer.x-CURSOR_CONFIG.size/2,y:pointer.y-CURSOR_CONFIG.size/2,width:CURSOR_CONFIG.size,height:CURSOR_CONFIG.size,radii:[7,7,7,7] };
      }
      dirty = false;
    };
    const tick = (time: number) => {
      frame = 0;
      if (!media.matches || !present || document.hidden || native) { hide(); return; }
      const dt = Math.min(48,last ? time-last : 16); last = time;
      const moving = time < scrollUntil || animations.some(animation=>animation.playState === "running");
      if (moving) { detect(time); dirty = true; }
      if (native) { hide(); return; }
      if (dirty || !target) updateGeometry();
      const position = 1-Math.exp(-dt/(target ? CURSOR_CONFIG.morphMs : CURSOR_CONFIG.trackingMs));
      const shape = 1-Math.exp(-dt/CURSOR_CONFIG.morphMs);
      if (!initialized) { current = { ...geometry, radii:[...geometry.radii] }; initialized = true; }
      current.x += (geometry.x-current.x)*position; current.y += (geometry.y-current.y)*position;
      current.width += (geometry.width-current.width)*shape; current.height += (geometry.height-current.height)*shape;
      current.radii = current.radii.map((radius,i)=>radius+(geometry.radii[i]-radius)*shape);
      hoverBlend += ((target ? 1 : 0)-hoverBlend)*shape;
      pulse *= Math.exp(-dt/(CURSOR_CONFIG.pulseMs/3));
      overlay.style.transform = `translate3d(${current.x}px,${current.y}px,0)`;
      overlay.style.width = `${current.width}px`; overlay.style.height = `${current.height}px`;
      overlay.style.borderRadius = current.radii.map(radius=>`${radius}px`).join(" ");
      overlay.style.setProperty("--cursor-fill",String((1-hoverBlend)*.8));
      overlay.style.setProperty("--cursor-glow",String(.12+hoverBlend*.1+pulse*.14));
      overlay.style.opacity = "1";
      html.setAttribute("data-tg-cursor-active", "true");
      const unsettled = Math.abs(current.x-geometry.x)+Math.abs(current.y-geometry.y)+Math.abs(current.width-geometry.width)+Math.abs(current.height-geometry.height)+Math.abs(hoverBlend-(target?1:0))*10;
      if (unsettled>.08 || moving || pulse>.005) schedule();
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(tick); }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !media.matches) { present=false; hide(); return; }
      present=true; pointer={x:event.clientX,y:event.clientY}; dirty=true;
      detect(performance.now());
      if (native) hide(); else schedule();
    };
    const leave = () => { present=false; initialized=false; switchTarget(null); hide(); };
    const scroll = () => { if (!present) return; dirty=true;scrollUntil=performance.now()+180;nextScan=0;detect(performance.now());schedule(); };
    const press = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && target && !native) { pulse=1;dirty=true;scrollUntil=performance.now()+400;schedule(); }
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Tab") { present=false;hide(); } };
    const mediaChange = () => { if (!media.matches) leave(); };
    const visibility = () => { if (document.hidden) leave(); };
    const placeAboveModal = () => {
      const modal = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter(dialog=>dialog.matches(':modal')).at(-1);
      const parent = modal ?? document.body;
      if (overlay.parentElement !== parent) parent.appendChild(overlay);
      nextScan=0;dirty=true;
      if (present) { detect(performance.now());schedule(); }
    };
    const mutationObserver = new MutationObserver(placeAboveModal);
    mutationObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open","disabled","aria-disabled","data-cursor"]});
    document.addEventListener("pointermove",move,{passive:true});document.addEventListener("pointerdown",press,{passive:true});document.addEventListener("pointerleave",leave);
    document.addEventListener("scroll",scroll,{passive:true,capture:true});document.addEventListener("keydown",keyboard);
    window.addEventListener("blur",leave);window.addEventListener("resize",scroll);document.addEventListener("visibilitychange",visibility);media.addEventListener("change",mediaChange);
    return () => {
      hide();resizeObserver.disconnect();targetObserver.disconnect();mutationObserver.disconnect();overlay.remove();
      document.removeEventListener("pointermove",move);document.removeEventListener("pointerdown",press);document.removeEventListener("pointerleave",leave);
      document.removeEventListener("scroll",scroll,true);document.removeEventListener("keydown",keyboard);window.removeEventListener("blur",leave);window.removeEventListener("resize",scroll);document.removeEventListener("visibilitychange",visibility);media.removeEventListener("change",mediaChange);
    };
  },[]);
  return null;
}


