// Lightweight isometric forest illustration for the landing page (pure SVG, no WebGL).
import { Activity, ShieldCheck, Truck } from "lucide-react";

const N = 13;
const S = 26; // tile size
const C = Math.cos(Math.PI / 6);
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * C * S, (x + y) * 0.5 * S - z * S];

function rnd(i: number, salt: number) {
  let x = (i + 1) * 374761393 + salt * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (((x ^ (x >>> 16)) >>> 0) % 1000) / 1000;
}

type Cell = "tree" | "fire" | "burned" | "clear" | "path" | "break";

function cellType(x: number, y: number): Cell {
  const i = y * N + x;
  if (y === 8 && x < 9) return "path";
  if (x === 9 && y >= 8) return "path";
  const dx = x - 3.2, dy = y - 3.5;
  const d = Math.hypot(dx, dy * 1.2);
  if (d < 1.2) return "burned";
  if (d < 2.3 && rnd(i, 1) > 0.25) return "fire";
  if ((x === 6 && y <= 6 && y >= 1) || (y === 6 && x >= 2 && x <= 6)) return "break";
  if (rnd(i, 2) < 0.1) return "clear";
  return "tree";
}

const TILE: Record<Cell, string> = {
  tree: "#c9e9d3",
  fire: "#ffc79c",
  burned: "#6b7078",
  clear: "#e6f1e4",
  path: "#efe6d2",
  break: "#bdeef6",
};

function inProtected(x: number, y: number) {
  return x >= 8 && y <= 6;
}

export function HeroVisual() {
  const cells: { x: number; y: number; t: Cell }[] = [];
  for (let s = 0; s < 2 * N - 1; s++)
    for (let x = 0; x < N; x++) {
      const y = s - x;
      if (y < 0 || y >= N) continue;
      cells.push({ x, y, t: cellType(x, y) });
    }
  const [ox, oy] = [N * C * S + 10, 60];
  const top = (x: number, y: number) =>
    [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)].map(([a, b]) => `${a + ox},${b + oy}`).join(" ");
  const base = [iso(0, 0, 0), iso(N, 0, 0), iso(N, N, 0), iso(0, N, 0)];
  const depth = 0.7;
  const left = [iso(0, N), iso(N, N), iso(N, N, -depth), iso(0, N, -depth)].map(([a, b]) => `${a + ox},${b + oy}`).join(" ");
  const right = [iso(N, 0), iso(N, N), iso(N, N, -depth), iso(N, 0, -depth)].map(([a, b]) => `${a + ox},${b + oy}`).join(" ");
  const pa = [iso(8, 0), iso(13, 0), iso(13, 7), iso(8, 7)].map(([a, b]) => `${a + ox},${b + oy}`).join(" ");
  const w = 2 * N * C * S + 20;
  const h = N * S + 140;

  return (
    <div className="relative">
      <div className="absolute inset-x-6 bottom-0 top-10 rounded-[32px] bg-gradient-to-br from-[#e7f4ec] via-[#eef4fb] to-[#fff4ec]" />
      <svg viewBox={`0 0 ${w} ${h}`} className="relative w-full drop-shadow-[0_30px_40px_rgba(23,38,56,0.12)]" role="img"
        aria-label="Isometric forest with a fire hotspot, a protected habitat and a response team">
        <defs>
          <radialGradient id="hv-glow">
            <stop offset="0" stopColor="#ff8a35" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ff8a35" stopOpacity="0" />
          </radialGradient>
        </defs>
        <polygon points={left} fill="#b5d7c0" />
        <polygon points={right} fill="#a3cbb0" />
        <polygon points={base.map(([a, b]) => `${a + ox},${b + oy}`).join(" ")} fill="#d7eedd" />
        {cells.map(({ x, y, t }) => (
          <polygon key={`t${x}-${y}`} points={top(x, y)} fill={inProtected(x, y) && t === "tree" ? "#b6e2c5" : TILE[t]} stroke="#ffffff" strokeWidth="1.2" />
        ))}
        <polygon points={pa} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="7 5" />
        {(() => {
          const [gx, gy] = iso(3.7, 4);
          return <ellipse cx={gx + ox} cy={gy + oy} rx={120} ry={64} fill="url(#hv-glow)" />;
        })()}
        {cells.map(({ x, y, t }) => {
          const i = y * N + x;
          const [cx, cy] = iso(x + 0.5, y + 0.5);
          const px = cx + ox, py = cy + oy;
          if (t === "tree" || t === "fire" || (t === "burned" && rnd(i, 5) > 0.4)) {
            const s = 0.75 + rnd(i, 3) * 0.45;
            const hgt = (t === "burned" ? 18 : 30) * s;
            const wd = 9.5 * s;
            const leafy = inProtected(x, y) || rnd(i, 4) > 0.6;
            const lc = t === "fire" ? "#ff8a35" : t === "burned" ? "#454a52" : leafy ? "#3db37a" : "#2f9e68";
            const dc = t === "fire" ? "#e8711f" : t === "burned" ? "#33373d" : leafy ? "#2c9663" : "#237c51";
            return (
              <g key={`p${x}-${y}`}>
                <line x1={px} y1={py} x2={px} y2={py - 6 * s} stroke="#8a6a4c" strokeWidth={2.2} />
                {leafy && t !== "burned" ? (
                  <>
                    <circle cx={px} cy={py - 6 * s - wd} r={wd * 1.05} fill={lc} />
                    <path d={`M${px} ${py - 6 * s - 2 * wd} a ${wd * 1.05} ${wd * 1.05} 0 0 1 0 ${2 * wd}`} fill={dc} />
                  </>
                ) : (
                  <>
                    <polygon points={`${px},${py - 6 * s - hgt} ${px - wd},${py - 6 * s} ${px},${py - 6 * s + 3}`} fill={lc} />
                    <polygon points={`${px},${py - 6 * s - hgt} ${px + wd},${py - 6 * s} ${px},${py - 6 * s + 3}`} fill={dc} />
                  </>
                )}
                {t === "fire" && rnd(i, 6) > 0.35 && (
                  <path d={`M${px} ${py - 16 * s} c 5 -6 3 -11 0 -16 c -3 5 -6 9 -5 12 c -1 -2 -2 -3 -3 -4 c -1 4 2 8 8 8z`} fill="#ff6a00" opacity="0.9" />
                )}
              </g>
            );
          }
          return null;
        })}
        {/* ranger truck on the path */}
        {(() => {
          const [tx, ty] = iso(7.2, 8.5);
          const X = tx + ox, Y = ty + oy;
          return (
            <g>
              <polygon points={`${X - 14},${Y - 4} ${X + 6},${Y - 14} ${X + 16},${Y - 9} ${X - 4},${Y + 1}`} fill="#ffffff" stroke="#dbe3ec" />
              <polygon points={`${X - 14},${Y - 4} ${X - 4},${Y + 1} ${X - 4},${Y + 9} ${X - 14},${Y + 4}`} fill="#e9eef4" />
              <polygon points={`${X - 4},${Y + 1} ${X + 16},${Y - 9} ${X + 16},${Y - 1} ${X - 4},${Y + 9}`} fill="#f4f7fa" />
              <polygon points={`${X + 6},${Y - 14} ${X + 16},${Y - 9} ${X + 22},${Y - 12} ${X + 12},${Y - 17}`} fill="#2563eb" />
            </g>
          );
        })()}
        {/* incident beacon */}
        {(() => {
          const [bx, by] = iso(3.6, 3.9);
          const X = bx + ox, Y = by + oy - 70;
          return (
            <g>
              <line x1={X} y1={Y + 18} x2={X} y2={Y + 62} stroke="#ff8a35" strokeWidth="2" strokeDasharray="3 3" />
              <path d={`M${X} ${Y + 26} C ${X - 16} ${Y + 8}, ${X - 16} ${Y - 14}, ${X} ${Y - 14} C ${X + 16} ${Y - 14}, ${X + 16} ${Y + 8}, ${X} ${Y + 26}z`} fill="#ff8a35" />
              <circle cx={X} cy={Y - 1} r="5.5" fill="#fff" />
            </g>
          );
        })()}
        {/* monitoring marker over protected area */}
        {(() => {
          const [mx, my] = iso(10.5, 3);
          const X = mx + ox, Y = my + oy - 44;
          return (
            <g>
              <path d={`M${X} ${Y + 20} C ${X - 12} ${Y + 6}, ${X - 12} ${Y - 10}, ${X} ${Y - 10} C ${X + 12} ${Y - 10}, ${X + 12} ${Y + 6}, ${X} ${Y + 20}z`} fill="#2563eb" />
              <circle cx={X} cy={Y} r="4" fill="#fff" />
            </g>
          );
        })()}
      </svg>

      {/* operational overlay chips */}
      <div className="panel-float absolute bottom-[8%] left-0 w-[230px] p-3.5 sm:left-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[var(--fire-50)] text-[var(--fire)]"><Activity size={16} /></span>
          <div>
            <div className="text-[11px] font-semibold text-[var(--ink-2)]">48 h follow-up detection</div>
            <div className="text-[13px] font-bold">Estimated with uncertainty</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-[#eef2f7]">
          <div className="h-1.5 w-[62%] rounded-full bg-[var(--fire)]" />
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] font-semibold text-[var(--ink-3)]">
          <span>Evidence quality</span>
          <span className="text-[var(--green-700)]">Shown with every estimate</span>
        </div>
      </div>
      <div className="panel-float absolute right-0 top-[6%] flex items-center gap-2 px-3 py-2 sm:right-4">
        <ShieldCheck size={16} className="text-[var(--green)]" />
        <span className="text-[12px] font-semibold">Protected habitat</span>
      </div>
      <div className="panel-float absolute bottom-[2%] right-2 flex items-center gap-2.5 px-3 py-2.5 sm:right-8">
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[var(--cyan-50)] text-[var(--cyan)]"><Truck size={16} /></span>
        <div>
          <div className="text-[11px] font-semibold text-[var(--ink-2)]">One field team</div>
          <div className="text-[12.5px] font-bold">Compare where it goes first</div>
        </div>
      </div>
    </div>
  );
}
