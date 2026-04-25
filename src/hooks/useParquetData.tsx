import { useState, useEffect, useCallback } from 'react';
import * as arrow from 'apache-arrow';
import type { ProcessedPaper, Cluster, AtlasState } from '../types';
import { computeDensity, type Point2D } from '../utils/dbscan';
import { convexHull, expandHull, centroid, type Vec2 } from '../utils/convexHull';
import { clusterColor } from '../utils/colors';

const PARQUET_URL = '/public/umap_200k.parquet';

const DENSITY_RADIUS = 0.015;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useParquetData(): AtlasState & { reload: () => void } {
  const [state, setState] = useState<AtlasState>({
    papers: [],
    clusters: new Map(),
    loading: true,
    loadingProgress: 'Initializing…',
    error: null,
  });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null, loadingProgress: 'Fetching parquet file…' }));

    try {
      const res = await fetch(PARQUET_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      setState(s => ({ ...s, loadingProgress: 'Reading parquet bytes…' }));
      const buffer = await res.arrayBuffer();

      setState(s => ({ ...s, loadingProgress: 'Parsing parquet columns…' }));
      const table = await arrow.tableFromIPC(new Uint8Array(buffer));

      setState(s => ({ ...s, loadingProgress: 'Extracting columns…' }));

      const n = table.numRows;
      const ids: (string | number)[] = [];
      const titles: string[] = [];
      const dois: string[] = [];
      const xs: number[] = [];
      const ys: number[] = [];
      const clusterIds: number[] = [];

      // Column name detection (handle case variations)
      const colNames = table.schema.fields.map(f => f.name.toLowerCase());
      const getCol = (names: string[]) => {
        for (const name of names) {
          const idx = colNames.indexOf(name);
          if (idx >= 0) return table.getChildAt(idx);
        }
        return null;
      };

      const idCol      = getCol(['id']);
      const titleCol   = getCol(['title']);
      const doiCol     = getCol(['doi']);
      const xCol       = getCol(['x', 'umap_x', 'umap1', 'dim1']);
      const yCol       = getCol(['y', 'umap_y', 'umap2', 'dim2']);
      const clusterCol = getCol(['cluster', 'cluster_id', 'label']);

      if (!xCol || !yCol) {
        throw new Error('Could not find x/y columns in parquet. Expected: x, y (or umap_x, umap_y)');
      }

      if (!clusterCol) {
        throw new Error(
          'No cluster column found in parquet. Expected: cluster, cluster_id, or label. ' +
          'Re-run 02_umap.py to generate cluster assignments from high-dimensional vectors.'
        );
      }

      for (let i = 0; i < n; i++) {
        ids.push(idCol ? String(idCol.get(i)) : String(i));
        titles.push(titleCol ? String(titleCol.get(i) ?? '') : '');
        dois.push(doiCol ? String(doiCol.get(i) ?? '') : '');
        xs.push(Number(xCol.get(i)));
        ys.push(Number(yCol.get(i)));
        clusterIds.push(Number(clusterCol.get(i)));
      }

      setState(s => ({ ...s, loadingProgress: 'Normalizing coordinates…' }));

      // Normalize to [0, 1]
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (xs[i] < minX) minX = xs[i];
        if (xs[i] > maxX) maxX = xs[i];
        if (ys[i] < minY) minY = ys[i];
        if (ys[i] > maxY) maxY = ys[i];
      }
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      const nxs = xs.map(v => (v - minX) / rangeX);
      const nys = ys.map(v => (v - minY) / rangeY);

      setState(s => ({ ...s, loadingProgress: 'Computing density…' }));

      const pts: Point2D[] = nxs.map((x, i) => ({ x, y: nys[i], index: i }));
      const density = computeDensity(pts, DENSITY_RADIUS);

      setState(s => ({ ...s, loadingProgress: 'Building cluster hulls…' }));

      // Collect points per cluster for hull computation
      const clusterPoints = new Map<number, Vec2[]>();
      for (let i = 0; i < n; i++) {
        const cid = clusterIds[i];
        if (cid < 0) continue; // skip noise points if any
        if (!clusterPoints.has(cid)) clusterPoints.set(cid, []);
        clusterPoints.get(cid)!.push([nxs[i], nys[i]]);
      }

      const clusters = new Map<number, Cluster>();
      for (const [id, cpts] of clusterPoints) {
        const hull     = convexHull([...cpts]);
        const expanded = expandHull(hull, 0.008);
        const c        = centroid(hull);
        clusters.set(id, {
          id,
          hull: expanded,
          hullNorm: hull,
          color: clusterColor(id),
          centroid: c,
          size: cpts.length,
        });
      }

      setState(s => ({ ...s, loadingProgress: 'Assembling dataset…' }));

      const papers: ProcessedPaper[] = [];
      for (let i = 0; i < n; i++) {
        papers.push({
          id: ids[i],
          title: titles[i],
          doi: dois[i],
          x: xs[i],
          y: ys[i],
          nx: nxs[i],
          ny: nys[i],
          density: density[i],
          clusterId: clusterIds[i],
        });
      }

      setState({
        papers,
        clusters,
        loading: false,
        loadingProgress: '',
        error: null,
      });
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}