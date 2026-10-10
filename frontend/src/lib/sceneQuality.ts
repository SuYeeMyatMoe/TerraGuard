export type QualityMode = "auto" | "economy" | "balanced" | "high";
export type QualityLevel = 0 | 1 | 2;
export interface QualityObservation {
  level: QualityLevel;
  slowSeconds: number;
  fastSeconds: number;
}

const profiles = {
  economy: { dpr: 1, shadowSize: 1024, treeShadows: false, treeDetail: "low", flamesPerCell: 1, smokePerCell: 1, waterDrops: 48 },
  balanced: { dpr: 1.5, shadowSize: 1024, treeShadows: true, treeDetail: "full", flamesPerCell: 2, smokePerCell: 2, waterDrops: 96 },
  high: { dpr: 1.75, shadowSize: 2048, treeShadows: true, treeDetail: "full", flamesPerCell: 3, smokePerCell: 3, waterDrops: 144 },
} as const;
export const qualityModes = ["economy", "balanced", "high"] as const;

export function getSceneQuality(mode: Exclude<QualityMode, "auto">, deviceRatio: number) {
  const profile = profiles[mode];
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  return { ...profile, dpr: Math.min(ratio, profile.dpr) };
}
export type SceneQualitySettings = ReturnType<typeof getSceneQuality>;

/** Only feed intervals that actually rendered; demand-mode idle is not a sample. */
export function adaptSceneQuality(state: QualityObservation, fps: number, seconds: number): QualityObservation {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(seconds) || seconds <= 0)
    return { level: state.level, slowSeconds: 0, fastSeconds: 0 };
  const slowSeconds = fps < 45 ? state.slowSeconds + seconds : 0;
  const fastSeconds = fps >= 58 ? state.fastSeconds + seconds : 0;
  if (slowSeconds >= 3 && state.level > 0)
    return { level: (state.level - 1) as QualityLevel, slowSeconds: 0, fastSeconds: 0 };
  if (fastSeconds >= 10 && state.level < 2)
    return { level: (state.level + 1) as QualityLevel, slowSeconds: 0, fastSeconds: 0 };
  return { level: state.level, slowSeconds: Math.min(slowSeconds, 3), fastSeconds: Math.min(fastSeconds, 10) };
}
