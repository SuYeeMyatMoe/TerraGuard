"use client";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Leaf, X } from "lucide-react";
import { CHAPTERS, CAPABILITIES, STEPS, TECHNOLOGY, EVIDENCE_NOTE, STORY_TIMING, clamp, ramp, sceneAt } from "./story";
import { ForestEnvironment } from "./ForestEnvironment";
import styles from "./cinematic.module.css";
const sceneIds=["forest-life","forest-fire","forest-ash"];

function ForestChapter({ index, sceneRef, active, navigate, showDetails }: { index: number; sceneRef: RefObject<HTMLElement | null>; active: boolean; navigate: (index: number) => void; showDetails: () => void }) {
  const progress=useRef([0,.64,1][index]);
  const item=CHAPTERS[index];
  const scene=sceneAt(progress.current);
  return <section ref={sceneRef} id={sceneIds[index]} className={styles.viewport} aria-labelledby={`${sceneIds[index]}-title`} aria-hidden={!active} style={{"--warmth":scene.fire,"--ash":scene.burn,zIndex:3-index} as CSSProperties}>
    <div className={styles.sceneLayers}>
      <div className={styles.warmAtmosphere} aria-hidden="true"/><div className={styles.ashAtmosphere} aria-hidden="true"/>
      <div className={styles.backgroundLens} data-background-lens aria-hidden="true"/>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="TerraGuard AI home"><Leaf size={25} strokeWidth={1.5}/>TerraGuard<span>AI</span></Link>
        <nav aria-label={`${item.label} navigation`}><button onClick={showDetails} className={styles.aboutLink}>Our approach</button><Link href="/simulation" className={styles.navCta}>Launch simulation <ArrowUpRight size={15}/></Link></nav>
      </header>
      <div className={styles.edition}><span>FOREST INTELLIGENCE</span><span>MALAYSIA & INDONESIA</span></div>
      <div className={styles.copyArea}>
        <div className={`${styles.copy} ${styles[`copy${index}`]}`}>
          <p className={styles.eyebrow}><span className={styles.statusDot}/> CHAPTER 0{index+1} / {item.label.toUpperCase()}</p>
          {index===0 ? <h1 id={`${sceneIds[index]}-title`}>{item.title[0]}<br/><em>{item.title[1]}</em></h1> : <h2 id={`${sceneIds[index]}-title`}>{item.title[0]}<br/><em>{item.title[1]}</em></h2>}
          <p className={styles.description}>{item.description}</p>
          <button className={styles.detailLink} onClick={showDetails}>{index===1 ? "From observation to action" : index===2 ? "Explore the solution & evidence" : "Discover our approach"} <ArrowUpRight size={12}/></button>
        </div>
        <Link href="/simulation" className={styles.mainCta}>{index===2 ? "Enter the command center" : "Explore TerraGuard"} <ArrowUpRight size={17}/></Link>
      </div>
      <nav className={styles.chapters} aria-label="Forest chapters">{CHAPTERS.map((chapter,i)=><a key={chapter.label} href={`#${sceneIds[i]}`} onClick={event=>{event.preventDefault();navigate(i);}} aria-current={index===i ? "step" : undefined}><span>0{i+1}</span><span>{chapter.label}</span><i aria-hidden="true"/></a>)}</nav>
      {index<2 && <button onClick={()=>navigate(index+1)} className={styles.scrollCue}><span>SCROLL TO THE NEXT CHAPTER</span><ArrowDown size={15}/></button>}
      <ForestEnvironment progress={progress}/>
      <div className={styles.bottomBar}><span>FROM LIFE TO FIRE TO ASH</span><span>{item.note}</span><span>0{index+1} — 03</span></div>
    </div>
  </section>;
}

export function CinematicStory() {
  const root=useRef<HTMLDivElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const first=useRef<HTMLElement>(null), second=useRef<HTMLElement>(null), third=useRef<HTMLElement>(null);
  const details=useRef<HTMLDialogElement>(null);
  const [active,setActive]=useState(0);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const el=root.current, viewport=stage.current;
    if(!el || !viewport)return;
    const scenes=[first.current,second.current,third.current];
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame=0, previous=-1;
    const update=()=>{
      frame=0;
      if(media.matches){
        scenes.forEach(scene=>{if(scene){scene.style.opacity="1";scene.style.setProperty("--scene-shift","0px");scene.style.setProperty("--copy-opacity","1");scene.inert=false;scene.dataset.ambient="true";}});
        return;
      }
      const rect=el.getBoundingClientRect();
      const p=clamp(-rect.top/Math.max(1,el.offsetHeight-viewport.offsetHeight));
      const fades=[ramp(p,...STORY_TIMING.firstFade),ramp(p,...STORY_TIMING.secondFade)];
      const next=fades[0]<.5?0:fades[1]<.5?1:2;
      if(next!==previous){previous=next;setActive(next);}
      scenes.forEach((scene,i)=>{
        if(!scene)return;
        scene.inert=i!==next;
        scene.dataset.ambient=String(i===next || (i===1 && fades[0]>0 && fades[0]<1) || (i===2 && fades[1]>0 && fades[1]<1));
        scene.style.pointerEvents=i===next?"auto":"none";
        const incoming=i===0 ? 1 : fades[i-1];
        const outgoing=i===2 ? 0 : fades[i];
        scene.style.opacity=String(1-outgoing);
        scene.style.setProperty("--scene-shift",`${STORY_TIMING.incomingOffset*(1-incoming-outgoing)}px`);
        // Text phases do not overlap; the forest and background crossfade continuously.
        const copyOpacity=ramp(incoming,.5,1)*(1-ramp(outgoing,0,.5));
        scene.style.setProperty("--copy-opacity",String(copyOpacity));
      });
      el.style.setProperty("--progress",String(p));
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    const changeMotion=()=>{setReduced(media.matches);el.dataset.reduced=String(media.matches);schedule();};
    changeMotion();
    window.addEventListener("scroll",schedule,{passive:true});window.addEventListener("resize",schedule);media.addEventListener("change",changeMotion);
    const observer=new ResizeObserver(schedule);observer.observe(viewport);
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener("scroll",schedule);window.removeEventListener("resize",schedule);media.removeEventListener("change",changeMotion);observer.disconnect();};
  },[]);
  const navigate=(index:number)=>{
    const el=root.current,viewport=stage.current;
    if(!el||!viewport)return;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){[first,second,third][index].current?.scrollIntoView({behavior:"instant"});return;}
    window.scrollTo({top:window.scrollY+el.getBoundingClientRect().top+STORY_TIMING.chapterStops[index]*(el.offsetHeight-viewport.offsetHeight),behavior:"smooth"});
  };
  return <div ref={root} className={styles.story} style={{"--story-screens":STORY_TIMING.scrollScreens} as CSSProperties}>
    <div ref={stage} className={styles.storyStage}>
      {[first,second,third].map((ref,i)=><ForestChapter key={i} sceneRef={ref} index={i} active={reduced||active===i} navigate={navigate} showDetails={()=>details.current?.showModal()}/>)}
      <div className={styles.progressTrack} aria-hidden="true"><div/></div>
    </div>
    <dialog ref={details} className={styles.evidenceDialog} aria-labelledby="evidence-title">
      <button className={styles.closeDetails} onClick={()=>details.current?.close()} aria-label="Close approach and evidence"><X size={19}/></button>
      <p className={styles.sectionLabel}>OUR APPROACH / A BETTER NEXT DECISION</p>
      <h2 id="evidence-title">A hotspot is not a decision.</h2>
      <p>Three incidents. One available team. TerraGuard brings satellite intelligence and response simulation together to help forest coordinators decide where their attention can make a difference.</p>
      <p>Replay incidents, explore the possibilities and turn intelligence into a considered response.</p>
      <div className={styles.detailFeatures}>{CAPABILITIES.map(item=><article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
      <h3>From observation to action.</h3><ol className={styles.detailSteps}>{STEPS.map(([title,body])=><li key={title}><b>{title}</b> — {body}</li>)}</ol>
      <h3>Open data. Auditable models. Human judgement.</h3><p>{TECHNOLOGY.join(" · ")}</p><p className={styles.technicalNote}>{EVIDENCE_NOTE}</p>
      <p className={styles.sectionLabel}>THE FUTURE IS STILL OURS TO PROTECT</p>
      <p>Before the flames: a world in balance. One spark. Everything changes. When the flames disappear, their impact remains. Predict. Simulate. Protect.</p>
      <Link href="/simulation" className={styles.dialogCta}>Enter the command center <ArrowUpRight size={16}/></Link>
    </dialog>
  </div>;
}



