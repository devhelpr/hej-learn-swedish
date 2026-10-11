export type Level = "A1" | "A2" | "B1";
export interface SentencePair {
  sv: string;
  nl: string;
}
export interface Progress {
  lastSentence: number;
  completed: boolean;
}
export interface Lesson {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  sourceGroupId?: string | null;
  archivedAt?: string | null;
  level: Level;
  createdAt: string;
  sentences: SentencePair[];
  progress: Progress;
}
export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}
export interface Voice {
  id: string;
  name: string;
  language: string;
}
export interface Settings {
  codexPath: string;
  voiceId: string;
  rate: number;
  gapMs: number;
  showTranslation: boolean;
  autoAdvance: boolean;
  level: Level;
}
export interface SpeechEvent {
  kind: "started" | "paused" | "finished" | "cancelled" | "error";
  id: string;
  message?: string;
}
export const defaults: Settings = {
  codexPath: "",
  voiceId: "",
  rate: 0.85,
  gapMs: 1000,
  showTranslation: true,
  autoAdvance: true,
  level: "A2",
};
