// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AppUpdater from "./AppUpdater";
import { check, type Update } from "@tauri-apps/plugin-updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
const checkMock = vi.mocked(check);
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);
function available() {
  return {
    version: "1.4.0",
    close: vi.fn().mockResolvedValue(undefined),
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  } as unknown as Update;
}

it("does not check in browser previews or unsupported platforms", async () => {
  render(<AppUpdater enabled={false} />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(checkMock).not.toHaveBeenCalled();
});

it("checks once in StrictMode, asks before installing, and allows postponing", async () => {
  const update = available();
  checkMock.mockResolvedValue(update);
  render(
    <StrictMode>
      <AppUpdater enabled />
    </StrictMode>,
  );
  await screen.findByText(/Hej 1.4.0 is beschikbaar/);
  expect(checkMock).toHaveBeenCalledTimes(1);
  expect(update.downloadAndInstall).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Later"));
  expect(screen.queryByLabelText("App-updates")).toBeNull();
  expect(update.close).toHaveBeenCalledOnce();
});

it("handles offline checks without blocking the app and allows retrying", async () => {
  checkMock
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(null);
  render(<AppUpdater enabled />);
  await screen.findByText(/Updatecontrole niet gelukt/);
  fireEvent.click(screen.getByText("Opnieuw controleren"));
  await screen.findByText("Hej is bijgewerkt.");
  expect(checkMock).toHaveBeenCalledTimes(2);
});

it("shows progress, prevents duplicate installation and allows retry after verification failure", async () => {
  const update = available();
  let reject: (cause: Error) => void;
  vi.mocked(update.downloadAndInstall).mockImplementationOnce(
    async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 40 } });
      return new Promise<void>((_, fail) => {
        reject = fail;
      });
    },
  );
  checkMock.mockResolvedValue(update);
  render(<AppUpdater enabled />);
  fireEvent.click(await screen.findByText("Update installeren"));
  await screen.findByText("Update downloaden: 40%");
  expect(screen.queryByText("Update installeren")).toBeNull();
  reject!(new Error("Invalid signature"));
  fireEvent.click(await screen.findByText("Update installeren"));
  await waitFor(() =>
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(2),
  );
});

it("releases an update resource when a check completes after unmounting", async () => {
  let resolve: (value: Update) => void;
  checkMock.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<AppUpdater enabled />);
  await waitFor(() => expect(checkMock).toHaveBeenCalledOnce());
  view.unmount();
  const update = available();
  resolve!(update);
  await waitFor(() => expect(update.close).toHaveBeenCalledOnce());
});
