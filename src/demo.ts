import type { Lesson } from "./types";
export const demo: Lesson = {
  id: "demo",
  title: "En regnig dag i Sverige",
  source: "Voorbeeldtekst — geen actueel nieuws",
  sourceUrl: null,
  level: "A1",
  createdAt: "2026-10-10T10:00:00Z",
  progress: { lastSentence: 0, completed: false },
  sentences: [
    ["I dag regnar det i Sverige.", "Vandaag regent het in Zweden."],
    ["Det är kallt på morgonen.", "Het is koud in de ochtend."],
    ["Anna går till busshållplatsen.", "Anna loopt naar de bushalte."],
    ["Hon har en blå jacka.", "Ze heeft een blauwe jas."],
    ["Bussen kommer klockan åtta.", "De bus komt om acht uur."],
    ["Många människor åker till jobbet.", "Veel mensen gaan naar hun werk."],
    ["Barnen går till skolan.", "De kinderen gaan naar school."],
    [
      "På eftermiddagen slutar det regna.",
      "In de middag stopt het met regenen.",
    ],
    ["Solen kommer fram.", "De zon komt tevoorschijn."],
    ["Anna går hem igen.", "Anna loopt weer naar huis."],
    ["Hon dricker varmt te.", "Ze drinkt warme thee."],
    ["I morgon är det en ny dag.", "Morgen is er een nieuwe dag."],
  ].map(([sv, nl]) => ({ sv, nl })),
};
