import type { Lesson } from "./types";
export type Period = "all" | "day" | "week" | "month";
export interface LessonFilter {
  query: string;
  period: Period;
  date: string;
}
export const emptyFilter: LessonFilter = { query: "", period: "all", date: "" };
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(
    ((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}
export function periodDefault(period: Period, now = new Date()): string {
  return period === "week"
    ? weekKey(now)
    : period === "month"
      ? dateKey(now).slice(0, 7)
      : period === "day"
        ? dateKey(now)
        : "";
}
export function filterLessons(
  lessons: Lesson[],
  archived: boolean,
  filter: LessonFilter,
): Lesson[] {
  const query = filter.query.trim().toLocaleLowerCase("nl-NL");
  return lessons
    .filter((lesson) => {
      if (Boolean(lesson.archivedAt) !== archived) return false;
      const searchable = [
        lesson.title,
        lesson.source,
        ...lesson.sentences.flatMap((s) => [s.sv, s.nl]),
      ]
        .join(" ")
        .toLocaleLowerCase("nl-NL");
      if (query && !searchable.includes(query)) return false;
      if (filter.period === "all") return true;
      const date = new Date(lesson.createdAt);
      if (Number.isNaN(date.getTime()) || !filter.date) return false;
      const key =
        filter.period === "week"
          ? weekKey(date)
          : filter.period === "month"
            ? dateKey(date).slice(0, 7)
            : dateKey(date);
      return key === filter.date;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function groupLessons(
  lessons: Lesson[],
): { id: string; title: string; lessons: Lesson[] }[] {
  const groups = new Map<
    string,
    { id: string; title: string; lessons: Lesson[] }
  >();
  for (const lesson of lessons) {
    const id = lesson.sourceUrl
      ? `url:${lesson.sourceUrl}`
      : lesson.sourceGroupId
        ? `source:${lesson.sourceGroupId}`
        : `lesson:${lesson.id}`;
    const group = groups.get(id) ?? { id, title: lesson.title, lessons: [] };
    group.lessons.push(lesson);
    groups.set(id, group);
  }
  return [...groups.values()];
}
