export const STORY_TIMING = {
  scrollScreens: 4.4,
  firstFade: [.23, .43],
  secondFade: [.6, .8],
  chapterStops: [0, .5, .9],
  incomingOffset: 34,
} as const;
export const CHAPTERS = [
  { label: "Life", title: ["One team. Multiple threats.", "Make the better decision."], description: "TerraGuard brings satellite intelligence and response simulation together to help forest coordinators decide where their attention can make a difference.", note: "A world in balance. A thousand shades of green. A future still worth protecting." },
  { label: "Fire", title: ["A hotspot is not", "a decision."], description: "Three incidents. One available team. When a landscape ignites, every moment matters. See the threat before it becomes the aftermath.", note: "One spark. Everything changes. Detection is the beginning. The next decision matters." },
  { label: "Ash", title: ["What", "remains."], description: "The flames disappear. Their impact stays. Better decisions today can protect what lives tomorrow.", note: "Predict the threat. Test the response. Protect the forest." },
] as const;
export const CAPABILITIES = [
  { title: "Predict the threat.", body: "Understand which satellite-observed hotspots are more likely to be followed by another detection within 48 hours, with uncertainty and evidence in view." },
  { title: "Test the response.", body: "Explore a hypothetical 3D forest. Compare response strategies under identical conditions before allocating your limited field teams." },
  { title: "Protect the forest.", body: "Turn evidence into a considered response, with transparent priorities, verified AI briefings, and a person approving every decision." },
] as const;
export const STEPS = [
  ["Observe", "NASA FIRMS VIIRS hotspots and historical weather."],
  ["Predict", "48-hour follow-up activity, with evidence quality."],
  ["Explore", "Wind, dryness, ignition and response delay in 3D."],
  ["Compare", "First-alert and AI-priority under the same conditions."],
  ["Act", "Inspect, recheck or dismiss, with an audit trail."],
] as const;
export const TECHNOLOGY = ["NASA FIRMS VIIRS", "Open-Meteo", "Random Forest", "Cellular automaton", "React Three Fiber", "OpenAI", "Grafilab"];
export const EVIDENCE_NOTE = "The 48-hour model predicts satellite-observed follow-up activity, not fire spread or damage. The 3D simulation explores hypothetical scenarios. Language models explain verified outputs; a person approves every action. The homepage forest is an artistic narrative, not a forecast.";
export const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const ramp = (p: number, a: number, b: number) => { const t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); };
export function sceneAt(p: number) {
  return { burn: ramp(p, .23, .94), fire: ramp(p, .3, .58) * (1 - ramp(p, .77, .96)), smoke: ramp(p, .2, .6) * (1 - ramp(p, .79, 1)), chapter: p < .32 ? 0 : p < .83 ? 1 : 2 };
}

