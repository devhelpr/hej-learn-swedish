import { useState } from "react";
import type { Lesson } from "./types";
import {
  emptyFilter,
  filterLessons,
  groupLessons,
  periodDefault,
  type LessonFilter,
  type Period,
} from "./lesson-browser";
interface Props {
  lessons: Lesson[];
  archived: boolean;
  filter: LessonFilter;
  onFilter: (filter: LessonFilter) => void;
  selectedId: string;
  onOpen: (lesson: Lesson, index?: number, speak?: boolean) => void;
  onArchive: (lesson: Lesson, archived: boolean) => void;
  busy: boolean;
}
export default function LessonBrowser(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const visible = filterLessons(props.lessons, props.archived, props.filter);
  const total = props.lessons.filter(
    (l) => Boolean(l.archivedAt) === props.archived,
  ).length;
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  return (
    <aside
      className="lesson-browser"
      aria-label={props.archived ? "Oefeningenarchief" : "Actieve oefeningen"}
    >
      <h2>{props.archived ? "Archief" : "Actieve oefeningen"}</h2>
      <label htmlFor="lesson-search">Zoeken</label>
      <input
        id="lesson-search"
        type="search"
        placeholder="Titel, bron of tekst…"
        value={props.filter.query}
        onChange={(e) =>
          props.onFilter({ ...props.filter, query: e.target.value })
        }
      />
      <label htmlFor="lesson-period">Datumfilter</label>
      <select
        id="lesson-period"
        value={props.filter.period}
        onChange={(e) => {
          const period = e.target.value as Period;
          props.onFilter({
            ...props.filter,
            period,
            date: periodDefault(period),
          });
        }}
      >
        <option value="all">Alles</option>
        <option value="day">Dag</option>
        <option value="week">Week</option>
        <option value="month">Maand</option>
      </select>
      {props.filter.period !== "all" && (
        <label className="date-picker">
          {props.filter.period === "day"
            ? "Dag"
            : props.filter.period === "week"
              ? "Week (jjjj-Www)"
              : "Maand"}
          <input
            type={
              props.filter.period === "day"
                ? "date"
                : props.filter.period === "week"
                  ? "week"
                  : "month"
            }
            placeholder={
              props.filter.period === "week" ? "2026-W41" : undefined
            }
            value={props.filter.date}
            onChange={(e) =>
              props.onFilter({ ...props.filter, date: e.target.value })
            }
          />
        </label>
      )}
      <div className="filter-result">
        <span>
          {visible.length} van {total} oefeningen
        </span>
        <button
          className="text-link"
          onClick={() => props.onFilter({ ...emptyFilter })}
        >
          Filters wissen
        </button>
      </div>
      {visible.length === 0 && (
        <p className="tree-empty">
          {total
            ? "Geen oefeningen gevonden. Pas je filters aan."
            : props.archived
              ? "Vink een oefening af om haar hier te bewaren."
              : "Maak een oefening vanuit Nieuws om te beginnen."}
        </p>
      )}
      <ul className="lesson-tree">
        {groupLessons(visible).map((group) => (
          <li key={group.id}>
            <button
              className="tree-heading"
              aria-expanded={!collapsed.has(group.id)}
              onClick={() => setCollapsed(toggle(collapsed, group.id))}
            >
              {collapsed.has(group.id) ? "▸" : "▾"} {group.title}
            </button>
            {!collapsed.has(group.id) && (
              <ul>
                {group.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <div
                      className={`tree-variant ${props.selectedId === lesson.id ? "selected" : ""}`}
                    >
                      <button
                        className="tree-expand"
                        aria-label={`Zinnen ${lesson.level} ${lesson.title}`}
                        aria-expanded={expanded.has(lesson.id)}
                        onClick={() => setExpanded(toggle(expanded, lesson.id))}
                      >
                        {expanded.has(lesson.id) ? "▾" : "▸"}
                      </button>
                      <button
                        className="tree-open"
                        aria-current={
                          props.selectedId === lesson.id ? "true" : undefined
                        }
                        onClick={() => props.onOpen(lesson)}
                      >
                        <strong>{lesson.level}</strong> ·{" "}
                        {new Date(lesson.createdAt).toLocaleString("nl-NL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        <small>
                          Hervat bij zin {lesson.progress.lastSentence + 1}
                        </small>
                      </button>
                      <label className="tree-done">
                        <input
                          type="checkbox"
                          aria-label={`Gedaan ${lesson.level} ${lesson.title}`}
                          checked={Boolean(lesson.archivedAt)}
                          disabled={props.busy}
                          onChange={(e) =>
                            props.onArchive(lesson, e.target.checked)
                          }
                        />
                        Gedaan
                      </label>
                    </div>
                    {expanded.has(lesson.id) && (
                      <ol className="tree-sentences">
                        {lesson.sentences.map((pair, index) => (
                          <li key={index}>
                            <button
                              className="tree-sentence"
                              onClick={() => props.onOpen(lesson, index)}
                            >
                              {pair.sv}
                            </button>
                            <button
                              aria-label={`Zin ${index + 1} van ${lesson.title} afspelen`}
                              className="tree-expand"
                              onClick={() => props.onOpen(lesson, index, true)}
                            >
                              ▷
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
