import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";

export default function AppUpdater({ enabled }: { enabled: boolean }) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = useRef<Update | null>(null);
  const installing = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Deferring also prevents a duplicate request in React StrictMode.
    const timer = setTimeout(() => {
      setStatus("checking");
      void check({ timeout: 15_000 }).then(
        async (found) => {
          if (cancelled) {
            await found?.close().catch(() => {});
            return;
          }
          current.current = found;
          setUpdate(found);
          setStatus(found ? "available" : "current");
        },
        (cause: unknown) => {
          if (cancelled) return;
          setError(String(cause));
          setStatus("error");
        },
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!installing.current) {
        void current.current?.close().catch(() => {});
        current.current = null;
      }
    };
  }, [enabled, attempt]);

  async function install() {
    if (!update || installing.current) return;
    installing.current = true;
    setError("");
    setProgress(null);
    setStatus("downloading");
    let total = 0;
    let downloaded = 0;
    try {
      await update.downloadAndInstall(
        (event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
            downloaded = 0;
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            setProgress(
              total
                ? Math.min(100, Math.round((downloaded / total) * 100))
                : null,
            );
          } else {
            setStatus("installing");
          }
        },
        { timeout: 120_000 },
      );
      // On Windows the plugin exits Hej and the NSIS installer restarts it.
    } catch (cause) {
      setError(String(cause));
      setStatus("available");
    } finally {
      installing.current = false;
    }
  }

  if (!enabled || dismissed) return null;
  const busy = status === "downloading" || status === "installing";
  return (
    <section className="banner app-updater" aria-label="App-updates">
      <div role="status" aria-live="polite">
        {status === "idle" || status === "checking"
          ? "Controleren op updates…"
          : busy
            ? status === "installing"
              ? "Update controleren en installeren…"
              : `Update downloaden${progress === null ? "…" : `: ${progress}%`}`
            : update
              ? `Hej ${update.version} is beschikbaar. De app sluit tijdens de installatie en start daarna opnieuw.`
              : status === "error"
                ? "Updatecontrole niet gelukt. Je kunt Hej blijven gebruiken."
                : "Hej is bijgewerkt."}
      </div>
      {error && (
        <details>
          <summary>Technische details</summary>
          {error}
        </details>
      )}
      {error && update && (
        <p role="alert">Update installeren is niet gelukt. Probeer opnieuw.</p>
      )}
      <div className="update-actions">
        {update && !busy && (
          <button className="primary" onClick={() => void install()}>
            Update installeren
          </button>
        )}
        {!update && status !== "checking" && status !== "idle" && (
          <button
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Opnieuw controleren
          </button>
        )}
        {!busy && (
          <button
            onClick={() => {
              void current.current?.close().catch(() => {});
              current.current = null;
              setDismissed(true);
            }}
          >
            {update ? "Later" : "Sluiten"}
          </button>
        )}
      </div>
    </section>
  );
}
