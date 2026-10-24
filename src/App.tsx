import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  defaults,
  type Lesson,
  type NewsItem,
  type Settings,
  type Voice,
  type SpeechEvent,
  type Level,
} from "./types";
import { demo } from "./demo";
import LanguageNotes from "./LanguageNotes";
import ExerciseQuestion from "./ExerciseQuestion";
import LessonBrowser from "./LessonBrowser";
import DownloadableVoices from "./DownloadableVoices";
import { emptyFilter, type LessonFilter } from "./lesson-browser";
import { acceptsEvent, resumeIndex, type PlayerState } from "./player";

type Tab = "Nieuws" | "Oefenen" | "Archief" | "Instellingen";
const desktop = "__TAURI_INTERNALS__" in window;
const initialPlayer: PlayerState = {
  requestId: null,
  status: "idle",
  index: 0,
  position: "sentence",
  continuous: false,
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export default function App() {
  const [tab, setTab] = useState<Tab>("Nieuws");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState<Lesson>(demo);
  const [view, setView] = useState<
    "text" | "sentences" | "language" | "grammar"
  >("text");
  const [filters, setFilters] = useState<{
    active: LessonFilter;
    archive: LessonFilter;
  }>({ active: { ...emptyFilter }, archive: { ...emptyFilter } });
  const [pastedTitle, setPastedTitle] = useState("");
  const sourceIds = useRef(new Map<string, string>());
  const [archiveBusy, setArchiveBusy] = useState(false);
  const archiveLock = useRef(false);
  const sentenceElement = useRef<HTMLElement | null>(null);
  const titleElement = useRef<HTMLHeadingElement | null>(null);
  const [player, setPlayer] = useState<PlayerState>(initialPlayer);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [notice, setNotice] = useState("");
  const [region, setRegion] = useState("national");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [notesTarget, setNotesTarget] = useState<{
    grammar: boolean;
    id: string;
    title: string;
    level: Level;
  } | null>(null);
  const generationLock = useRef(false);
  const generationCancelled = useRef(false);
  const [questionBusy, setQuestionBusy] = useState<string | null>(null);
  const [titleBusy, setTitleBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customSource, setCustomSource] = useState<NewsItem | null>(null);
  const [failedNews, setFailedNews] = useState<NewsItem | null>(null);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const cancelRetrieval = useRef<(() => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [codex, setCodex] = useState("");
  const [settingsReady, setSettingsReady] = useState(false);
  const playerRef = useRef(player);
  const lessonRef = useRef(lesson);
  const settingsRef = useRef(settings);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedGap = useRef(false);
  const newsEpoch = useRef(0);
  const generationMounted = useRef(true);
  playerRef.current = player;
  lessonRef.current = lesson;
  settingsRef.current = settings;
  const changePlayer = useCallback((p: PlayerState) => {
    playerRef.current = p;
    setPlayer(p);
  }, []);
  const fail = useCallback((e: unknown, details = "") => {
    setError(message(e));
    setErrorDetails(details);
  }, []);
  const speech = useCallback(
    (action: string, extra: Record<string, unknown> = {}) =>
      desktop
        ? invoke<void>("speech_control", {
            action,
            id: playerRef.current.requestId ?? "",
            text: null,
            voiceId: null,
            rate: null,
            ...extra,
          })
        : Promise.reject(
            "Open de desktopapp om lokale systeemspraak te gebruiken.",
          ),
    [],
  );
  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const stop = useCallback(async () => {
    clearTimer();
    pausedGap.current = false;
    changePlayer({
      ...playerRef.current,
      requestId: null,
      status: "idle",
      continuous: false,
    });
    if (desktop) await speech("stop");
  }, [clearTimer, changePlayer, speech]);
  const persist = useCallback(
    (index: number, completed = false) => {
      const current = lessonRef.current;
      if (current.id === "demo" || !desktop) return;
      const progress = {
        lastSentence: index,
        completed: completed || current.progress.completed,
      };
      setLessons((ls) =>
        ls.map((l) => (l.id === current.id ? { ...l, progress } : l)),
      );
      setLesson((l) => (l.id === current.id ? { ...l, progress } : l));
      void invoke("save_progress", { id: current.id, progress }).catch(fail);
    },
    [fail],
  );
  const play = useCallback(
    async (
      index: number,
      continuous: boolean,
      position: PlayerState["position"] = "sentence",
    ) => {
      clearTimer();
      pausedGap.current = false;
      if (archiveLock.current) return;
      const current = lessonRef.current;
      const s = settingsRef.current;
      const i =
        position === "title" ? 0 : resumeIndex(index, current.sentences.length);
      if (!s.voiceId) {
        setErrorDetails("");
        setError(
          "Geen Zweedse stem geselecteerd. Kies een stem in Instellingen.",
        );
        return;
      }
      const id = crypto.randomUUID();
      changePlayer({
        requestId: id,
        status: "loading",
        index: i,
        continuous,
        position,
      });
      if (position === "sentence" || continuous) persist(i);
      try {
        await speech("speak", {
          id,
          text: position === "title" ? current.title : current.sentences[i].sv,
          voiceId: s.voiceId,
          rate: s.rate,
        });
      } catch (e) {
        if (playerRef.current.requestId === id) {
          changePlayer({
            ...playerRef.current,
            requestId: null,
            status: "idle",
          });
          fail(e);
        }
      }
    },
    [clearTimer, changePlayer, persist, speech, fail],
  );
  const refreshVoices = useCallback(async () => {
    if (!desktop) return;
    try {
      const v = await invoke<Voice[]>("list_voices");
      setVoices(v);
      setSettings((s) => ({
        ...s,
        voiceId:
          s.voiceId.startsWith("local:") || v.some((x) => x.id === s.voiceId)
            ? s.voiceId
            : (v[0]?.id ?? ""),
      }));
    } catch (e) {
      fail(e);
    }
  }, [fail]);
  useEffect(() => {
    if (!desktop) {
      setSettingsReady(true);
      return;
    }
    let disposed = false;
    void Promise.allSettled([
      invoke<Settings>("get_settings"),
      invoke<Lesson[]>("list_lessons"),
      invoke<Voice[]>("list_voices"),
    ]).then(([saved, library, available]) => {
      if (disposed) return;
      if (library.status === "fulfilled") setLessons(library.value);
      else fail(library.reason);
      if (available.status === "fulfilled") setVoices(available.value);
      else fail(available.reason);
      if (saved.status === "fulfilled") {
        const s = saved.value;
        const v = available.status === "fulfilled" ? available.value : null;
        setSettings({
          ...s,
          voiceId: v
            ? s.voiceId.startsWith("local:") ||
              v.some((x) => x.id === s.voiceId)
              ? s.voiceId
              : (v[0]?.id ?? "")
            : s.voiceId,
        });
        setSettingsReady(true);
      } else fail(saved.reason);
    });
    return () => {
      disposed = true;
    };
  }, [fail]);
  useEffect(() => {
    if (!desktop || !settingsReady) return;
    const timeout = setTimeout(() => {
      void invoke("save_settings", { settings }).catch(fail);
    }, 350);
    return () => clearTimeout(timeout);
  }, [settings, settingsReady, fail]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: undefined | (() => void);
    void listen<SpeechEvent>("speech", ({ payload: e }) => {
      const p = playerRef.current;
      if (e.kind === "error" && !e.id) {
        clearTimer();
        changePlayer({
          ...p,
          requestId: null,
          status: "idle",
          continuous: false,
        });
        fail(e.message ?? "Spraak niet beschikbaar.", e.details);
        return;
      }
      if (!acceptsEvent(p, e)) return;
      if (e.kind === "started") changePlayer({ ...p, status: "playing" });
      if (e.kind === "paused") changePlayer({ ...p, status: "paused" });
      if (e.kind === "error") {
        clearTimer();
        changePlayer({
          ...p,
          requestId: null,
          status: "idle",
          continuous: false,
        });
        fail(e.message ?? "Afspelen mislukt.", e.details);
      }
      if (e.kind === "cancelled")
        changePlayer({
          ...p,
          requestId: null,
          status: "idle",
          continuous: false,
        });
      if (e.kind === "finished") {
        const last =
          p.position === "sentence" &&
          p.index === lessonRef.current.sentences.length - 1;
        if (p.position === "sentence") persist(p.index, last);
        if (
          !last &&
          p.continuous &&
          settingsRef.current.autoAdvance &&
          p.status === "paused"
        ) {
          pausedGap.current = true;
          changePlayer({ ...p, status: "paused" });
        } else if (!last && p.continuous && settingsRef.current.autoAdvance) {
          changePlayer({ ...p, status: "gap" });
          timer.current = setTimeout(() => {
            timer.current = null;
            if (
              playerRef.current.requestId === e.id &&
              playerRef.current.status === "gap"
            )
              void play(p.position === "title" ? 0 : p.index + 1, true);
          }, settingsRef.current.gapMs);
        } else
          changePlayer({
            ...p,
            requestId: null,
            status: "idle",
            continuous: false,
          });
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(fail);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [changePlayer, clearTimer, fail, persist, play]);
  useEffect(() => {
    generationMounted.current = true;
    return () => {
      generationMounted.current = false;
      clearTimer();
      if (desktop) {
        void invoke("speech_control", {
          action: "stop",
          id: "",
          text: null,
          voiceId: null,
          rate: null,
        });
      }
    };
  }, [clearTimer]);
  useEffect(() => {
    if (["playing", "gap"].includes(player.status)) {
      (player.position === "title"
        ? titleElement.current
        : sentenceElement.current
      )?.scrollIntoView?.({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [player.index, player.position, player.status, view]);
  const navigate = async (next: Tab) => {
    try {
      await stop();
      if (next === "Oefenen" || next === "Archief") {
        const archived = next === "Archief";
        if (
          Boolean(lessonRef.current.archivedAt) !== archived ||
          (archived && lessonRef.current.id === "demo")
        ) {
          const candidate = lessons.find(
            (l) =>
              Boolean(l.archivedAt) === archived &&
              l.level === settingsRef.current.level,
          );
          if (candidate) {
            lessonRef.current = candidate;
            setLesson(candidate);
            changePlayer({
              ...initialPlayer,
              index: resumeIndex(
                candidate.progress.lastSentence,
                candidate.sentences.length,
              ),
            });
          }
        }
      }
      setTab(next);
      setError("");
      setNotice("");
    } catch (e) {
      fail(e);
    }
  };
  const loadNews = useCallback(async () => {
    if (!desktop) return;
    const ticket = ++newsEpoch.current;
    setNewsLoading(true);
    setError("");
    try {
      const rows = await invoke<NewsItem[]>("fetch_news", { region });
      if (ticket === newsEpoch.current) setNews(rows);
    } catch (e) {
      if (ticket === newsEpoch.current) {
        setNews([]);
        fail(e);
      }
    } finally {
      if (ticket === newsEpoch.current) setNewsLoading(false);
    }
  }, [region, fail]);
  useEffect(() => {
    void loadNews();
    return () => {
      newsEpoch.current++;
    };
  }, [loadNews]);
  useEffect(() => {
    if (customOpen) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [customOpen]);
  const generate = async (item: NewsItem | null = null) => {
    if (generationLock.current || !settingsReady || !desktop) return;
    generationLock.current = true;
    generationCancelled.current = false;
    const capturedSettings = { ...settingsRef.current };
    const source = item ?? customSource;
    const title = item?.title ?? pastedTitle.trim();
    let body = text;
    setSelected(item);
    setNotesTarget(null);
    setGenerating(true);
    setError("");
    setNotice("");
    setFailedNews(null);
    setExtractionFailed(false);
    try {
      if (item) {
        setArticleLoading(true);
        try {
          body = await Promise.race([
            invoke<string>("fetch_article", { url: item.url }),
            new Promise<never>((_, reject) => {
              cancelRetrieval.current = () =>
                reject(new Error("Generatie geannuleerd."));
            }),
          ]);
          if (body.trim().split(/\s+/).length < 50 || body.length > 60000)
            throw new Error(
              "De artikeltekst is onvolledig. Plak zelf het volledige nieuwsbericht.",
            );
        } catch (e) {
          if (!generationCancelled.current) setExtractionFailed(true);
          throw e;
        } finally {
          cancelRetrieval.current = null;
          setArticleLoading(false);
        }
      }
      if (!title || title.length > 1000)
        throw new Error(
          "Geef het nieuwsbericht een titel (maximaal 1000 tekens).",
        );
      if (body.trim().split(/\s+/).length < 50 || body.length > 60000)
        throw new Error("Plak minimaal 50 woorden, maximaal 60000 tekens.");
      await invoke("save_settings", { settings: capturedSettings });
      let sourceGroupId = source?.url ?? sourceIds.current.get(body);
      if (!sourceGroupId) {
        sourceGroupId = crypto.randomUUID();
        sourceIds.current.set(body, sourceGroupId);
      }
      if (generationCancelled.current || !generationMounted.current)
        throw new Error("Generatie geannuleerd.");
      const result = await invoke<Lesson>("generate_lesson", {
        title,
        sourceGroupId,
        text: body,
        level: capturedSettings.level,
        source: source?.source ?? "Zelf geplakte nieuwsbron",
        sourceUrl: source?.url ?? null,
      });
      if (!generationMounted.current) return;
      await stop();
      setLessons((ls) => [result, ...ls.filter((l) => l.id !== result.id)]);
      lessonRef.current = result;
      setLesson(result);
      changePlayer({ ...initialPlayer, position: "title" });
      setTab("Oefenen");
      if (!item) {
        setCustomOpen(false);
        setText("");
        setPastedTitle("");
        setCustomSource(null);
      }
      setNotice("Je oefening is opgeslagen en klaar om te beluisteren.");
    } catch (e) {
      if (item && !generationCancelled.current) setFailedNews(item);
      fail(e);
    } finally {
      generationLock.current = false;
      setGenerating(false);
    }
  };
  const cancelGeneration = () => {
    generationCancelled.current = true;
    if (cancelRetrieval.current) cancelRetrieval.current();
    else void invoke("cancel_generation").catch(fail);
  };
  const pasteFailedArticle = () => {
    if (!failedNews) return;
    setCustomSource(failedNews);
    setPastedTitle(failedNews.title);
    setText("");
    setCustomOpen(true);
    setFailedNews(null);
    setError("");
  };
  const cancelQuestion = useCallback(async () => {
    generationCancelled.current = true;
    await invoke("cancel_generation");
  }, []);
  const askExerciseQuestion = async (
    question: string,
    sentenceIndex: number | null,
  ) => {
    if (generationLock.current)
      throw new Error("Wacht tot de lopende aanvraag klaar is.");
    const id = lesson.id;
    generationLock.current = true;
    generationCancelled.current = false;
    setGenerating(true);
    setQuestionBusy(id);
    try {
      await invoke("save_settings", { settings: settingsRef.current });
      if (generationCancelled.current) throw new Error("Vraag geannuleerd.");
      return await invoke<{ answer: string }>("ask_exercise_question", {
        id,
        question,
        sentenceIndex,
      });
    } finally {
      generationLock.current = false;
      if (generationMounted.current) {
        setGenerating(false);
        setQuestionBusy(null);
      }
    }
  };
  const addTitleTranslation = async () => {
    if (generationLock.current) return;
    const target = lessonRef.current;
    generationLock.current = true;
    generationCancelled.current = false;
    setGenerating(true);
    setTitleBusy(true);
    setError("");
    try {
      await invoke("save_settings", { settings: settingsRef.current });
      if (generationCancelled.current)
        throw new Error("Generatie geannuleerd.");
      const updated = await invoke<Lesson>("generate_title_translation", {
        id: target.id,
      });
      setLessons((ls) =>
        ls.map((l) =>
          l.id === target.id ? { ...l, titleNl: updated.titleNl } : l,
        ),
      );
      setLesson((l) =>
        l.id === target.id ? { ...l, titleNl: updated.titleNl } : l,
      );
    } catch (e) {
      fail(e);
    } finally {
      generationLock.current = false;
      if (generationMounted.current) {
        setGenerating(false);
        setTitleBusy(false);
      }
    }
  };
  const addLanguageNotes = async (grammar = false) => {
    const field = grammar ? "grammarNotes" : "languageNotes";
    if (generationLock.current) return;
    const target = lessonRef.current;
    if (target.id === "demo" || target[field]?.length) return;
    generationLock.current = true;
    generationCancelled.current = false;
    setGenerating(true);
    setNotesTarget({
      id: target.id,
      title: target.title,
      level: target.level,
      grammar,
    });
    setError("");
    setNotice("");
    try {
      await invoke("save_settings", { settings: settingsRef.current });
      if (generationCancelled.current)
        throw new Error("Generatie geannuleerd.");
      const result = await invoke<Lesson>(
        grammar ? "generate_grammar_notes" : "generate_language_notes",
        {
          id: target.id,
        },
      );
      if (!generationMounted.current) return;
      // Only merge notes: playback and archive changes may have happened meanwhile.
      setLessons((ls) =>
        ls.map((l) =>
          l.id === target.id ? { ...l, [field]: result[field] } : l,
        ),
      );
      setLesson((l) =>
        l.id === target.id ? { ...l, [field]: result[field] } : l,
      );
      setNotice(
        `Vijf ${grammar ? "grammatica-elementen" : "taalbijzonderheden"} opgeslagen voor “${target.title}”.`,
      );
    } catch (e) {
      fail(e);
    } finally {
      generationLock.current = false;
      setGenerating(false);
      setNotesTarget(null);
    }
  };
  const openLesson = async (l: Lesson, index?: number, speak = false) => {
    try {
      await stop();
      lessonRef.current = l;
      setLesson(l);
      changePlayer({
        ...initialPlayer,
        index: resumeIndex(
          index ?? l.progress.lastSentence,
          l.sentences.length,
        ),
      });
      setTab(l.archivedAt ? "Archief" : "Oefenen");
      if (index !== undefined) persist(resumeIndex(index, l.sentences.length));
      if (speak) await play(index ?? l.progress.lastSentence, false);
      setError("");
    } catch (e) {
      fail(e);
    }
  };
  const archiveLesson = async (target: Lesson, archived: boolean) => {
    if (target.id === "demo" || archiveLock.current) return;
    archiveLock.current = true;
    setArchiveBusy(true);
    try {
      if (lessonRef.current.id === target.id) await stop();
      const saved = await invoke<Lesson>("set_lesson_archived", {
        id: target.id,
        archived,
      });
      setLessons((ls) =>
        ls.map((l) =>
          l.id === target.id ? { ...l, archivedAt: saved.archivedAt } : l,
        ),
      );
      setLesson((l) =>
        l.id === target.id ? { ...l, archivedAt: saved.archivedAt } : l,
      );
      setNotice(
        archived
          ? "Oefening afgevinkt en naar het archief verplaatst."
          : "Oefening teruggezet naar actieve oefeningen.",
      );
    } catch (e) {
      fail(e);
    } finally {
      archiveLock.current = false;
      setArchiveBusy(false);
    }
  };
  const toggle = async () => {
    const p = playerRef.current;
    try {
      if (p.status === "playing") {
        changePlayer({ ...p, status: "paused" });
        await speech("pause");
      } else if (p.status === "gap") {
        clearTimer();
        pausedGap.current = true;
        changePlayer({ ...p, status: "paused" });
      } else if (p.status === "paused") {
        if (pausedGap.current) {
          pausedGap.current = false;
          await play(p.position === "title" ? 0 : p.index + 1, p.continuous);
        } else if (p.requestId) {
          await speech("resume");
          changePlayer({ ...p, status: "playing" });
        }
      } else if (p.status !== "loading") await play(p.index, true, p.position);
    } catch (e) {
      fail(e);
    }
  };
  const sourceLink = (url: string) =>
    void invoke("open_source", { url }).catch(fail);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const generationStatus = (
    <div className="generation" role="status">
      <span className="spinner" />
      {titleBusy
        ? "Codex vertaalt de titel…"
        : articleLoading
          ? "Artikeltekst ophalen…"
          : notesTarget
            ? `Codex maakt ${notesTarget.grammar ? "grammatica-uitleg" : "taalbijzonderheden"} (${notesTarget.level}) voor “${notesTarget.title}”…`
            : `Codex maakt je ${settings.level}-oefening…`}
      <button onClick={cancelGeneration}>Annuleren</button>
    </div>
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol">h.</span>
          <div>
            hej<span>Zweeds, elke dag</span>
          </div>
        </div>
        <p className="nav-label">JOUW LEERPLEK</p>
        <nav>
          {(["Nieuws", "Oefenen", "Archief", "Instellingen"] as Tab[]).map(
            (name, i) => (
              <button
                key={name}
                aria-label={name}
                className={tab === name ? "nav-item active" : "nav-item"}
                onClick={() => void navigate(name)}
              >
                <span>{["◈", "▷", "▤", "⚙"][i]}</span>
                {name}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-dot" /> Lokale systeemspraak
          <p>Luisteren kan ook offline.</p>
        </div>
      </aside>
      <main>
        <header>
          <span>ZWEEDS LEREN MET NIEUWS</span>
          <div
            className="main-toolbar"
            role="group"
            aria-label="Oefening maken en taalniveau"
          >
            <div className="toolbar-level" role="group" aria-label="Taalniveau">
              <strong>Taalniveau</strong>
              {(["A1", "A2", "B1"] as Level[]).map((l) => (
                <button
                  key={l}
                  aria-pressed={settings.level === l}
                  className={settings.level === l ? "selected" : ""}
                  disabled={generating || !settingsReady}
                  onClick={() => update("level", l)}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              className="primary"
              disabled={generating || !settingsReady}
              onClick={() => {
                setError("");
                setCustomOpen(true);
              }}
            >
              Eigen tekst toevoegen
            </button>
          </div>
        </header>
        {!desktop && (
          <div className="banner">
            Dit is een browserpreview. Start <code>npm run desktop</code> voor
            nieuws, Codex en lokale spraak.
          </div>
        )}
        {error && !customOpen && (
          <div className="alert" role="alert">
            <div>
              <span>{error}</span>
              {errorDetails && (
                <details className="speech-error-details">
                  <summary>Technische details</summary>
                  <pre>{errorDetails}</pre>
                </details>
              )}
            </div>
            <button aria-label="Melding sluiten" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {failedNews && !generating && (
          <div className="source-actions">
            <button className="quiet" onClick={() => void generate(failedNews)}>
              Opnieuw proberen
            </button>
            {extractionFailed && (
              <button className="quiet" onClick={pasteFailedArticle}>
                Tekst zelf plakken
              </button>
            )}
          </div>
        )}
        {generating && !customOpen && !questionBusy && generationStatus}
        <dialog
          ref={dialog}
          className="custom-dialog composer"
          aria-labelledby="custom-heading"
          onCancel={(e) => {
            e.preventDefault();
            if (!generating) setCustomOpen(false);
          }}
        >
          <div className="section-toolbar">
            <h2 id="custom-heading">Eigen tekst toevoegen</h2>
            <button
              className="quiet"
              aria-label="Dialoog sluiten"
              disabled={generating}
              onClick={() => setCustomOpen(false)}
            >
              ×
            </button>
          </div>
          <p>
            Plak een Zweedse artikeltekst. Codex maakt er een {settings.level}
            -oefening van.
          </p>
          {customSource && (
            <button
              className="quiet"
              onClick={() => sourceLink(customSource.url)}
            >
              Lees origineel ↗
            </button>
          )}
          <label htmlFor="pasted-title">Titel van het nieuwsbericht</label>
          <input
            id="pasted-title"
            value={pastedTitle}
            autoFocus
            onChange={(e) => setPastedTitle(e.target.value)}
            maxLength={1000}
            disabled={generating}
            required
            placeholder="Geef je nieuwsbericht een titel…"
          />
          <label htmlFor="article">Zweedse brontekst</label>
          <textarea
            id="article"
            placeholder="Plak hier het volledige Zweedse nieuwsbericht…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={generating}
            maxLength={60000}
          />
          <div className="field-meta">{words} woorden · minimaal 50</div>
          <p className="level-help">
            Taalniveau: {settings.level} · wijzig dit in het hoofdmenu.
          </p>
          {error && customOpen && <p role="alert">{error}</p>}
          {generating && customOpen && generationStatus}
          <button
            className="primary wide"
            onClick={() => void generate()}
            disabled={
              !desktop ||
              !settingsReady ||
              generating ||
              words < 50 ||
              !pastedTitle.trim()
            }
          >
            Maak oefening →
          </button>
          <p className="fineprint">
            Ongeveer 12 zinnen · Nederlandse vertaling
            <br />
            Tekst via Codex CLI. Stem via je computer.
          </p>
        </dialog>
        {tab === "Nieuws" && (
          <>
            <div className="page-title">
              <div>
                <p className="eyebrow">VERHALEN OM VAN TE LEREN</p>
                <h1>Wat gebeurt er in Zweden?</h1>
                <p>
                  Kies een nieuwsbericht. Oefen op jouw niveau, zin voor zin.
                </p>
              </div>
              <button className="quiet" onClick={() => void openLesson(demo)}>
                Probeer een voorbeeld ↗
              </button>
            </div>
            <div className="news-layout">
              <section>
                <div className="section-toolbar">
                  <div className="segmented">
                    <button
                      className={region === "national" ? "selected" : ""}
                      onClick={() => setRegion("national")}
                    >
                      Landelijk
                    </button>
                    <button
                      className={region === "smaland" ? "selected" : ""}
                      onClick={() => setRegion("smaland")}
                    >
                      Småland
                    </button>
                  </div>
                  <button
                    className="quiet"
                    onClick={() => void loadNews()}
                    disabled={newsLoading || !desktop}
                  >
                    {newsLoading ? "Ophalen…" : "↻ Vernieuwen"}
                  </button>
                </div>
                <div className="news-list">
                  {news.length === 0 && !newsLoading ? (
                    <div className="empty">
                      <span>◈</span>
                      <h3>Je volgende verhaal begint hier</h3>
                      <p>
                        {desktop
                          ? "Geen nieuws beschikbaar. Probeer vernieuwen of plak zelf een nieuwsbericht."
                          : "Bekijk alvast de voorbeeldoefening of open de desktopapp."}
                      </p>
                    </div>
                  ) : (
                    news.map((item) => (
                      <button
                        className={`news-card ${selected?.id === item.id ? "chosen" : ""}`}
                        key={item.id}
                        onClick={() => void generate(item)}
                        disabled={generating || !settingsReady}
                      >
                        <div className="card-meta">
                          {item.source}
                          <span>
                            {item.publishedAt
                              ? new Date(item.publishedAt).toLocaleDateString(
                                  "nl-NL",
                                  { day: "numeric", month: "short" },
                                )
                              : ""}
                          </span>
                        </div>
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                        <span className="card-link">
                          Maak {settings.level}-oefening →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
        {(tab === "Oefenen" || tab === "Archief") && (
          <div className="practice-layout">
            <LessonBrowser
              lessons={lessons}
              level={settings.level}
              archived={tab === "Archief"}
              filter={filters[tab === "Archief" ? "archive" : "active"]}
              onFilter={(filter) =>
                setFilters((f) => ({
                  ...f,
                  [tab === "Archief" ? "archive" : "active"]: filter,
                }))
              }
              selectedId={lesson.id}
              onOpen={(l, index, speak) => void openLesson(l, index, speak)}
              onArchive={(l, archived) => void archiveLesson(l, archived)}
              busy={archiveBusy}
            />
            <section className="lesson-detail">
              {Boolean(lesson.archivedAt) === (tab === "Archief") ? (
                <>
                  <div className="page-title">
                    <div>
                      <p className="eyebrow">LUISTER. LEES. HERHAAL.</p>
                      <h1
                        ref={titleElement}
                        lang="sv"
                        className={
                          player.position === "title"
                            ? "active-title"
                            : undefined
                        }
                      >
                        {lesson.title}
                      </h1>
                      {settings.showTranslation && lesson.titleNl && (
                        <p lang="nl" className="title-translation">
                          {lesson.titleNl}
                        </p>
                      )}
                      <div className="title-controls">
                        <button
                          className="quiet"
                          aria-label="Titel afspelen"
                          onClick={() => void play(0, false, "title")}
                        >
                          ▷ Titel beluisteren
                        </button>
                        {!lesson.titleNl && lesson.id !== "demo" && (
                          <button
                            className="quiet"
                            disabled={!desktop || !settingsReady || generating}
                            onClick={() => void addTitleTranslation()}
                          >
                            Titelvertaling toevoegen
                          </button>
                        )}
                      </div>
                      <p>
                        {lesson.source} · {lesson.level} ·{" "}
                        {lesson.sentences.length} zinnen{" "}
                        {lesson.sourceUrl && (
                          <button
                            className="text-link"
                            onClick={() => sourceLink(lesson.sourceUrl!)}
                          >
                            Origineel ↗
                          </button>
                        )}
                      </p>
                    </div>
                    <div className="lesson-actions">
                      {lesson.id !== "demo" &&
                        (lesson.archivedAt ? (
                          <button
                            className="quiet"
                            disabled={archiveBusy}
                            onClick={() => void archiveLesson(lesson, false)}
                          >
                            Terug naar actieve oefeningen
                          </button>
                        ) : (
                          <label>
                            <input
                              type="checkbox"
                              checked={false}
                              disabled={archiveBusy}
                              onChange={() => void archiveLesson(lesson, true)}
                            />{" "}
                            Gedaan
                          </label>
                        ))}
                      <span className="pill">
                        {player.position === "title"
                          ? "Titel"
                          : `${player.index + 1} / ${lesson.sentences.length}`}
                      </span>
                    </div>
                  </div>
                  <section className="player-panel">
                    <div className="player-controls">
                      <button
                        className="round"
                        aria-label="Naar het begin"
                        title="Naar het begin"
                        onClick={() => void play(0, true, "title")}
                      >
                        <span aria-hidden="true">⏮</span>
                      </button>
                      <button
                        className="round"
                        aria-label="Vorige zin"
                        onClick={() =>
                          void play(
                            Math.max(0, player.index - 1),
                            player.continuous,
                            player.index === 0 ? "title" : "sentence",
                          )
                        }
                        disabled={player.position === "title"}
                      >
                        ←
                      </button>
                      <button
                        className="primary play-main"
                        onClick={() => void toggle()}
                        disabled={player.status === "loading"}
                      >
                        {player.status === "loading"
                          ? "Starten…"
                          : ["playing", "gap"].includes(player.status)
                            ? "Ⅱ Pauzeren"
                            : player.status === "paused"
                              ? "▶ Hervatten"
                              : "▶ Afspelen"}
                      </button>
                      <button
                        className="round"
                        aria-label="Volgende zin"
                        onClick={() =>
                          void play(
                            player.position === "title" ? 0 : player.index + 1,
                            player.continuous,
                          )
                        }
                        disabled={
                          player.position === "sentence" &&
                          player.index === lesson.sentences.length - 1
                        }
                      >
                        →
                      </button>
                      <button
                        className="quiet"
                        onClick={() => void stop().catch(fail)}
                      >
                        ■ Stoppen
                      </button>
                      <button
                        className="quiet"
                        onClick={() =>
                          void play(player.index, false, player.position)
                        }
                      >
                        ↻ Herhalen
                      </button>
                    </div>
                    <div className="play-options">
                      <label>
                        Tempo{" "}
                        <select
                          value={settings.rate}
                          onChange={(e) =>
                            update("rate", Number(e.target.value))
                          }
                        >
                          {[0.5, 0.65, 0.85, 1, 1.15, 1.3].map((r) => (
                            <option key={r} value={r}>
                              {r === 0.85
                                ? "Rustig"
                                : r === 1
                                  ? "Normaal"
                                  : `${r}×`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.showTranslation}
                          onChange={(e) =>
                            update("showTranslation", e.target.checked)
                          }
                        />{" "}
                        Nederlandse vertaling
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.autoAdvance}
                          onChange={(e) =>
                            update("autoAdvance", e.target.checked)
                          }
                        />{" "}
                        Automatisch doorgaan
                      </label>
                    </div>
                  </section>
                  <div
                    className="segmented reading-switch"
                    aria-label="Leesweergave"
                  >
                    <button
                      className={view === "text" ? "selected" : ""}
                      aria-pressed={view === "text"}
                      onClick={() => setView("text")}
                    >
                      Tekst
                    </button>
                    <button
                      className={view === "sentences" ? "selected" : ""}
                      aria-pressed={view === "sentences"}
                      onClick={() => setView("sentences")}
                    >
                      Losse zinnen
                    </button>
                    <button
                      className={view === "language" ? "selected" : ""}
                      aria-pressed={view === "language"}
                      onClick={() => setView("language")}
                    >
                      Bijzonderheden taal
                    </button>
                    <button
                      className={view === "grammar" ? "selected" : ""}
                      aria-pressed={view === "grammar"}
                      onClick={() => setView("grammar")}
                    >
                      Grammatica
                    </button>
                  </div>
                  {view === "language" || view === "grammar" ? (
                    <LanguageNotes
                      lesson={lesson}
                      grammar={view === "grammar"}
                      generating={generating}
                      loading={
                        generating &&
                        notesTarget?.id === lesson.id &&
                        notesTarget.grammar === (view === "grammar")
                      }
                      canGenerate={desktop && settingsReady}
                      onGenerate={() =>
                        void addLanguageNotes(view === "grammar")
                      }
                    />
                  ) : view === "text" ? (
                    <article
                      className="reading-text"
                      aria-label="Doorlopende oefentekst"
                    >
                      <p lang="sv">
                        {lesson.sentences.map((pair, i) => (
                          <span
                            key={i}
                            ref={
                              player.position === "sentence" &&
                              i === player.index
                                ? (element) => {
                                    sentenceElement.current = element;
                                  }
                                : undefined
                            }
                            className={
                              player.position === "sentence" &&
                              i === player.index
                                ? "active-sentence"
                                : ""
                            }
                          >
                            {pair.sv}{" "}
                          </span>
                        ))}
                      </p>
                      {settings.showTranslation && (
                        <div
                          className="reading-subtitle"
                          aria-label="Vertaling actieve zin"
                        >
                          <span>
                            {player.position === "title"
                              ? "Titel"
                              : `Zin ${player.index + 1}`}
                          </span>
                          <p lang="nl">
                            {player.position === "title"
                              ? lesson.titleNl
                              : lesson.sentences[player.index]?.nl}
                          </p>
                        </div>
                      )}
                    </article>
                  ) : (
                    <div className="sentences">
                      {lesson.sentences.map((pair, i) => (
                        <article
                          key={i}
                          ref={
                            player.position === "sentence" && i === player.index
                              ? (element) => {
                                  sentenceElement.current = element;
                                }
                              : undefined
                          }
                          className={`sentence ${player.position === "sentence" && i === player.index ? "current" : ""}`}
                        >
                          <span className="sentence-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <p lang="sv" className="swedish">
                              {pair.sv}
                            </p>
                            {settings.showTranslation && (
                              <p lang="nl" className="dutch">
                                {pair.nl}
                              </p>
                            )}
                          </div>
                          <button
                            className="sentence-play"
                            aria-label={`Zin ${i + 1} afspelen`}
                            onClick={() => void play(i, false)}
                          >
                            {player.position === "sentence" &&
                            i === player.index &&
                            player.status === "playing"
                              ? "♫"
                              : "▷"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  <p className="fineprint">
                    Alleen Zweeds wordt uitgesproken.{" "}
                    {lesson.id === "demo"
                      ? "Deze voorbeeldtekst wordt niet als oefening opgeslagen."
                      : "Je voortgang wordt automatisch lokaal bewaard."}
                  </p>
                  <ExerciseQuestion
                    key={lesson.id}
                    lesson={lesson}
                    sentenceIndex={
                      player.position === "title" ? null : player.index
                    }
                    onAsk={askExerciseQuestion}
                    onCancel={cancelQuestion}
                    disabledReason={
                      lesson.id === "demo"
                        ? "Vragen stellen is beschikbaar bij opgeslagen oefeningen."
                        : !desktop
                          ? "Open de desktopapp om vragen te stellen."
                          : !settingsReady
                            ? "Instellingen worden geladen…"
                            : generating && questionBusy !== lesson.id
                              ? "Wacht totdat de lopende aanvraag klaar is."
                              : undefined
                    }
                  />
                </>
              ) : (
                <div className="empty">
                  <h2>Kies een oefening</h2>
                  <p>
                    {tab === "Archief"
                      ? "Selecteer een oefening uit het archief."
                      : "Selecteer een actieve oefening of maak een nieuwe vanuit Nieuws."}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
        {tab === "Instellingen" && (
          <>
            <div className="page-title">
              <div>
                <p className="eyebrow">ZO LEER JIJ HET LIEFST</p>
                <h1>Jouw tempo. Jouw stem.</h1>
                <p>
                  Instellingen worden automatisch op deze computer opgeslagen.
                </p>
              </div>
            </div>
            <div className="settings-grid">
              <section className="settings-card">
                <h2>Lokale Zweedse stem</h2>
                <p>
                  Het voorlezen gebeurt op je computer, zonder AI-spraakdienst.
                </p>
                <label htmlFor="voice">Stem</label>
                <select
                  id="voice"
                  value={settings.voiceId}
                  onChange={(e) => update("voiceId", e.target.value)}
                >
                  <option value="">Kies een Zweedse stem</option>
                  {settings.voiceId.startsWith("local:") &&
                    !voices.some((v) => v.id === settings.voiceId) && (
                      <option value={settings.voiceId}>
                        Stem ontbreekt · opnieuw downloaden
                      </option>
                    )}
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.language}
                    </option>
                  ))}
                </select>
                <button className="quiet" onClick={() => void refreshVoices()}>
                  ↻ Stemmen opnieuw controleren
                </button>
                {settings.voiceId.startsWith("local:") &&
                  !voices.some((v) => v.id === settings.voiceId) && (
                    <p role="alert">
                      De gekozen stem ontbreekt. Download haar hieronder
                      opnieuw.
                    </p>
                  )}
                {desktop && (
                  <DownloadableVoices
                    selected={settings.voiceId}
                    onInstalled={refreshVoices}
                    onSelectTest={async (id) => {
                      await stop();
                      const next = { ...settingsRef.current, voiceId: id };
                      settingsRef.current = next;
                      setSettings(next);
                      await openLesson(demo);
                      await play(0, false);
                    }}
                  />
                )}
                {voices.length === 0 && (
                  <div className="voice-help">
                    <strong>Een Zweedse stem installeren</strong>
                    <p>
                      macOS: Systeeminstellingen → Toegankelijkheid → Gesproken
                      materiaal / Lezen en spreken → Systeemstem → Beheer
                      stemmen. Download een Zweedse stem.
                    </p>
                    <p>
                      Windows: Instellingen → Tijd en taal → Spraak → Stemmen
                      toevoegen → Zweeds. Controleer daarna opnieuw.
                    </p>
                  </div>
                )}
                <label htmlFor="gap">Pauze tussen zinnen</label>
                <select
                  id="gap"
                  value={settings.gapMs}
                  onChange={(e) => update("gapMs", Number(e.target.value))}
                >
                  {[0, 500, 1000, 2000, 3000, 5000].map((ms) => (
                    <option key={ms} value={ms}>
                      {ms / 1000} seconden
                    </option>
                  ))}
                </select>
                <button
                  className="primary"
                  disabled={!settings.voiceId}
                  onClick={() => {
                    void openLesson(demo).then(() => play(0, false));
                  }}
                >
                  Test de stem
                </button>
              </section>
              <section className="settings-card">
                <h2>Codex CLI</h2>
                <p>
                  Codex maakt de oefentekst en Nederlandse vertaling. Gebruik
                  een geïnstalleerde CLI met je eigen login.
                </p>
                <label htmlFor="codex">
                  Uitvoerbaar pad <span>(optioneel)</span>
                </label>
                <input
                  id="codex"
                  placeholder="Automatisch zoeken"
                  value={settings.codexPath}
                  onChange={(e) => update("codexPath", e.target.value)}
                />
                <button
                  className="quiet"
                  disabled={!desktop}
                  onClick={() =>
                    void invoke<string>("detect_codex", {
                      path: settings.codexPath,
                    })
                      .then(setCodex)
                      .catch(fail)
                  }
                >
                  Controleer Codex-pad
                </button>
                {codex && <p className="codex-path">Gevonden: {codex}</p>}
                <div className="voice-help">
                  <strong>Eenmalige voorbereiding</strong>
                  <p>
                    Installeer Codex CLI en voer <code>codex login</code> uit in
                    een terminal. Op Windows kies je het native{" "}
                    <code>codex.exe</code>, geen <code>.cmd</code>-bestand.
                  </p>
                  <p>
                    Voor nieuwe teksten heb je internet en beschikbare
                    Codex-capaciteit nodig. Bestaande oefeningen blijven offline
                    werken.
                  </p>
                </div>
                <p className="fineprint">
                  Taalniveaus zijn didactische richtlijnen, geen gecertificeerde
                  CEFR-beoordeling.
                </p>
              </section>
            </div>
          </>
        )}
        <footer>
          <span>hej — kleine stappen, nieuwe woorden.</span>
          <span>Svenska → Nederlands</span>
        </footer>
      </main>
    </div>
  );
}
