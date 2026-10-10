// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
      backend.listener = listener;
      return () => {
        backend.listener = null;
      };
    },
  ),
}));
Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {} });
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
      return { ...defaults, voiceId: "alva", gapMs: 30 };
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
    fireEvent.click(screen.getByRole("button", { name: "Bibliotheek" }));
    await screen.findByRole("heading", {
      name: "Een beetje beter, elke keer.",
    });
    await emit("finished", id);
    expect(calls()).toHaveLength(1);
  });
  it("restores the saved sentence from the library", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "Bibliotheek" }));
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
