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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({
  invoke: vi.fn(),
  progress: null as
    | null
    | ((event: {
        payload: { id: string; downloaded: number; total: number };
      }) => void),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: backend.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_: string, listener: typeof backend.progress) => {
    backend.progress = listener;
    return () => {};
  }),
}));
import DownloadableVoices from "./DownloadableVoices";
const catalog = [
  {
    id: "local:alma",
    name: "Alma",
    size: 63_461_036,
    installed: false,
    downloading: false,
  },
  {
    id: "local:nst",
    name: "NST",
    size: 63_117_376,
    installed: false,
    downloading: false,
  },
];
beforeEach(() => {
  backend.invoke.mockReset();
  backend.progress = null;
});
afterEach(cleanup);
describe("downloadable voices", () => {
  it("downloads with progress, preserves selection, and only selects on explicit test", async () => {
    let installed = false;
    let finish: () => void = () => {};
    backend.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_downloadable_voices")
        return catalog.map((v) => ({
          ...v,
          installed: v.id === "local:alma" && installed,
        }));
      if (cmd === "install_voice") {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        installed = true;
      }
    });
    const onInstalled = vi.fn(async () => {});
    const onSelectTest = vi.fn(async () => {});
    render(
      <DownloadableVoices
        selected="bengt"
        onInstalled={onInstalled}
        onSelectTest={onSelectTest}
      />,
    );
    const alma = await screen.findByRole("article", { name: "Alma" });
    fireEvent.click(within(alma).getByRole("button", { name: "Downloaden" }));
    await screen.findByRole("progressbar", { name: "Alma downloaden" });
    await act(async () =>
      backend.progress?.({
        payload: { id: "local:alma", downloaded: 1000, total: 63_461_036 },
      }),
    );
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("1000");
    await act(async () => finish());
    await waitFor(() => expect(onInstalled).toHaveBeenCalledOnce());
    expect(onSelectTest).not.toHaveBeenCalled();
    fireEvent.click(
      await within(alma).findByRole("button", { name: "Selecteren en testen" }),
    );
    expect(onSelectTest).toHaveBeenCalledWith("local:alma");
  });
  it("tests a shared pack speaker and retains an already selected speaker", async () => {
    backend.invoke.mockResolvedValue([
      {
        id: "local:supertonic",
        name: "Supertonic 3",
        size: 145313450,
        installed: true,
        downloading: false,
        voiceId: "local:supertonic:0",
        voiceCount: 10,
        engine: "supertonic",
      },
    ]);
    const onSelectTest = vi.fn(async () => {});
    const view = render(
      <DownloadableVoices
        selected="local:nst"
        onInstalled={async () => {}}
        onSelectTest={onSelectTest}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Selecteren en testen" }),
    );
    expect(onSelectTest).toHaveBeenLastCalledWith("local:supertonic:0");
    expect(screen.getByText(/10 stemmen/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "OpenRAIL-M" })).toBeTruthy();
    view.rerender(
      <DownloadableVoices
        selected="local:supertonic:7"
        onInstalled={async () => {}}
        onSelectTest={onSelectTest}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Selecteren en testen" }),
    );
    expect(onSelectTest).toHaveBeenLastCalledWith("local:supertonic:7");
    expect(screen.getByText(/Geselecteerd/)).toBeTruthy();
  });
  it("cancels and allows retry after interrupted download", async () => {
    let reject: (e: string) => void = () => {};
    backend.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_downloadable_voices") return catalog;
      if (cmd === "install_voice")
        await new Promise((_, failure) => {
          reject = failure;
        });
      if (cmd === "cancel_voice_download") reject("Download geannuleerd.");
    });
    render(
      <DownloadableVoices
        selected="bengt"
        onInstalled={async () => {}}
        onSelectTest={async () => {}}
      />,
    );
    const alma = await screen.findByRole("article", { name: "Alma" });
    fireEvent.click(within(alma).getByRole("button", { name: "Downloaden" }));
    fireEvent.click(
      await within(alma).findByRole("button", { name: "Annuleren" }),
    );
    expect((await within(alma).findByRole("alert")).textContent).toContain(
      "geannuleerd",
    );
    expect(
      await within(alma).findByRole("button", { name: "Opnieuw proberen" }),
    ).toBeTruthy();
  });
  it("offers reinstallation and displays an unavailable download catalog error", async () => {
    backend.invoke.mockResolvedValueOnce([{ ...catalog[0], installed: true }]);
    const view = render(
      <DownloadableVoices
        selected="local:alma"
        onInstalled={async () => {}}
        onSelectTest={async () => {}}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Opnieuw installeren" }),
    ).toBeTruthy();
    expect(screen.getByText(/Geselecteerd/)).toBeTruthy();
    view.unmount();
    backend.invoke.mockRejectedValueOnce("Offline");
    render(
      <DownloadableVoices
        selected="bengt"
        onInstalled={async () => {}}
        onSelectTest={async () => {}}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Offline");
  });
});
