export interface BuiltPrompt {
  system: string;
  user: string;
}

export function promptSnapshot(p: BuiltPrompt): string {
  return `### SYSTEM\n${p.system}\n\n### USER\n${p.user}`;
}
