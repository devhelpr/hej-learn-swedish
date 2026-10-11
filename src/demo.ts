import type { Lesson } from "./types";
export const demo: Lesson = {
  id: "demo",
  title: "En regnig dag i Sverige",
  source: "Voorbeeldtekst — geen actueel nieuws",
  sourceUrl: null,
  level: "A1",
  createdAt: "2026-10-10T10:00:00Z",
  progress: { lastSentence: 0, completed: false },
  languageNotes: [
    {
      title: "Een tijdsaanduiding vooraan",
      sentenceIndex: 0,
      excerpt: "I dag regnar det",
      explanation:
        "I dag betekent vandaag. Als je de zin daarmee begint, komt het werkwoord regnar vóór het onderwerp det. Letterlijk staat er dus: vandaag regent het.",
    },
    {
      title: "Det bij het weer",
      sentenceIndex: 1,
      excerpt: "Det är kallt",
      explanation:
        "Det betekent hier het. Je gebruikt det als onderwerp als je vertelt hoe het weer is. Är betekent is en kallt betekent koud: het is koud.",
    },
    {
      title: "Het werkwoord går",
      sentenceIndex: 2,
      excerpt: "går",
      explanation:
        "Går betekent in deze zin loopt of gaat te voet. Dit is een vorm in de tegenwoordige tijd. De vorm blijft gelijk bij bijvoorbeeld jag går (ik loop) en hon går (zij loopt).",
    },
    {
      title: "Een en-woord",
      sentenceIndex: 3,
      excerpt: "en blå jacka",
      explanation:
        "En jacka betekent een jas. Bij het Zweedse woord jacka hoort het lidwoord en. Blå betekent blauw; en blå jacka is dus een blauwe jas. Leer een nieuw zelfstandig naamwoord meteen met en of ett.",
    },
    {
      title: "Het bepaalde lidwoord achteraan",
      sentenceIndex: 4,
      excerpt: "Bussen",
      explanation:
        "En buss betekent een bus. Bussen betekent de bus: de uitgang -en maakt duidelijk dat je een bepaalde bus bedoelt. Het Zweeds zet het bepaalde lidwoord hier achter het woord, waar het Nederlands de vóór het woord zet.",
    },
  ],
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
