// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defaults, type SpeechEvent } from "./types";
import { demo } from "./demo";
const backend = vi.hoisted(() => ({
  invoke: vi.fn(),
  listener: null as null | ((event: { payload: SpeechEvent }) => void),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: backend.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (_name: string, listener: (e: { payload: SpeechEvent }) => void) => {
      if (_name === "speech") backend.listener = listener;
      return () => {
        if (_name === "speech") backend.listener = null;
      };
    },
  ),
}));
Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {} });
// jsdom does not implement the native dialog lifecycle or browser focus restoration.
let dialogOpener: HTMLElement | null = null;
HTMLDialogElement.prototype.showModal = function () {
  dialogOpener = document.activeElement as HTMLElement;
  this.setAttribute("open", "");
  this.querySelector<HTMLElement>("[autofocus]")?.focus();
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
  dialogOpener?.focus();
};
const { default: App } = await import("./App");
const calls = () =>
  backend.invoke.mock.calls
    .filter(
      ([cmd, args]) => cmd === "speech_control" && args.action === "speak",
    )
    .map(([, args]) => args);
const emit = async (kind: SpeechEvent["kind"], id: string) => {
  await act(async () => {
    backend.listener?.({ payload: { kind, id } });
  });
};
beforeEach(() => {
  backend.invoke.mockReset();
  backend.listener = null;
  backend.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "get_settings")
      return { ...defaults, level: "A1", voiceId: "alva", gapMs: 30 };
    if (cmd === "list_voices")
      return [{ id: "alva", name: "Alva", language: "sv-SE" }];
    if (cmd === "list_lessons")
      return [
        {
          ...demo,
          id: "saved",
          progress: { lastSentence: 3, completed: false },
        },
      ];
    if (cmd === "set_lesson_archived")
      return { ...demo, id: "saved", archivedAt: "2026-10-11T12:00:00Z" };
    if (cmd === "fetch_news") return [];
  });
});
afterEach(() => cleanup());
async function setup() {
  render(<App />);
  await waitFor(() => expect(backend.listener).not.toBeNull());
  await waitFor(() =>
    expect(
      backend.invoke.mock.calls.some(([cmd]) => cmd === "get_settings"),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Oefenen" }));
  await screen.findByRole("button", { name: "▶ Afspelen" });
}
describe("desktop player workflows", () => {
  it("advances only after completion of the current request", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    const first = calls()[0];
    await emit("started", first.id);
    fireEvent.click(screen.getByRole("button", { name: "Volgende zin" }));
    await waitFor(() => expect(calls()).toHaveLength(2));
    const second = calls()[1];
    await emit("finished", first.id);
    expect(calls()).toHaveLength(2);
    await emit("started", second.id);
    await emit("finished", second.id);
    await waitFor(() => expect(calls()).toHaveLength(3));
    expect(calls()[2].text).toBe(demo.sentences[2].sv);
  });
  it("pauses the gap and resumes at the next sentence", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    await emit("started", calls()[0].id);
    await emit("finished", calls()[0].id);
    fireEvent.click(screen.getByRole("button", { name: "Ⅱ Pauzeren" }));
    expect(screen.getByRole("button", { name: "▶ Hervatten" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "▶ Hervatten" }));
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls()[1].text).toBe(demo.sentences[1].sv);
  });
  it("stops playback on navigation and ignores its late completion", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    const id = calls()[0].id;
    fireEvent.click(screen.getByRole("button", { name: "Archief" }));
    await screen.findByRole("heading", { name: "Archief" });
    await emit("finished", id);
    expect(calls()).toHaveLength(1);
  });
  it("restores the saved sentence from the library", async () => {
    await setup();
    const saved = await screen.findByRole("button", {
      name: /Hervat bij zin 4/,
    });
    fireEvent.click(saved);
    await screen.findByRole("button", { name: "▶ Afspelen" });
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].text).toBe(demo.sentences[3].sv);
  });
  it("keeps saved settings when the speech helper is unavailable", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "get_settings")
        return { ...defaults, codexPath: "/saved/codex", voiceId: "alva" };
      if (cmd === "list_voices") throw new Error("Spraakhulp niet beschikbaar");
      return previous(cmd, args);
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Instellingen" }));
    expect(await screen.findByDisplayValue("/saved/codex")).toBeTruthy();
  });
});

describe("exercise workspace", () => {
  async function openSaved() {
    await setup();
    fireEvent.click(
      await screen.findByRole("button", { name: /Hervat bij zin 4/ }),
    );
    await screen.findByRole("checkbox", { name: "Gedaan" });
  }
  it("switches reading views without interrupting playback and keeps subtitles aligned", async () => {
    await openSaved();
    const subtitle = screen.getByLabelText("Vertaling actieve zin");
    expect(subtitle.textContent).toContain(demo.sentences[3].nl);
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    await emit("started", calls()[0].id);
    const stopCount = backend.invoke.mock.calls.filter(
      ([cmd, args]) => cmd === "speech_control" && args.action === "stop",
    ).length;
    fireEvent.click(screen.getByRole("button", { name: "Losse zinnen" }));
    expect(screen.getByRole("button", { name: "Zin 4 afspelen" })).toBeTruthy();
    expect(
      backend.invoke.mock.calls.filter(
        ([cmd, args]) => cmd === "speech_control" && args.action === "stop",
      ),
    ).toHaveLength(stopCount);
    fireEvent.click(screen.getByRole("button", { name: "Zin 2 afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls()[1].text).toBe(demo.sentences[1].sv);
    fireEvent.click(screen.getByRole("button", { name: "Tekst" }));
    expect(
      screen.getByLabelText("Vertaling actieve zin").textContent,
    ).toContain(demo.sentences[1].nl);
    await emit("finished", calls()[0].id);
    expect(calls()).toHaveLength(2);
  });
  it("archives manually, stops speech and restores the saved sentence", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "set_lesson_archived")
        return {
          ...demo,
          id: "saved",
          archivedAt: args.archived ? "2026-10-11T12:00:00Z" : null,
        };
      return previous(cmd, args);
    });
    await openSaved();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    const id = calls()[0].id;
    fireEvent.click(screen.getByRole("checkbox", { name: "Gedaan" }));
    await screen.findByText(
      "Oefening afgevinkt en naar het archief verplaatst.",
    );
    expect(
      screen.queryByRole("button", { name: /Hervat bij zin 4/ }),
    ).toBeNull();
    await emit("finished", id);
    expect(calls()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Archief" }));
    await screen.findByRole("button", {
      name: "Terug naar actieve oefeningen",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Terug naar actieve oefeningen" }),
    );
    await screen.findByText("Oefening teruggezet naar actieve oefeningen.");
    fireEvent.click(screen.getByRole("button", { name: "Oefenen" }));
    expect(
      await screen.findByRole("button", { name: /Hervat bij zin 4/ }),
    ).toBeTruthy();
  });
  it("keeps a lesson active when archive storage fails", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "set_lesson_archived") throw new Error("Opslaan mislukt");
      return previous(cmd, args);
    });
    await openSaved();
    fireEvent.click(screen.getByRole("checkbox", { name: "Gedaan" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Opslaan mislukt×",
    );
    expect(
      screen.getByRole("button", { name: /Hervat bij zin 4/ }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: "Gedaan" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
  it("does not archive automatically after the last sentence", async () => {
    await openSaved();
    fireEvent.click(screen.getByRole("button", { name: "Losse zinnen" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Zin ${demo.sentences.length} afspelen`,
      }),
    );
    await waitFor(() => expect(calls()).toHaveLength(1));
    await emit("finished", calls()[0].id);
    expect(
      backend.invoke.mock.calls.some(([cmd]) => cmd === "set_lesson_archived"),
    ).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Gedaan" })).toBeTruthy();
  });
  it("jumps from the tree without speaking, and speaks only on its play button", async () => {
    await openSaved();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Zinnen ${demo.level} ${demo.title}`,
      }),
    );
    const tree = screen.getByLabelText("Actieve oefeningen");
    fireEvent.click(
      within(tree).getByRole("button", { name: demo.sentences[1].sv }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Vertaling actieve zin").textContent,
      ).toContain(demo.sentences[1].nl),
    );
    expect(calls()).toHaveLength(0);
    fireEvent.click(
      within(tree).getByRole("button", {
        name: `Zin 3 van ${demo.title} afspelen`,
      }),
    );
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].text).toBe(demo.sentences[2].sv);
  });
  it("keeps separate search filters without stopping speech", async () => {
    await openSaved();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    const before = backend.invoke.mock.calls.length;
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "geen treffer" },
    });
    expect(
      screen.getByText("Geen oefeningen gevonden. Pas je filters aan."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Doorlopende oefentekst")).toBeTruthy();
    expect(backend.invoke.mock.calls.length).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Archief" }));
    await waitFor(() =>
      expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
        "",
      ),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "archiefzoekterm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Oefenen" }));
    await waitFor(() =>
      expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
        "geen treffer",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters wissen" }));
    expect(
      screen.getByRole("button", { name: /Hervat bij zin 4/ }),
    ).toBeTruthy();
  });
  it("requires a pasted title and shares source identity across level variants", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "generate_lesson")
        return {
          ...demo,
          id: crypto.randomUUID(),
          title: args.title,
          level: args.level,
          sourceGroupId: args.sourceGroupId,
        };
      return previous(cmd, args);
    });
    render(<App />);
    await waitFor(() => expect(backend.listener).not.toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: "Eigen tekst toevoegen" }),
    );
    fireEvent.change(screen.getByLabelText("Zweedse brontekst"), {
      target: { value: "nyheter ".repeat(55) },
    });
    expect(
      (
        screen.getByRole("button", {
          name: /Maak oefening/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Titel van het nieuwsbericht"), {
      target: { value: "Nyheter om regn" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Maak oefening/ }));
    await screen.findByRole("heading", { name: "Nyheter om regn" });
    fireEvent.click(screen.getByRole("button", { name: "Nieuws" }));
    fireEvent.click(screen.getByRole("button", { name: "A2" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Eigen tekst toevoegen" }),
    );
    fireEvent.change(screen.getByLabelText("Zweedse brontekst"), {
      target: { value: "nyheter ".repeat(55) },
    });
    fireEvent.change(screen.getByLabelText("Titel van het nieuwsbericht"), {
      target: { value: "Nyheter om regn" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Maak oefening/ }));
    await screen.findByRole("heading", { name: "Nyheter om regn" });
    const generations = backend.invoke.mock.calls
      .filter(([cmd]) => cmd === "generate_lesson")
      .map(([, args]) => args);
    expect(generations).toHaveLength(2);
    expect(generations[0].title).toBe("Nyheter om regn");
    expect(generations[0].sourceGroupId).toBe(generations[1].sourceGroupId);
    expect(generations[1].level).toBe("A2");
    fireEvent.click(screen.getByRole("button", { name: "Nieuws" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Eigen tekst toevoegen" }),
    );
    fireEvent.change(screen.getByLabelText("Titel van het nieuwsbericht"), {
      target: { value: "Nyheter om regn" },
    });
    fireEvent.change(screen.getByLabelText("Zweedse brontekst"), {
      target: { value: "andra nyheter ".repeat(30) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Maak oefening/ }));
    await screen.findByRole("heading", { name: "Nyheter om regn" });
    const changed = backend.invoke.mock.calls
      .filter(([cmd]) => cmd === "generate_lesson")
      .at(-1)![1];
    expect(changed.sourceGroupId).not.toBe(generations[0].sourceGroupId);
  });
  it("keeps other variants active when one exercise is archived", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    const variants = [
      {
        ...demo,
        id: "one",
        title: "Nieuwsbericht",
        sourceUrl: "https://www.svt.se/nyheter/test",
        level: "A1",
      },
      {
        ...demo,
        id: "two",
        title: "Nieuwsbericht",
        sourceUrl: "https://www.svt.se/nyheter/test",
        level: "A2",
      },
    ];
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "list_lessons") return variants;
      if (cmd === "set_lesson_archived")
        return { ...variants[0], archivedAt: "2026-10-11T12:00:00Z" };
      return previous(cmd, args);
    });
    await setup();
    expect(screen.getByText("1 van 1 oefeningen")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Gedaan A1 Nieuwsbericht" }),
    );
    await screen.findByText("0 van 0 oefeningen");
    fireEvent.click(screen.getByRole("button", { name: "A2" }));
    expect(
      screen.getByRole("checkbox", { name: "Gedaan A2 Nieuwsbericht" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archief" }));
    fireEvent.click(screen.getByRole("button", { name: "A1" }));
    await screen.findByRole("checkbox", { name: "Gedaan A1 Nieuwsbericht" });
    expect(
      screen.queryByRole("checkbox", { name: "Gedaan A2 Nieuwsbericht" }),
    ).toBeNull();
  });
  it("passes the exact selected news title to generation", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    const title = "Småland: nya bussar — i dag";
    const url = "https://www.svt.se/nyheter/lokalt/smaland/test";
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "fetch_news")
        return [
          {
            id: "news",
            title,
            source: "SVT Småland",
            url,
            summary: "Nyheter",
            publishedAt: null,
          },
        ];
      if (cmd === "fetch_article") return "Nyheter ".repeat(55);
      if (cmd === "generate_lesson")
        return {
          ...demo,
          id: "new",
          title: args.title,
          sourceUrl: args.sourceUrl,
        };
      return previous(cmd, args);
    });
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Småland: nya bussar/ }),
    );
    await screen.findByRole("heading", { name: title });
    const args = backend.invoke.mock.calls.find(
      ([cmd]) => cmd === "generate_lesson",
    )![1];
    expect(args.title).toBe(title);
    expect(args.sourceUrl).toBe(url);
  });
});

describe.each([
  {
    field: "languageNotes",
    title: "Bijzonderheden taal",
    command: "generate_language_notes",
    add: "Taalbijzonderheden toevoegen",
    loading: "Taalbijzonderheden worden gemaakt…",
  },
  {
    field: "grammarNotes",
    title: "Grammatica",
    command: "generate_grammar_notes",
    add: "Grammatica-uitleg toevoegen",
    loading: "Grammatica-uitleg wordt gemaakt…",
  },
] as const)("$title", ({ field, title, command, add, loading }) => {
  async function openLegacy(archived = false) {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "list_lessons")
        return [
          {
            ...demo,
            id: "saved",
            [field]: undefined,
            archivedAt: archived ? "2026-10-11T12:00:00Z" : null,
            progress: { lastSentence: 3, completed: false },
          },
        ];
      return previous(cmd, args);
    });
    await setup();
    if (archived) {
      fireEvent.click(screen.getByRole("button", { name: "Archief" }));
      await screen.findByRole("button", {
        name: "Terug naar actieve oefeningen",
      });
    } else {
      fireEvent.click(
        await screen.findByRole("button", { name: /Hervat bij zin 4/ }),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: title }));
    await screen.findByRole("button", { name: add });
  }
  it("shows five demo notes with marked Swedish fragments and Dutch translations without stopping speech", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    await emit("started", calls()[0].id);
    const stops = backend.invoke.mock.calls.filter(
      ([cmd, args]) => cmd === "speech_control" && args.action === "stop",
    ).length;
    fireEvent.click(screen.getByRole("button", { name: title }));
    const panel = screen.getByRole("region", { name: title });
    expect(within(panel).getAllByRole("listitem")).toHaveLength(5);
    expect(panel.querySelectorAll("mark")).toHaveLength(5);
    expect(within(panel).getByText(demo.sentences[0].nl)).toBeTruthy();
    expect(within(panel).getByText(demo[field]![0].explanation)).toBeTruthy();
    expect(
      backend.invoke.mock.calls.filter(
        ([cmd, args]) => cmd === "speech_control" && args.action === "stop",
      ),
    ).toHaveLength(stops);
    await emit("finished", calls()[0].id);
    await waitFor(() => expect(calls()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Tekst" }));
    expect(
      screen.getByLabelText("Vertaling actieve zin").textContent,
    ).toContain(demo.sentences[1].nl);
  });
  it("adds notes while preserving newer playback position and archival state", async () => {
    let resolve!: (lesson: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === command) return pending;
      return previous(cmd, args);
    });
    await openLegacy();
    fireEvent.click(screen.getByRole("button", { name: add }));
    await waitFor(() =>
      expect(backend.invoke.mock.calls.some(([cmd]) => cmd === command)).toBe(
        true,
      ),
    );
    expect(
      screen.getByRole("button", {
        name: loading,
      }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Volgende zin" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].text).toBe(demo.sentences[4].sv);
    fireEvent.click(screen.getByRole("checkbox", { name: "Gedaan" }));
    await screen.findByText(
      "Oefening afgevinkt en naar het archief verplaatst.",
    );
    await act(async () => {
      resolve({
        ...demo,
        id: "saved",
        archivedAt: null,
        progress: { lastSentence: 0, completed: false },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Archief" }));
    await screen.findByRole("button", {
      name: "Terug naar actieve oefeningen",
    });
    expect(
      screen.getByRole("button", { name: /Hervat bij zin 5/ }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: title })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(5);
    expect(screen.queryByRole("button", { name: add })).toBeNull();
    expect(
      backend.invoke.mock.calls.filter(([cmd]) => cmd === command),
    ).toHaveLength(1);
  });
  it("supports adding notes directly to an archived lesson", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === command) return { ...demo, id: "saved" };
      return previous(cmd, args);
    });
    await openLegacy(true);
    fireEvent.click(screen.getByRole("button", { name: add }));
    await screen.findByRole("heading", { name: demo[field]![0].title });
    expect(
      screen.getByRole("button", { name: "Terug naar actieve oefeningen" }),
    ).toBeTruthy();
  });
  it("keeps the existing lesson intact on failure and allows a manual retry", async () => {
    let attempts = 0;
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === command) {
        if (++attempts === 1)
          throw new Error("Codex leverde ongeldige taalbijzonderheden.");
        return { ...demo, id: "saved" };
      }
      return previous(cmd, args);
    });
    await openLegacy();
    fireEvent.click(screen.getByRole("button", { name: add }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: /Hervat bij zin 4/ }),
    ).toBeTruthy();
    const retry = screen.getByRole("button", {
      name: add,
    });
    expect(retry).toHaveProperty("disabled", false);
    fireEvent.click(retry);
    await screen.findByRole("heading", { name: demo[field]![0].title });
    expect(attempts).toBe(2);
  });
  it("cancels note generation without adding partial output", async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise((_, r) => {
      reject = r;
    });
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === command) return pending;
      if (cmd === "cancel_generation") {
        reject(new Error("Generatie geannuleerd."));
        return;
      }
      return previous(cmd, args);
    });
    await openLegacy();
    fireEvent.click(screen.getByRole("button", { name: add }));
    await waitFor(() =>
      expect(backend.invoke.mock.calls.some(([cmd]) => cmd === command)).toBe(
        true,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Generatie geannuleerd.×",
    );
    expect(screen.getByRole("button", { name: add })).toHaveProperty(
      "disabled",
      false,
    );
    expect(
      screen.getByRole("button", { name: /Hervat bij zin 4/ }),
    ).toBeTruthy();
  });
  it("does not start a CLI generation if cancelled while settings are being saved", async () => {
    await openLegacy();
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "save_settings") return pending;
      return previous(cmd, args);
    });
    fireEvent.click(screen.getByRole("button", { name: add }));
    fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
    await act(async () => {
      resolve();
    });
    await screen.findByRole("alert");
    expect(backend.invoke.mock.calls.some(([cmd]) => cmd === command)).toBe(
      false,
    );
  });
  it("reads persisted notes offline without requesting Codex", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === command || cmd === "generate_lesson")
        throw new Error("Offline");
      return previous(cmd, args);
    });
    await setup();
    fireEvent.click(
      await screen.findByRole("button", { name: /Hervat bij zin 4/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: title }));
    expect(
      within(screen.getByRole("region", { name: title })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(5);
    expect(backend.invoke.mock.calls.some(([cmd]) => cmd === command)).toBe(
      false,
    );
  });
});

describe("top toolbar and direct creation", () => {
  const item = {
    id: "n",
    title: "Nyheter i dag",
    source: "SVT",
    url: "https://www.svt.se/nyheter/test",
    summary: "Nyheter",
    publishedAt: null,
  };
  function newsBackend(extra: (cmd: string, args: any) => unknown) {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "fetch_news") return [item];
      if (["fetch_article", "generate_lesson"].includes(cmd))
        return extra(cmd, args);
      return previous(cmd, args);
    });
  }
  it("preserves the open exercise and speech when level and filters change", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    const stops = backend.invoke.mock.calls.filter(
      ([cmd, args]) => cmd === "speech_control" && args.action === "stop",
    ).length;
    fireEvent.click(screen.getByRole("button", { name: "B1" }));
    expect(screen.getByText("0 van 0 oefeningen")).toBeTruthy();
    expect(screen.getByRole("heading", { name: demo.title })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zoek" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters wissen" }));
    expect(
      screen.getByRole("button", { name: "B1" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      backend.invoke.mock.calls.filter(
        ([cmd, args]) => cmd === "speech_control" && args.action === "stop",
      ),
    ).toHaveLength(stops);
  });
  it("cancels retrieval, rejects duplicate clicks and ignores its late result", async () => {
    let resolve!: (text: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    newsBackend(() => pending);
    render(<App />);
    const button = await screen.findByRole("button", { name: /Nyheter i dag/ });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "A2" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("Artikeltekst ophalen…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
    await screen.findByRole("alert");
    await act(async () => resolve("Nyheter ".repeat(55)));
    expect(
      backend.invoke.mock.calls.filter(([cmd]) => cmd === "fetch_article"),
    ).toHaveLength(1);
    expect(
      backend.invoke.mock.calls.some(([cmd]) => cmd === "generate_lesson"),
    ).toBe(false);
    expect(button).toHaveProperty("disabled", false);
  });
  it("offers pasted-text fallback with original source attribution", async () => {
    newsBackend((cmd, args) => {
      if (cmd === "fetch_article") return "Alleen een kop";
      return { ...demo, id: "new", title: args.title, level: args.level };
    });
    render(<App />);
    const button = await screen.findByRole("button", { name: /Nyheter i dag/ });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    fireEvent.click(
      await screen.findByRole("button", { name: "Tekst zelf plakken" }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Titel van het nieuwsbericht")).toHaveProperty(
      "value",
      item.title,
    );
    fireEvent.change(screen.getByLabelText("Zweedse brontekst"), {
      target: { value: "Nyheter ".repeat(55) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Maak oefening/ }));
    await screen.findByRole("heading", { name: item.title });
    const args = backend.invoke.mock.calls.find(
      ([cmd]) => cmd === "generate_lesson",
    )![1];
    expect(args.sourceUrl).toBe(item.url);
    expect(args.source).toBe(item.source);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("preserves a modal draft on dismissal, Escape and failed generation", async () => {
    const previous = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd, args) => {
      if (cmd === "generate_lesson") throw new Error("Codex niet beschikbaar");
      return previous(cmd, args);
    });
    render(<App />);
    const opener = screen.getByRole("button", {
      name: "Eigen tekst toevoegen",
    });
    await waitFor(() => expect(opener).toHaveProperty("disabled", false));
    opener.focus();
    fireEvent.click(opener);
    fireEvent.change(screen.getByLabelText("Titel van het nieuwsbericht"), {
      target: { value: "Mijn nieuws" },
    });
    fireEvent.change(screen.getByLabelText("Zweedse brontekst"), {
      target: { value: "Nyheter ".repeat(55) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dialoog sluiten" }));
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    expect(screen.getByLabelText("Titel van het nieuwsbericht")).toHaveProperty(
      "value",
      "Mijn nieuws",
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: /Maak oefening/ }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Codex niet beschikbaar",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Zweedse brontekst")).toHaveProperty(
      "value",
      "Nyheter ".repeat(55),
    );
    expect(
      screen.getByRole("button", { name: /Maak oefening/ }),
    ).toHaveProperty("disabled", false);
  });
});

it("locks the custom modal during generation and preserves its draft after cancellation", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise((_, r) => {
    reject = r;
  });
  const previous = backend.invoke.getMockImplementation()!;
  backend.invoke.mockImplementation(async (cmd, args) => {
    if (cmd === "generate_lesson") return pending;
    if (cmd === "cancel_generation") {
      reject(new Error("Generatie geannuleerd."));
      return;
    }
    return previous(cmd, args);
  });
  render(<App />);
  const opener = screen.getByRole("button", { name: "Eigen tekst toevoegen" });
  await waitFor(() => expect(opener).toHaveProperty("disabled", false));
  fireEvent.click(opener);
  fireEvent.change(screen.getByLabelText("Titel van het nieuwsbericht"), {
    target: { value: "Mijn nieuws" },
  });
  fireEvent.change(screen.getByLabelText("Zweedse brontekst"), {
    target: { value: "Nyheter ".repeat(55) },
  });
  fireEvent.click(screen.getByRole("button", { name: /Maak oefening/ }));
  await waitFor(() =>
    expect(
      backend.invoke.mock.calls.some(([cmd]) => cmd === "generate_lesson"),
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "Dialoog sluiten" }),
  ).toHaveProperty("disabled", true);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Annuleren",
    }),
  );
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Titel van het nieuwsbericht")).toHaveProperty(
    "value",
    "Mijn nieuws",
  );
  expect(screen.getByRole("button", { name: /Maak oefening/ })).toHaveProperty(
    "disabled",
    false,
  );
});

it("retries direct creation at the captured level without altering a custom draft", async () => {
  let attempts = 0;
  const previous = backend.invoke.getMockImplementation()!;
  backend.invoke.mockImplementation(async (cmd, args) => {
    if (cmd === "fetch_news")
      return [
        {
          id: "n",
          title: "Nyheter",
          source: "SVT",
          url: "https://www.svt.se/nyheter/test",
          summary: "",
          publishedAt: null,
        },
      ];
    if (cmd === "fetch_article") return "Nyheter ".repeat(55);
    if (cmd === "generate_lesson") {
      if (++attempts === 1) throw new Error("Geen capaciteit");
      return { ...demo, id: "new", title: args.title, level: args.level };
    }
    return previous(cmd, args);
  });
  render(<App />);
  const opener = screen.getByRole("button", { name: "Eigen tekst toevoegen" });
  await waitFor(() => expect(opener).toHaveProperty("disabled", false));
  fireEvent.click(opener);
  fireEvent.change(screen.getByLabelText("Titel van het nieuwsbericht"), {
    target: { value: "Concept" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Dialoog sluiten" }));
  fireEvent.click(screen.getByRole("button", { name: "B1" }));
  fireEvent.click(
    screen.getByRole("button", { name: /Nyheter.*Maak B1-oefening/ }),
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Tekst zelf plakken" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
  await screen.findByRole("heading", { name: "Nyheter" });
  const generations = backend.invoke.mock.calls.filter(
    ([cmd]) => cmd === "generate_lesson",
  );
  expect(generations).toHaveLength(2);
  expect(generations.every(([, args]) => args.level === "B1")).toBe(true);
  fireEvent.click(opener);
  expect(screen.getByLabelText("Titel van het nieuwsbericht")).toHaveProperty(
    "value",
    "Concept",
  );
});

describe("downloaded voice preferences", () => {
  it("keeps a missing saved local voice instead of selecting Bengt", async () => {
    backend.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return { ...defaults, voiceId: "local:nst" };
      if (cmd === "list_voices")
        return [{ id: "bengt", name: "Bengt", language: "sv-SE" }];
      if (cmd === "list_downloadable_voices")
        return [
          {
            id: "local:nst",
            name: "NST",
            size: 63117376,
            installed: false,
            downloading: false,
          },
        ];
      if (cmd === "list_lessons" || cmd === "fetch_news") return [];
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Instellingen" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Stem") as HTMLSelectElement).value).toBe(
        "local:nst",
      ),
    );
    expect(await screen.findByText(/De gekozen stem ontbreekt/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Stemmen opnieuw controleren/ }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Stem") as HTMLSelectElement).value).toBe(
        "local:nst",
      ),
    );
  });
  it("selects and tests an installed voice with its actual local ID", async () => {
    backend.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return { ...defaults, voiceId: "bengt" };
      if (cmd === "list_voices")
        return [
          { id: "bengt", name: "Bengt", language: "sv-SE" },
          { id: "local:alma", name: "Alma", language: "sv-SE" },
        ];
      if (cmd === "list_downloadable_voices")
        return [
          {
            id: "local:alma",
            name: "Alma",
            size: 63461036,
            installed: true,
            downloading: false,
          },
        ];
      if (cmd === "list_lessons" || cmd === "fetch_news") return [];
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Instellingen" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Stem") as HTMLSelectElement).value).toBe(
        "bengt",
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Selecteren en testen" }),
    );
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].voiceId).toBe("local:alma");
  });
});

describe("local speech without optional services", () => {
  it("plays the example with only a downloaded voice and no Codex", async () => {
    backend.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings")
        return { ...defaults, codexPath: "", voiceId: "local:nst" };
      if (cmd === "list_voices")
        return [{ id: "local:nst", name: "NST", language: "sv-SE" }];
      if (
        cmd === "list_lessons" ||
        cmd === "fetch_news" ||
        cmd === "list_downloadable_voices"
      )
        return [];
      if (cmd === "detect_codex" || cmd === "generate_lesson")
        throw new Error("Codex is not installed");
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Instellingen" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Stem") as HTMLSelectElement).value).toBe(
        "local:nst",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test de stem" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0].voiceId).toBe("local:nst");
    expect(calls()[0].text).toBe(demo.sentences[0].sv);
    expect(
      backend.invoke.mock.calls.some(
        ([cmd]) => cmd === "detect_codex" || cmd === "generate_lesson",
      ),
    ).toBe(false);
  });
  it("shows speech failure details and clears them for unrelated failures", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "▶ Afspelen" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    await act(async () =>
      backend.listener?.({
        payload: {
          kind: "error",
          id: calls()[0].id,
          message: "Fout bij spraak maken",
          details: "Native synthesis returned no audio",
        },
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Fout bij spraak maken",
    );
    expect(screen.getByText("Technische details")).toBeTruthy();
    expect(screen.getByText("Native synthesis returned no audio")).toBeTruthy();
    await act(async () =>
      backend.listener?.({
        payload: { kind: "error", id: "", message: "Spraakhulp gestopt" },
      }),
    );
    expect(screen.queryByText("Technische details")).toBeNull();
  });
});
