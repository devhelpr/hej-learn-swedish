import { useEffect, useRef, useState } from "react";
import type { Lesson } from "./types";

interface Props {
  lesson: Lesson;
  sentenceIndex: number | null;
  onAsk: (
    question: string,
    sentenceIndex: number | null,
  ) => Promise<{ answer: string }>;
  onCancel: () => Promise<void>;
  disabledReason?: string;
}

export default function ExerciseQuestion({
  lesson,
  sentenceIndex,
  onAsk,
  onCancel,
  disabledReason,
}: Props) {
  const disabled = Boolean(disabledReason);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const [submittedIndex, setSubmittedIndex] = useState<number | null>(
    sentenceIndex,
  );

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const contextIndex = busy || answer || error ? submittedIndex : sentenceIndex;
  const [cancelling, setCancelling] = useState(false);
  const lock = useRef(false);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (lock.current) {
        cancelled.current = true;
        void cancelRef.current().catch(() => {});
      }
    };
  }, []);
  return (
    <section className="exercise-question" aria-labelledby="question-heading">
      <h2 id="question-heading">Vraag over deze oefening</h2>
      <p>
        {lesson.title} · {lesson.level}
      </p>
      {disabledReason && <p className="fineprint">{disabledReason}</p>}
      <p id="question-help">
        Stel een vraag over de tekst, vertaling, grammatica of uitspraak. Vragen
        buiten de oefening kun je aan ChatGPT stellen.
      </p>
      <div className="question-context">
        <span>
          {contextIndex === null ? "Titel" : `Zin ${contextIndex + 1}`} als
          context · de hele oefening wordt meegenomen
        </span>
        <p lang="sv">
          {contextIndex === null
            ? lesson.title
            : lesson.sentences[contextIndex]?.sv}
        </p>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || lock.current || !question.trim()) return;
          lock.current = true;
          cancelled.current = false;
          setSubmittedIndex(sentenceIndex);
          setBusy(true);
          setError("");
          setAnswer("");
          try {
            const result = await onAsk(question.trim(), sentenceIndex);
            if (cancelled.current) throw new Error("Vraag geannuleerd.");
            if (mounted.current) setAnswer(result.answer);
          } catch (e) {
            if (mounted.current)
              setError(e instanceof Error ? e.message : String(e));
          } finally {
            lock.current = false;
            if (mounted.current) {
              setBusy(false);
              setCancelling(false);
            }
          }
        }}
      >
        <label htmlFor="exercise-question">Je vraag</label>
        <textarea
          id="exercise-question"
          aria-describedby="question-help"
          maxLength={2000}
          placeholder="Bijvoorbeeld: waarom staat het werkwoord hier vóór het onderwerp?"
          value={question}
          disabled={busy}
          onChange={(e) => {
            setQuestion(e.target.value);
            setAnswer("");
            setError("");
          }}
        />
        <div className="section-toolbar">
          <span className="fineprint">{question.length} / 2000 tekens</span>
          <button
            className="primary"
            disabled={disabled || busy || !question.trim()}
            type="submit"
          >
            Vraag stellen
          </button>
          {busy && (
            <button
              className="quiet"
              type="button"
              disabled={cancelling}
              onClick={async () => {
                cancelled.current = true;
                setCancelling(true);
                try {
                  await onCancel();
                } catch (e) {
                  setError(String(e));
                  setCancelling(false);
                }
              }}
            >
              {cancelling ? "Annuleren…" : "Annuleren"}
            </button>
          )}
        </div>
      </form>
      {busy && <p role="status">Je vraag wordt gecontroleerd en beantwoord…</p>}
      {error && <p role="alert">{error}</p>}
      {answer && (
        <section
          className="question-answer"
          role="status"
          aria-label="Antwoord"
        >
          <h3>Antwoord</h3>
          <p>{answer}</p>
        </section>
      )}
      <p className="fineprint">
        AI kan fouten maken. Vragen en antwoorden worden niet opgeslagen.
      </p>
    </section>
  );
}
