"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Trace {
  x: number;
  y: number;
  v: number;
  len: number;
}

/** 2D fallback for the hero scene: short gradient traces rising at the mark's 45 degree angle. */
export function AmbientField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const count = (navigator.hardwareConcurrency ?? 8) <= 4 ? 16 : 28;
    const traces: Trace[] = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      v: 0.00025 + Math.random() * 0.0005,
      len: 24 + Math.random() * 56,
    }));

    let frame = 0;
    let running = false;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, parent.clientWidth) * dpr;
      canvas.height = Math.max(1, parent.clientHeight) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const style = getComputedStyle(document.documentElement);
      const violet = style.getPropertyValue("--sorts-violet").trim() || "#8307fc";
      const cyan = style.getPropertyValue("--sorts-cyan").trim() || "#03ccfc";
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      for (const trace of traces) {
        trace.x += trace.v;
        trace.y -= trace.v * (width / Math.max(1, height));
        if (trace.y < -0.1 || trace.x > 1.1) {
          trace.x = Math.random() * 0.8 - 0.2;
          trace.y = 1.05;
        }
        const x = trace.x * width;
        const y = trace.y * height;
        const d = trace.len / Math.SQRT2;
        const gradient = ctx.createLinearGradient(x, y, x + d, y - d);
        gradient.addColorStop(0, violet);
        gradient.addColorStop(1, cyan);
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + d, y - d);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (!running) return;
      draw();
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    const intersection = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start();
      else stop();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}
