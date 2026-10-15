import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Electron main/preload scripts and the electron-builder hook are CommonJS.
    files: ["desktop/**/*.cjs", "scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-desktop/**",
    "desktop/app-server/**",
    "dist-desktop/**",
    "portal/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
