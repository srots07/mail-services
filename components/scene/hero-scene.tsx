"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AmbientField } from "@/components/ui/ambient-field";
import { cn } from "@/lib/utils";
import type { SceneColors } from "./hero-scene-canvas";

const HeroSceneCanvas = dynamic(() => import("./hero-scene-canvas"), { ssr: false });

type Mode = "static" | "canvas2d" | "webgl";

let cachedMode: Mode | null = null;

function detectMode(): Mode {
  if (cachedMode) return cachedMode;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return (cachedMode = "static");
  if ((navigator.hardwareConcurrency ?? 8) <= 4) return (cachedMode = "canvas2d");
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    cachedMode = gl ? "webgl" : "canvas2d";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cachedMode = "canvas2d";
  }
  return cachedMode;
}

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = () => {
    cachedMode = null;
    onChange();
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/** Colors come only from the theme tokens in globals.css; null until they resolve. */
function readColors(): SceneColors | null {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const accent = get("--accent");
  const violet = get("--sorts-violet");
  const cyan = get("--sorts-cyan");
  const canvas = get("--canvas");
  if (!accent || !violet || !cyan || !canvas) return null;
  return { accent, violet, cyan, canvas, light: document.documentElement.dataset.theme === "light" };
}

let colorKey = "";
let colorSnapshot: SceneColors | null = null;

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getColors(): SceneColors | null {
  const next = readColors();
  if (!next) return null;
  const key = `${next.accent}|${next.violet}|${next.cyan}|${next.canvas}|${next.light}`;
  if (key !== colorKey || !colorSnapshot) {
    colorKey = key;
    colorSnapshot = next;
  }
  return colorSnapshot;
}

/**
 * Decorative hero backdrop: WebGL grid + rising Sorts traces, falling back to a 2D canvas on
 * low-core or no-WebGL devices and to a static grid under reduced motion.
 */
export function HeroScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useSyncExternalStore<Mode>(subscribeMotion, detectMode, () => "static");
  const colors = useSyncExternalStore(subscribeTheme, getColors, () => null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== "webgl") return;
    let visible = false;
    const update = () => setActive(visible && document.visibilityState === "visible");
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [mode]);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {mode !== "webgl" && <div className="sorts-grid-floor opacity-80" />}
      {mode === "canvas2d" && <AmbientField />}
      {mode === "webgl" && colors && <HeroSceneCanvas colors={colors} active={active} />}
    </div>
  );
}
