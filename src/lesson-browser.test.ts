import { describe, expect, it } from "vitest";
import { demo } from "./demo";
import {
  dateKey,
  emptyFilter,
  filterLessons,
  groupLessons,
  periodDefault,
  weekKey,
} from "./lesson-browser";
import type { Lesson } from "./types";
const make = (
  id: string,
  date: string,
  extra: Partial<Lesson> = {},
): Lesson => ({ ...demo, id, createdAt: date, ...extra });
describe("lesson filtering and grouping", () => {
  it("groups article variants by URL and pasted variants by identity, preserving duplicates", () => {
    const groups = groupLessons([
      make("a", "2026-10-11", {
        sourceUrl: "https://www.svt.se/nyheter/a",
        level: "A1",
      }),
      make("b", "2026-10-11", {
        sourceUrl: "https://www.svt.se/nyheter/a",
        level: "A2",
      }),
      make("c", "2026-10-11", {
        sourceUrl: "https://www.svt.se/nyheter/a",
        level: "A2",
      }),
      make("d", "2026-10-11", { sourceUrl: null, sourceGroupId: "pasted" }),
      make("e", "2026-10-11", { sourceUrl: null, sourceGroupId: "pasted" }),
      make("f", "2026-10-11", { sourceUrl: null }),
      make("g", "2026-10-11", { sourceUrl: null }),
    ]);
    expect(groups.map((g) => g.lessons.length)).toEqual([3, 2, 1, 1]);
  });
  it("separates archival from old playback completion and searches title, source and both languages", () => {
    const active = make("a", "2026-10-11", {
      title: "Skola i Småland",
      source: "SVT",
      sentences: [{ sv: "Barnen läser", nl: "De kinderen lezen" }],
      progress: { lastSentence: 0, completed: true },
    });
    const archive = { ...active, id: "b", archivedAt: "2026-10-12" };
    for (const query of ["skol", "SVT", "LÄSER", "kind"]) {
      expect(
        filterLessons([active, archive], false, { ...emptyFilter, query }).map(
          (l) => l.id,
        ),
      ).toEqual(["a"]);
    }
    expect(
      filterLessons([active, archive], true, emptyFilter).map((l) => l.id),
    ).toEqual(["b"]);
  });
  it("combines search and local day/month filtering before grouping", () => {
    const a = make("a", new Date(2026, 9, 11, 0, 1).toISOString(), {
      title: "Regn",
    });
    const b = make("b", new Date(2026, 9, 10, 23, 59).toISOString(), {
      title: "Regn",
    });
    const c = make("c", new Date(2026, 10, 1).toISOString(), { title: "Regn" });
    expect(
      filterLessons([a, b, c], false, {
        query: "reg",
        period: "day",
        date: "2026-10-11",
      }).map((l) => l.id),
    ).toEqual(["a"]);
    expect(
      filterLessons([a, b, c], false, {
        query: "reg",
        period: "month",
        date: "2026-10",
      }).map((l) => l.id),
    ).toEqual(["a", "b"]);
    expect(
      filterLessons([a], false, {
        query: "snow",
        period: "day",
        date: "2026-10-11",
      }),
    ).toEqual([]);
  });
  it("uses ISO weeks Monday through Sunday including week 53 across years", () => {
    expect(weekKey(new Date(2021, 0, 1))).toBe("2020-W53");
    expect(weekKey(new Date(2021, 0, 4))).toBe("2021-W01");
    const dates = [
      new Date(2020, 11, 28),
      new Date(2021, 0, 3, 23, 59),
      new Date(2021, 0, 4),
    ];
    const lessons = dates.map((d, i) => make(String(i), d.toISOString()));
    expect(
      filterLessons(lessons, false, {
        query: "",
        period: "week",
        date: "2020-W53",
      }).map((l) => l.id),
    ).toEqual(["1", "0"]);
    expect(periodDefault("week", dates[0])).toBe("2020-W53");
    expect(dateKey(new Date(2026, 2, 29, 0, 1))).toBe("2026-03-29");
  });
  it("handles local daylight-saving dates without UTC day shifts", () => {
    const dates = [
      new Date(2026, 2, 29, 0, 1),
      new Date(2026, 2, 29, 23, 59),
      new Date(2026, 9, 25, 0, 1),
      new Date(2026, 9, 25, 23, 59),
    ];
    const lessons = dates.map((date, index) =>
      make(String(index), date.toISOString()),
    );
    expect(
      filterLessons(lessons, false, {
        query: "",
        period: "day",
        date: "2026-03-29",
      }).map((l) => l.id),
    ).toEqual(["1", "0"]);
    expect(
      filterLessons(lessons, false, {
        query: "",
        period: "day",
        date: "2026-10-25",
      }).map((l) => l.id),
    ).toEqual(["3", "2"]);
  });
});

it("combines level with archival, search and date before grouping", () => {
  const variants = [
    make("a1", "2026-10-11", { level: "A1", title: "Regn" }),
    make("a2", "2026-10-11", { level: "A2", title: "Regn" }),
    make("old", "2026-09-11", { level: "A2", title: "Regn" }),
    make("archive", "2026-10-11", {
      level: "A2",
      title: "Regn",
      archivedAt: "2026-10-12",
    }),
  ];
  const filter = { query: "REG", period: "month" as const, date: "2026-10" };
  expect(filterLessons(variants, false, filter, "A2").map((l) => l.id)).toEqual(
    ["a2"],
  );
  expect(filterLessons(variants, true, filter, "A2").map((l) => l.id)).toEqual([
    "archive",
  ]);
  expect(filterLessons(variants, true, filter, "B1")).toEqual([]);
});
