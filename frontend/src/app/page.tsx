import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Box,
  BrainCircuit,
  ClipboardList,
  CloudSun,
  Database,
  Flame,
  Globe2,
  MapPin,
  Satellite,
  ScanSearch,
  Sparkles,
  Trees,
  Truck,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { HeroVisual } from "@/components/landing/HeroVisual";

const STORY = [
  {
    n: "01",
    title: "Pick the incident",
    icon: MapPin,
    body: "Three detections on the map, real coordinates and the past 24 hours. Each one carries a 48-hour follow-up risk, an evidence rating and a transparent priority rank.",
    tone: "fire",
  },
  {
    n: "02",
    title: "Send the only crew",
    icon: Truck,
    body: "One named field crew. Sending it somewhere is a real assignment, and the command center shows at once which incidents are now unattended and how risky they are.",
    tone: "blue",
  },
  {
    n: "03",
    title: "Record who waits",
    icon: ClipboardList,
    body: "Every decision keeps the incident, the recommendation at that moment, your reason, the crew and the time, plus who was left waiting. It is a record you can defend later.",
    tone: "green",
  },
] as const;

const STEPS = [
  { title: "Satellite data", body: "NASA FIRMS VIIRS hotspots + historical weather", icon: Satellite },
  { title: "Predict risk", body: "48-hour follow-up detection, evidence quality", icon: BrainCircuit },
  { title: "Rank & recommend", body: "Transparent priority: inspect, recheck or monitor", icon: ScanSearch },
  { title: "Assign the crew", body: "Human decision, with a reason, recorded", icon: Truck },
  { title: "Test the response", body: "Optional 3D what-if under identical conditions", icon: Box },
];

const TECH = [
  { name: "NASA FIRMS VIIRS", role: "Hotspot detections", icon: Satellite },
  { name: "Open-Meteo", role: "Historical weather", icon: CloudSun },
  { name: "Google Earth", role: "Satellite context", icon: Globe2 },
  { name: "Random Forest", role: "48 h prediction", icon: Trees },
  { name: "NumPy simulator", role: "What-if fire tests", icon: Flame },
  { name: "React Three Fiber", role: "3D forest", icon: Box },
  { name: "OpenAI", role: "Incident briefings", icon: Sparkles },
  { name: "Grafilab", role: "Field briefs", icon: Bot },
  { name: "Supabase", role: "Decision record", icon: Database },
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
              Open command center <ArrowRight size={16} />
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
              Forest fire command center · Malaysia &amp; Indonesia
            </span>
            <h1 className="mt-5 text-[48px] font-extrabold leading-[1.02] tracking-[-0.03em] text-[var(--ink)] sm:text-[62px]">
              Three fires.
              <br />
              <span className="text-[var(--green)]">One team.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-[var(--ink-2)]">
              TerraGuard shows which incident should get the only field crew, who is left waiting, and keeps a record you
              can defend.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/simulation" className="btn btn-primary h-12 px-6 text-[15px]">
                Open command center <ArrowRight size={17} />
              </Link>
              <a href="#how-it-works" className="btn btn-secondary h-12 px-5 text-[15px]">See how it works</a>
            </div>
            <p className="mt-6 max-w-[520px] text-[13px] leading-relaxed text-[var(--ink-3)]">
              Satellite hotspots and a 48-hour prediction inform the choice. A person makes it, and it is recorded.
            </p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* the story: pick, send, record */}
      <section className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="max-w-[640px]">
          <div className="eyebrow">The decision</div>
          <h2 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight">A hotspot is not a decision.</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--ink-2)]">
            Monitoring systems show where fires have been detected. When there is only one crew, someone has to choose where
            it goes, and accept that the others wait.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STORY.map((c) => (
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
              <h2 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight">From satellite pixel to a recorded decision</h2>
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
            Replay a real day of detections, send the only crew, and leave a record of who was left waiting.
          </p>
          <Link href="/simulation" className="btn relative mt-8 h-12 bg-white px-6 text-[15px] text-[var(--ink)] hover:bg-[#eef4ff]">
            Open command center <ArrowRight size={17} />
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
