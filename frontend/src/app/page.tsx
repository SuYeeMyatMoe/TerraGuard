import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Box,
  BrainCircuit,
  CloudSun,
  Flame,
  Globe2,
  Layers,
  Satellite,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trees,
  Users,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { HeroVisual } from "@/components/landing/HeroVisual";

const CAPABILITIES = [
  {
    n: "01",
    title: "Predict",
    icon: BrainCircuit,
    body: "See which observed hotspots are more likely to be followed by another satellite detection within 48 hours. Each estimate comes with its uncertainty and the factors behind it.",
    tone: "fire",
  },
  {
    n: "02",
    title: "Simulate",
    icon: Box,
    body: "Explore hypothetical fire propagation on an interactive 3D forest, then compare response policies under identical conditions.",
    tone: "blue",
  },
  {
    n: "03",
    title: "Decide",
    icon: ScanSearch,
    body: "Prioritise limited field teams with transparent rules, evidence-checked AI briefings and calculated outcomes, then record a human-approved decision.",
    tone: "green",
  },
] as const;

const STEPS = [
  { title: "Satellite data", body: "NASA FIRMS VIIRS hotspots + historical weather", icon: Satellite },
  { title: "Predict risk", body: "48-hour follow-up detection, evidence quality", icon: BrainCircuit },
  { title: "Explore in 3D", body: "Wind, dryness, ignition and response delay", icon: Box },
  { title: "Compare strategies", body: "First-alert vs AI-prioritised, same random draws", icon: Layers },
  { title: "Take action", body: "Inspect, recheck or dismiss, with an audit trail", icon: ShieldCheck },
];

const TECH = [
  { name: "NASA FIRMS VIIRS", role: "Hotspot detections", icon: Satellite },
  { name: "Open-Meteo", role: "Historical weather", icon: CloudSun },
  { name: "Google Earth", role: "Satellite context", icon: Globe2 },
  { name: "Random Forest", role: "48 h prediction", icon: Trees },
  { name: "Cellular automaton", role: "Fire scenarios", icon: Flame },
  { name: "React Three Fiber", role: "3D forest", icon: Box },
  { name: "OpenAI", role: "Incident briefings", icon: Sparkles },
  { name: "Grafilab", role: "Field briefs", icon: Bot },
];

const toneCls = {
  fire: "bg-[var(--fire-50)] text-[var(--fire)]",
  blue: "bg-[var(--blue-50)] text-[var(--blue)]",
  green: "bg-[var(--green-50)] text-[var(--green)]",
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)]/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
          <Link href="/" aria-label="TerraGuard AI home"><Logo /></Link>
          <nav className="flex items-center gap-1">
            <a href="#how-it-works" className="btn btn-ghost hidden sm:inline-flex">How It Works</a>
            <a href="#technology" className="btn btn-ghost hidden sm:inline-flex">Technology</a>
            <Link href="/simulation" className="btn btn-primary ml-2">
              Launch Simulation <ArrowRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-6 pb-16 pt-14 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[var(--ink-2)] ring-1 ring-[var(--line)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
              Forest intervention command center · Malaysia &amp; Indonesia
            </span>
            <h1 className="mt-5 text-[44px] font-extrabold leading-[1.05] tracking-[-0.025em] text-[var(--ink)] sm:text-[54px]">
              Don’t just detect the fire.{" "}
              <span className="text-[var(--green)]">Decide what to do next.</span>
            </h1>
            <p className="mt-5 max-w-[540px] text-[17px] leading-relaxed text-[var(--ink-2)]">
              TerraGuard AI combines predictive satellite intelligence with an interactive 3D forest simulator. It helps
              environmental coordinators prioritise incidents, compare potential interventions and make evidence-based
              decisions.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/simulation" className="btn btn-primary h-12 px-6 text-[15px]">
                Launch Simulation <ArrowRight size={17} />
              </Link>
              <a href="#how-it-works" className="btn btn-secondary h-12 px-5 text-[15px]">See How It Works</a>
            </div>
            <div className="mt-8 flex items-center gap-3 text-[13px] text-[var(--ink-2)]">
              <Users size={16} className="text-[var(--ink-3)]" />
              <span><b className="text-[var(--ink)]">Three incidents. One team.</b> Which one deserves attention first?</span>
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* capabilities */}
      <section className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="max-w-[640px]">
          <div className="eyebrow">What it does</div>
          <h2 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight">A hotspot is not a decision.</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--ink-2)]">
            Monitoring systems show where fires have been detected. TerraGuard helps coordinators work out which detections
            deserve attention, and tests what different allocations of scarce teams might change.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div key={c.n} className="panel p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
              <div className="flex items-center justify-between">
                <div className={`grid h-11 w-11 place-items-center rounded-[12px] ${toneCls[c.tone]}`}>
                  <c.icon size={20} />
                </div>
                <span className="font-mono text-[13px] font-semibold text-[var(--ink-3)]">{c.n}</span>
              </div>
              <h3 className="mt-5 text-[19px] font-bold">{c.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-[var(--line)] bg-white">
        <div className="mx-auto max-w-[1240px] px-6 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow">How it works</div>
              <h2 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight">From satellite pixel to approved action</h2>
            </div>
            <p className="max-w-[440px] text-[14px] leading-relaxed text-[var(--ink-2)]">
              Prediction, prioritisation, simulation and generative AI are kept separate. Each layer is labelled for what it
              can and cannot claim.
            </p>
          </div>
          <ol className="relative mt-12 grid gap-6 md:grid-cols-5">
            <div className="absolute left-[10%] right-[10%] top-[22px] hidden h-[2px] bg-gradient-to-r from-[var(--fire-200)] via-[var(--blue-200)] to-[var(--green-200)] md:block" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex flex-col items-center text-center">
                <span className="relative grid h-11 w-11 place-items-center rounded-full bg-white text-[var(--blue)] shadow-[0_0_0_6px_white] ring-1 ring-[var(--line)]">
                  <s.icon size={19} />
                </span>
                <span className="mt-4 font-mono text-[11.5px] font-semibold text-[var(--ink-3)]">STEP {i + 1}</span>
                <span className="mt-1 text-[15px] font-bold">{s.title}</span>
                <span className="mt-1 max-w-[190px] text-[13px] leading-snug text-[var(--ink-2)]">{s.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* technology */}
      <section id="technology" className="mx-auto max-w-[1240px] scroll-mt-20 px-6 py-16">
        <div className="eyebrow">Technology</div>
        <h2 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight">Built on open data and auditable models</h2>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TECH.map((t) => (
            <div key={t.name} className="flex items-center gap-3 rounded-[14px] border border-[var(--line)] bg-white p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#f3f6fa] text-[var(--ink-2)]">
                <t.icon size={18} />
              </span>
              <span>
                <span className="block text-[14px] font-bold">{t.name}</span>
                <span className="block text-[12.5px] text-[var(--ink-2)]">{t.role}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[760px] text-[13px] leading-relaxed text-[var(--ink-3)]">
          The 48-hour model predicts satellite-observed follow-up activity, not fire spread or damage. The 3D forest is a
          hypothetical scenario, not a reconstruction of a real site. Language models only explain verified outputs, and a
          person approves every action.
        </p>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-[1240px] px-6 pb-20">
        <div className="relative overflow-hidden rounded-[24px] bg-[#13283d] px-8 py-14 text-center text-white sm:px-14">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[var(--green)]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[var(--fire)]/20 blur-3xl" />
          <h2 className="relative text-[34px] font-extrabold leading-tight tracking-tight">One team. Multiple threats. Make the better decision.</h2>
          <p className="relative mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-white/70">
            Replay historical incidents, test the response and approve the action, all in one command center.
          </p>
          <Link href="/simulation" className="btn relative mt-8 h-12 bg-white px-6 text-[15px] text-[var(--ink)] hover:bg-[#eef4ff]">
            Enter Forest Command Center <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12.5px] text-[var(--ink-3)]">
          <Logo size={22} />
          <span>Predict the threat. Test the response. Protect the forest.</span>
        </div>
      </footer>
    </div>
  );
}
