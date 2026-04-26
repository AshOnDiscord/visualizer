/**
 * useVoidData.ts
 * --------------
 * Loads voids.json and normalises centroid / border-paper coordinates
 * and convex-hull shape vertices using the same min/max bounds that
 * useParquetData derives from the parquet x/y columns.
 */
import { useState, useEffect, useCallback } from 'react';

const VOIDS_URL = '/public/voids.json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BorderPaper {
  title:   string;
  DOI:     string;
  x:       number;   // raw UMAP
  y:       number;
  nx:      number;   // normalised [0,1]
  ny:      number;
  cluster: number;
}

export interface VoidShape {
  type:        'convex_hull';
  /** raw UMAP vertices, ordered CCW, open polygon */
  vertices:    [number, number][];
  /** normalised [0,1] vertices — ready to multiply by canvas scale */
  nvertices:   [number, number][];
}

export interface Void {
  void_id:          number;
  void_rank:        number;
  /** raw UMAP centroid */
  centroid:         [number, number];
  /** normalised centroid */
  ncx:              number;
  ncy:              number;
  log_density:      number;
  /** LLM-generated topic name for the gap */
  name:             string;
  name_reasoning:   string;
  shape:            VoidShape;
  shape_area:       number;
  border_papers:    BorderPaper[];
}

interface VoidDataState {
  voids:   Void[];
  loading: boolean;
  error:   string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVoidData(
  minX:  number,
  maxX:  number,
  minY:  number,
  maxY:  number,
  /** pass false to skip loading until bounds are known */
  ready: boolean = true,
): VoidDataState {
  const [state, setState] = useState<VoidDataState>({
    voids:   [],
    loading: true,
    error:   null,
  });

  const load = useCallback(async () => {
    if (!ready) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(VOIDS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const raw: any[] = await res.json();

      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      const normXY = (x: number, y: number): [number, number] => [
        (x - minX) / rangeX,
        (y - minY) / rangeY,
      ];

      const voids: Void[] = raw.map(v => {
        const [ncx, ncy] = normXY(v.centroid[0], v.centroid[1]);

        // Normalise convex hull vertices
        const rawVerts: [number, number][] = v.shape?.vertices ?? [];
        const nvertices: [number, number][] = rawVerts.map(
          ([vx, vy]) => normXY(vx, vy),
        );

        const border_papers: BorderPaper[] = (v.border_papers ?? []).map((p: any) => {
          const [nx, ny] = normXY(p.x, p.y);
          return { ...p, nx, ny };
        });

        return {
          void_id:        v.void_id,
          void_rank:      v.void_rank,
          centroid:       v.centroid  as [number, number],
          ncx,
          ncy,
          log_density:    v.log_density,
          name:           v.name           ?? `Void ${v.void_id}`,
          name_reasoning: v.name_reasoning ?? '',
          shape: {
            type:      'convex_hull' as const,
            vertices:  rawVerts,
            nvertices,
          },
          shape_area:    v.shape_area ?? 0,
          border_papers,
        };
      });

      // Sort emptiest first (most negative log_density)
      voids.sort((a, b) => a.log_density - b.log_density);
      setState({ voids, loading: false, error: null });
    } catch (err) {
      setState({
        voids:   [],
        loading: false,
        error:   err instanceof Error ? err.message : String(err),
      });
    }
  }, [ready, minX, maxX, minY, maxY]);

  useEffect(() => { load(); }, [load]);
  return state;
}