/**
 * VoidOverlay.tsx
 * ---------------
 * SVG overlay that renders:
 *  - A smoothed (rounded) convex-hull polygon per void, via Catmull-Rom spline
 *  - Halo dots on each border paper
 *  - The LLM-generated void name as a label at the centroid
 *  - A filled interior tint when selected
 *
 * Color assignment:
 *  - A small palette of amber-adjacent hues (tight arc around gold/amber)
 *  - Graph-colored: two voids sharing the same color only if their AABB hulls
 *    don't overlap in normalised space, so visually adjacent voids are always
 *    distinguishable while non-overlapping ones freely reuse slots.
 *
 * Sits in the same layer stack as ClusterRings (zIndex 11).
 */

import React, { useMemo } from 'react';
import type { ViewTransform } from '../types';
import type { Void } from '../hooks/useVoidData';

interface VoidOverlayProps {
  voids:          Void[];
  selectedVoidId: number | null;
  showVoidLabels: boolean;
  transform:      ViewTransform;
  width:          number;
  height:         number;
  onVoidClick:    (id: number) => void;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function normToScreen(nx: number, ny: number, t: ViewTransform): [number, number] {
  return [nx * t.scale + t.offsetX, ny * t.scale + t.offsetY];
}

/**
 * Smooth closed polygon via Catmull-Rom → cubic Bézier.
 * tension: 0 = sharp, ~0.4 = organic blob.
 */
function smoothHullPath(pts: [number, number][], tension = 0.38): string {
  const n = pts.length;
  if (n < 3) return '';

  const cp = (
    prev: [number, number],
    cur:  [number, number],
    next: [number, number],
  ): [number, number] => {
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    return [cur[0] + dx * tension / 3, cur[1] + dy * tension / 3];
  };

  let d = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = cp(p0, p1, p2);
    const c2x = p2[0] - (p3[0] - p1[0]) * tension / 3;
    const c2y = p2[1] - (p3[1] - p1[1]) * tension / 3;
    d += ` C ${c1[0].toFixed(2)},${c1[1].toFixed(2)}`
       +   ` ${c2x.toFixed(2)},${c2y.toFixed(2)}`
       +   ` ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

function hullScreenPoints(nv: [number, number][], t: ViewTransform): [number, number][] {
  return nv.map(([nx, ny]) => normToScreen(nx, ny, t));
}

function hullNormBounds(nv: [number, number][]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of nv) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

function hullScreenBounds(nv: [number, number][], t: ViewTransform) {
  const b = hullNormBounds(nv);
  const [x0, y0] = normToScreen(b.minX, b.minY, t);
  const [x1, y1] = normToScreen(b.maxX, b.maxY, t);
  return { minX: x0, maxX: x1, minY: y0, maxY: y1 };
}

/** AABB overlap test in normalised space (fast proxy for hull intersection). */
function aabbOverlap(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  return a.maxX > b.minX && a.minX < b.maxX &&
         a.maxY > b.minY && a.minY < b.maxY;
}

// ── Graph coloring ────────────────────────────────────────────────────────────
//
// Palette: 5 hues in a tight amber arc (35°–78° in OKLCH hue).
// These are all close to the original amber gold — orange-gold, gold, warm-yellow,
// amber, yellow — so the map reads as one coherent warm family.
// Adjacent (overlapping) voids always get different slots; others freely share.

const PALETTE_HUES = [55, 42, 68, 35, 78] as const; // gold → amber → warm-yellow → orange-gold → yellow
const N_COLORS     = PALETTE_HUES.length;

/**
 * Greedy graph-coloring over voids (processed in void_rank order).
 * Returns a map: void_id → palette index 0…N_COLORS-1.
 */
function assignColors(voids: Void[]): Map<number, number> {
  const boxes = new Map<number, ReturnType<typeof hullNormBounds>>();
  for (const v of voids) {
    if ((v.shape?.nvertices?.length ?? 0) >= 3) {
      boxes.set(v.void_id, hullNormBounds(v.shape.nvertices));
    }
  }

  const assignment = new Map<number, number>();

  for (const v of voids) {
    const box = boxes.get(v.void_id);
    if (!box) continue;

    const forbidden = new Set<number>();
    for (const [otherId, otherBox] of boxes) {
      if (otherId === v.void_id) continue;
      if (!assignment.has(otherId)) continue;
      if (aabbOverlap(box, otherBox)) {
        forbidden.add(assignment.get(otherId)!);
      }
    }

    let chosen = 0;
    while (forbidden.has(chosen) && chosen < N_COLORS - 1) chosen++;
    assignment.set(v.void_id, chosen);
  }

  return assignment;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
// All values tuned to stay close to the original amber (fbbf24 ≈ oklch 0.83 0.17 84).
// Slightly pulled darker/more chroma for stroke readability.

function makeColor(hue: number, alpha: number): string {
  return `oklch(0.70 0.17 ${hue} / ${alpha})`;
}
function makeSolid(hue: number): string {
  return `oklch(0.88 0.19 ${hue})`;
}
function makeGlow(hue: number): string {
  return `oklch(0.74 0.13 ${hue} / 0.18)`;
}

const LABEL_SHADOW = 'rgba(0,0,0,0.45)';

// ── Component ─────────────────────────────────────────────────────────────────

export const VoidOverlay: React.FC<VoidOverlayProps> = ({
  voids,
  selectedVoidId,
  showVoidLabels,
  transform,
  width,
  height,
  onVoidClick,
}) => {
  const colorAssignment = useMemo(() => assignColors(voids), [voids]);

  const rendered = useMemo(() => {
    return voids.map(v => {
      const isSelected = v.void_id === selectedVoidId;
      const nvertices  = v.shape?.nvertices ?? [];
      if (nvertices.length < 3) return null;

      // Viewport cull
      const sb  = hullScreenBounds(nvertices, transform);
      const pad = 60;
      if (sb.maxX < -pad || sb.minX > width + pad ||
          sb.maxY < -pad || sb.minY > height + pad) return null;

      const pathD     = smoothHullPath(hullScreenPoints(nvertices, transform));
      const [cx, cy]  = normToScreen(v.ncx, v.ncy, transform);

      const slot = colorAssignment.get(v.void_id) ?? 0;
      const hue  = PALETTE_HUES[slot];

      const fillNormal   = makeColor(hue, 0.09);
      const fillSelected = makeColor(hue, 0.20);
      const strokeSolid  = makeSolid(hue);
      const strokeDim    = makeColor(hue, 0.60);
      const glowColor    = makeGlow(hue);
      const dotColor     = makeColor(hue, 0.60);
      const dotColorSel  = makeColor(hue, 0.95);

      const rawName   = v.name ?? `Void ${v.void_rank}`;
      const labelText = rawName.length > 38 ? rawName.slice(0, 36) + '…' : rawName;
      const showLabel = showVoidLabels || isSelected;

      const borderDots = v.border_papers.map((p, i) => {
        const [px, py] = normToScreen(p.nx, p.ny, transform);
        return (
          <circle
            key={i}
            cx={px} cy={py}
            r={isSelected ? 4.5 : 3}
            fill={isSelected ? dotColorSel : dotColor}
            style={{ pointerEvents: 'none' }}
          />
        );
      });

      return (
        <g
          key={v.void_id}
          className="cursor-pointer"
          style={{ pointerEvents: 'all' }}
          onClick={() => onVoidClick(v.void_id)}
        >
          {pathD && (
            <>
              <path
                d={pathD}
                fill={isSelected ? fillSelected : fillNormal}
                stroke="none"
                style={{ pointerEvents: 'fill' }}
              />
              <path
                d={pathD}
                fill="none"
                stroke={glowColor}
                strokeWidth={isSelected ? 16 : 9}
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              />
              <path
                d={pathD}
                fill="none"
                stroke={isSelected ? strokeSolid : strokeDim}
                strokeWidth={isSelected ? 2 : 1.2}
                strokeDasharray={isSelected ? '7 4' : '4 5'}
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              >
                {isSelected && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0" to="-44"
                    dur="2s" repeatCount="indefinite"
                  />
                )}
              </path>
            </>
          )}

          {borderDots}

          {isSelected && (
            <g transform={`translate(${cx},${cy})`} style={{ pointerEvents: 'none' }}>
              <rect
                x={-4} y={-4} width={8} height={8}
                fill={strokeSolid} opacity={0.9}
                transform="rotate(45)"
              />
            </g>
          )}

          {showLabel && (
            <text
              x={cx} y={cy - 14}
              textAnchor="middle" dominantBaseline="auto"
              fontFamily="'JetBrains Mono', monospace"
              fontSize={isSelected ? 12 : 10}
              fontWeight={isSelected ? 700 : 500}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              <tspan
                fill={strokeSolid}
                stroke={LABEL_SHADOW}
                strokeWidth={isSelected ? 2 : 1.2}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {labelText}
              </tspan>
            </text>
          )}
        </g>
      );
    }).filter(Boolean);
  }, [voids, selectedVoidId, showVoidLabels, transform, width, height, onVoidClick, colorAssignment]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width} height={height}
      style={{ zIndex: 11 }}
    >
      <g style={{ pointerEvents: 'all' }}>
        {rendered}
      </g>
    </svg>
  );
};