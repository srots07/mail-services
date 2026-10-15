import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export interface Release {
  version: string;
  file: string;
  sha512: string;
  size: number;
  notes: string;
  releasedAt: string;
}

export function updatesDir(): string {
  return path.resolve(env().UPDATES_DIR || path.join(process.cwd(), "updates"));
}

/** The newest published desktop release, or null if nothing has been published yet. */
export async function latestRelease(): Promise<Release | null> {
  try {
    return JSON.parse(await readFile(path.join(updatesDir(), "latest.json"), "utf8")) as Release;
  } catch {
    return null;
  }
}

export function versionLabel(version: string): string {
  return `v${Number.parseInt(version, 10) || 0}`;
}
