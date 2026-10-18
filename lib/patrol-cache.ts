import { readFile } from "fs/promises";
import path from "path";

export type PatrolSnapshot = {
  url: string;
  requestedUrl?: string;
  title?: string;
  text: string;
  blocked?: boolean;
  capturedAt: string;
};

export type PatrolModuleCache = {
  id: string;
  label?: string;
  hostHints?: string[];
  snapshots: PatrolSnapshot[];
  updatedAt: string;
};

export type PatrolCache = {
  updatedAt: string | null;
  modules: Partial<
    Record<"revenue" | "costs" | "status" | "comments", PatrolModuleCache>
  >;
};

const CACHE_PATH = path.join(process.cwd(), "data", "patrol-cache.json");

export async function readPatrolCache(): Promise<PatrolCache | null> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as PatrolCache;
  } catch {
    return null;
  }
}

/** Flatten patrol page text into extract-friendly items */
export function cacheToItems(
  mod: PatrolModuleCache | undefined
): { text?: string; app?: string; ts?: string; url?: string }[] {
  if (!mod?.snapshots?.length) return [];
  return mod.snapshots
    .filter((s) => s.text && s.text.length > 40)
    .map((s) => ({
      text: s.text,
      app: s.title || s.url,
      url: s.url || s.requestedUrl,
      ts: s.capturedAt,
    }));
}
