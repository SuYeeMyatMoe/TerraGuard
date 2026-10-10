export const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const utc = (iso: string, withDate = true) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return withDate ? `${date} · ${time} UTC` : `${time} UTC`;
};

export const coords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;

export const compass = (deg: number | null | undefined) => {
  if (deg == null) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
};

export const shortId = (id: string) => id.replace(/^INC-\d{8}-/, "Incident ");

export const REC_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  INSPECT: { label: "Inspect", cls: "bg-[var(--fire-50)] text-[var(--fire-700)] ring-[var(--fire-200)]", dot: "bg-[var(--fire)]" },
  RECHECK: { label: "Recheck", cls: "bg-[var(--blue-50)] text-[var(--blue-700)] ring-[var(--blue-200)]", dot: "bg-[var(--blue)]" },
  MONITOR: { label: "Monitor", cls: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const QUALITY_STYLE: Record<string, string> = {
  High: "bg-[var(--green-50)] text-[var(--green-700)] ring-[var(--green-200)]",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-[var(--red-50)] text-[var(--red-700)] ring-[var(--red-200)]",
};

export const PRIORITY_COLOR = (rank?: number) =>
  rank === 1 ? "#FF8A35" : rank === 2 ? "#2563EB" : "#64748B";
