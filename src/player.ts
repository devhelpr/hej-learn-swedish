import type { SpeechEvent } from "./types";
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "gap";
export interface PlayerState {
  requestId: string | null;
  status: PlayerStatus;
  index: number;
  position: "title" | "sentence";
  continuous: boolean;
}
export function acceptsEvent(state: PlayerState, event: SpeechEvent): boolean {
  return state.requestId !== null && event.id === state.requestId;
}
export function resumeIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}
