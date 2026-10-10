"use client";
import { useEffect } from "react";
import "./pointer-effects.css";

/** Magnify the decorative background only; keep the normal browser pointer. */
export function BackgroundPointerEffect() {
  useEffect(() => {
    const media = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0, last = 0, initialized = false;
    let x = 0, y = 0, targetX = 0, targetY = 0;
    let lenses: HTMLElement[] = [];
    const hide = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0; initialized = false;
      lenses.forEach(lens => lens.style.setProperty("--lens-visible", "0"));
    };
    const tick = (time: number) => {
      frame = 0;
      if (!media.matches || document.hidden) { hide(); return; }
      const blend = 1 - Math.exp(-Math.min(48, last ? time - last : 16) / 30);
      last = time;
      x += (targetX - x) * blend; y += (targetY - y) * blend;
      for (const lens of lenses) {
        const rect = lens.getBoundingClientRect();
        const localX = x - rect.left, localY = y - rect.top;
        lens.style.setProperty("--lens-x", `${localX}px`);
        lens.style.setProperty("--lens-y", `${localY}px`);
        // Anchor the enlarged pattern at the pointer: 12px dots become 20.4px dots.
        lens.style.setProperty("--lens-pattern-x", `${localX * -.7}px`);
        lens.style.setProperty("--lens-pattern-y", `${localY * -.7}px`);
        lens.style.setProperty("--lens-visible", "1");
      }
      if (Math.abs(x - targetX) + Math.abs(y - targetY) > .1) frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !media.matches || document.querySelector("dialog[open]")) { hide(); return; }
      lenses = Array.from(document.querySelectorAll<HTMLElement>("[data-background-lens]"));
      targetX = event.clientX; targetY = event.clientY;
      if (!initialized) { x = targetX; y = targetY; initialized = true; }
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Tab") hide(); };
    const refresh = () => { if (initialized && !frame) frame = requestAnimationFrame(tick); };
    const changed = () => { if (!media.matches) hide(); };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", hide);
    document.addEventListener("keydown", keyboard);
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("scroll", refresh, { passive: true, capture: true });
    window.addEventListener("blur", hide);
    window.addEventListener("resize", refresh);
    media.addEventListener("change", changed);
    return () => {
      hide();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", hide);
      document.removeEventListener("keydown", keyboard);
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("scroll", refresh, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", refresh);
      media.removeEventListener("change", changed);
    };
  }, []);
  return null;
}
