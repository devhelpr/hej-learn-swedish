import { describe, it, expect } from "vitest";
import { acceptsEvent, resumeIndex, type PlayerState } from "./player";
describe("player request identity", () => {
  const current: PlayerState = {
    requestId: "new",
    status: "playing",
    index: 1,
    position: "sentence",
    continuous: true,
  };
  it("ignores completion of interrupted utterances", () => {
    expect(acceptsEvent(current, { id: "old", kind: "finished" })).toBe(false);
    expect(acceptsEvent(current, { id: "new", kind: "finished" })).toBe(true);
  });
  it("ignores all events after stopping", () => {
    expect(
      acceptsEvent(
        { ...current, requestId: null },
        { id: "new", kind: "started" },
      ),
    ).toBe(false);
  });
  it("bounds restored progress", () => {
    expect(resumeIndex(20, 12)).toBe(11);
    expect(resumeIndex(-3, 12)).toBe(0);
  });
});
