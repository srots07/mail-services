"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface SceneColors {
  accent: string;
  violet: string;
  cyan: string;
  canvas: string;
  light: boolean;
}

const GRID_SIZE = 60;
const GRID_STEP = 1.5;
const TRACE_COUNT = 46;
/** The mark's direction: up and forward at 45 degrees. */
const DIR = new THREE.Vector3(1, 1, 0).normalize();

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function GridFloor({ colors }: { colors: SceneColors }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const half = GRID_SIZE / 2;
    const points: number[] = [];
    for (let i = -half; i <= half; i += GRID_STEP) {
      points.push(-half, 0, i, half, 0, i);
      points.push(i, 0, -half, i, 0, half);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.position.z = (ref.current.position.z + delta * 0.5) % GRID_STEP;
  });

  return (
    <lineSegments ref={ref} geometry={geometry} position={[0, -1.4, 0]}>
      <lineBasicMaterial color={colors.accent} transparent opacity={colors.light ? 0.16 : 0.22} />
    </lineSegments>
  );
}

type Trace = { x: number; y: number; z: number; len: number; speed: number };

function makeTraces(): Trace[] {
  const rand = seeded(11);
  return Array.from({ length: TRACE_COUNT }, () => ({
    x: (rand() - 0.5) * 18,
    y: rand() * 6 - 2.5,
    z: -rand() * 12 - 1.5,
    len: 0.8 + rand() * 2.2,
    speed: 0.25 + rand() * 0.55,
  }));
}

/** Thin gradient traces rising along the mark's diagonal: data travelling toward action. */
function AscentTraces({ colors }: { colors: SceneColors }) {
  const ref = useRef<THREE.LineSegments>(null);
  const tracesRef = useRef<Trace[] | null>(null);
  if (tracesRef.current == null) tracesRef.current = makeTraces();

  const geometry = useMemo(() => {
    const positions = new Float32Array(TRACE_COUNT * 6);
    const colorArray = new Float32Array(TRACE_COUNT * 6);
    const start = new THREE.Color(colors.violet);
    const end = new THREE.Color(colors.cyan);
    for (let i = 0; i < TRACE_COUNT; i++) {
      colorArray.set([start.r, start.g, start.b, end.r, end.g, end.b], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    return g;
  }, [colors.violet, colors.cyan]);

  useFrame((_, delta) => {
    const traces = tracesRef.current;
    if (!traces) return;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < traces.length; i++) {
      const t = traces[i];
      t.x += DIR.x * t.speed * delta;
      t.y += DIR.y * t.speed * delta;
      if (t.y > 4 || t.x > 10) {
        t.x -= 9;
        t.y -= 7;
      }
      arr[i * 6] = t.x;
      arr[i * 6 + 1] = t.y;
      arr[i * 6 + 2] = t.z;
      arr[i * 6 + 3] = t.x + DIR.x * t.len;
      arr[i * 6 + 4] = t.y + DIR.y * t.len;
      arr[i * 6 + 5] = t.z;
    }
    attr.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={colors.light ? 0.4 : 0.6} depthWrite={false} blending={colors.light ? THREE.NormalBlending : THREE.AdditiveBlending} />
    </lineSegments>
  );
}

export default function HeroSceneCanvas({ colors, active }: { colors: SceneColors; active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [0, 0.6, 6], fov: 55, near: 0.1, far: 60 }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <fog attach="fog" args={[colors.canvas, 5, 24]} />
      <GridFloor colors={colors} />
      <AscentTraces colors={colors} />
    </Canvas>
  );
}
