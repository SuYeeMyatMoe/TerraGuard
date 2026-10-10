import { AlertTriangle, Trees } from "lucide-react";
import styles from "./CommandLoading.module.css";

export function CommandLoading({ stage = "Preparing your command center", error, onRetry, onEarthView }: {
  stage?: string;
  error?: string | null;
  onRetry?: () => void;
  onEarthView?: () => void;
}) {
  return <div className={styles.screen} role={error ? "alert" : "status"} aria-live="polite" aria-atomic="true">
    <div className={styles.content}>
      <div className={styles.brand}>TerraGuard <span>AI</span></div>
      <div className={`${styles.emblem} ${error ? styles.failed : ""}`} aria-hidden="true">
        {!error && <span className={styles.ring}/>}
        {error ? <AlertTriangle size={32}/> : <Trees size={36} strokeWidth={1.5}/>}
      </div>
      <p className={styles.eyebrow}>FOREST COMMAND CENTER</p>
      <h1>{error ? "Unable to prepare the command center" : "Preparing the forest response"}</h1>
      <p className={styles.detail}>{error ?? stage}</p>
      {error ? <div className={styles.actions}>
        {onRetry && <button onClick={onRetry}>Retry</button>}
        {onEarthView && <button onClick={onEarthView}>Open Earth View</button>}
      </div> : <p className={styles.hint}>Your workspace will open when it’s ready.</p>}
    </div>
  </div>;
}
