import pkg from "../package.json";

/** Releases are numbered v1, v2, v3…; package.json stores them as 1.0.0, 2.0.0… for the updater. */
export function versionLabel(version: string): string {
  return `v${Number.parseInt(version, 10) || 0}`;
}

export const APP_VERSION = versionLabel(pkg.version);
