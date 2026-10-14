import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface DownloadableVoice {
  id: string;
  name: string;
  size: number;
  installed: boolean;
  downloading: boolean;
}
interface Progress {
  id: string;
  downloaded: number;
  total: number;
}
export default function DownloadableVoices({
  selected,
  onInstalled,
  onSelectTest,
}: {
  selected: string;
  onInstalled: () => Promise<void>;
  onSelectTest: (id: string) => Promise<void>;
}) {
  const [voices, setVoices] = useState<DownloadableVoice[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const active = useRef(new Set<string>());
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const entries = await invoke<DownloadableVoice[]>(
        "list_downloadable_voices",
      );
      if (mounted.current) {
        setVoices(entries ?? []);
        setLoadError("");
      }
    } catch (e) {
      if (mounted.current) setLoadError(String(e));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<Progress>("voice-download", ({ payload }) => {
      if (!disposed) setProgress((p) => ({ ...p, [payload.id]: payload }));
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => {
        if (!disposed) setLoadError(String(e));
      });
    return () => {
      disposed = true;
      mounted.current = false;
      unlisten?.();
    };
  }, [refresh]);
  const busy = voices.some((v) => v.downloading);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [busy, refresh]);
  const install = async (id: string) => {
    if (active.current.has(id)) return;
    active.current.add(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    setProgress((p) => ({
      ...p,
      [id]: {
        id,
        downloaded: 0,
        total: voices.find((v) => v.id === id)?.size ?? 1,
      },
    }));
    setVoices((vs) =>
      vs.map((v) => (v.id === id ? { ...v, downloading: true } : v)),
    );
    try {
      await invoke("install_voice", { id });
      await onInstalled();
    } catch (e) {
      if (mounted.current)
        setErrors((errors) => ({ ...errors, [id]: String(e) }));
    } finally {
      active.current.delete(id);
      if (mounted.current) await refresh();
    }
  };
  if (!voices.length && !loadError) return null;
  return (
    <section className="downloadable-voices" aria-label="Stemmen downloaden">
      <h3>Stemmen downloaden</h3>
      <p>
        Download een Zweedse stem. Daarna luister je volledig offline, zonder
        account.
      </p>
      {loadError && (
        <p role="alert">
          {loadError}{" "}
          <button className="quiet" onClick={() => void refresh()}>
            Opnieuw proberen
          </button>
        </p>
      )}
      {voices.map((v) => (
        <article className="voice-download" key={v.id} aria-label={v.name}>
          <strong>{v.name}</strong>
          <span>
            {(v.size / 1_000_000).toFixed(1)} MB ·{" "}
            {v.installed ? "Geïnstalleerd" : "Niet geïnstalleerd"}
            {selected === v.id ? " · Geselecteerd" : ""}
          </span>
          {v.downloading ? (
            <>
              <progress
                aria-label={`${v.name} downloaden`}
                max={v.size}
                value={progress[v.id]?.downloaded ?? 0}
              />
              <span role="status">
                {progress[v.id]?.downloaded === v.size
                  ? "Download controleren en installeren…"
                  : "Downloaden…"}
              </span>
              <button
                className="quiet"
                onClick={() =>
                  void invoke("cancel_voice_download", { id: v.id }).catch(
                    (e) =>
                      setErrors((errors) => ({ ...errors, [v.id]: String(e) })),
                  )
                }
              >
                Annuleren
              </button>
            </>
          ) : (
            <div className="voice-actions">
              <button className="quiet" onClick={() => void install(v.id)}>
                {v.installed
                  ? "Opnieuw installeren"
                  : errors[v.id]
                    ? "Opnieuw proberen"
                    : "Downloaden"}
              </button>
              {v.installed && (
                <button
                  className="primary"
                  onClick={() =>
                    void onSelectTest(v.id).catch((e) =>
                      setErrors((errors) => ({ ...errors, [v.id]: String(e) })),
                    )
                  }
                >
                  Selecteren en testen
                </button>
              )}
            </div>
          )}
          {errors[v.id] && <p role="alert">{errors[v.id]}</p>}
        </article>
      ))}
    </section>
  );
}
