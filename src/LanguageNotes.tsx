import type { Lesson } from "./types";
interface Props {
  lesson: Lesson;
  generating: boolean;
  loading: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}
export default function LanguageNotes({
  lesson,
  generating,
  loading,
  canGenerate,
  onGenerate,
}: Props) {
  const notes = lesson.languageNotes ?? [];
  return (
    <section className="language-notes" aria-label="Bijzonderheden taal">
      <h2>Bijzonderheden taal · {lesson.level}</h2>
      <p className="language-intro">
        Vijf elementen uit deze oefentekst, uitgelegd op jouw niveau.
      </p>
      {notes.length === 0 ? (
        <div className="language-empty">
          <p>
            Deze oefening heeft nog geen taalbijzonderheden. Voeg vijf
            uitlegpunten toe op basis van de opgeslagen tekst en het niveau{" "}
            {lesson.level}.
          </p>
          <button
            className="primary"
            disabled={!canGenerate || generating}
            onClick={onGenerate}
          >
            {loading
              ? "Taalbijzonderheden worden gemaakt…"
              : "Taalbijzonderheden toevoegen"}
          </button>
          <p className="fineprint">
            Toevoegen vraagt internet en Codex-toegang. Daarna blijft de uitleg
            offline beschikbaar.
          </p>
        </div>
      ) : (
        <ol className="language-list">
          {notes.map((note, index) => {
            const pair = lesson.sentences[note.sentenceIndex];
            if (!pair) return null;
            const position = pair.sv.indexOf(note.excerpt);
            return (
              <li key={index} className="language-card">
                <span className="language-number">{index + 1}</span>
                <div>
                  <h3>{note.title}</h3>
                  <p className="language-source">
                    Zin {note.sentenceIndex + 1}
                  </p>
                  <blockquote>
                    <p lang="sv">
                      {position < 0 ? (
                        pair.sv
                      ) : (
                        <>
                          {pair.sv.slice(0, position)}
                          <mark>{note.excerpt}</mark>
                          {pair.sv.slice(position + note.excerpt.length)}
                        </>
                      )}
                    </p>
                    <p lang="nl" className="dutch">
                      {pair.nl}
                    </p>
                  </blockquote>
                  <p lang="nl" className="language-explanation">
                    {note.explanation}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
