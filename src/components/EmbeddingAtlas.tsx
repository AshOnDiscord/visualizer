/**
 * EmbeddingAtlas.tsx  — with void detection overlay
 *
 * New additions vs original:
 *  - useVoidData hook (loads voids.json, normalises coords)
 *  - VoidOverlay SVG layer (rings + border-paper dots + labels)
 *  - VoidPanel slide-in menu (list, detail, toggles)
 *  - WebGL dimming extended to handle void selection
 *  - Pan-to-void on selection (same pattern as cluster pan)
 *
 * Everything else is unchanged.
 */

import React, {
  useRef, useState, useEffect, useCallback, useMemo,
} from 'react';
import { quadtree as d3Quadtree } from 'd3-quadtree';
import type { ProcessedPaper, ViewTransform } from '../types';
import { useWebGLRenderer } from '../hooks/useWebGLRenderer';
import { ClusterRings } from './ClusterRings';
import { Tooltip } from './Tooltip';
import { SearchBar } from './SearchBar';
import { useParquetData } from '../hooks/useParquetData';
import { useVoidData } from '../hooks/useVoidData';
import { VoidOverlay } from './VoidOverlay';
import { VoidPanel } from './VoidPanel';

const MIN_SCALE = 100;
const MAX_SCALE = 80000;
const HOVER_RADIUS_PX = 12;
const DRAG_THRESHOLD_PX = 4;

function buildQuadtree(papers: ProcessedPaper[]) {
  return d3Quadtree<ProcessedPaper>()
    .x(d => d.nx)
    .y(d => d.ny)
    .addAll(papers);
}

function screenToNorm(sx: number, sy: number, transform: ViewTransform): [number, number] {
  return [
    (sx - transform.offsetX) / transform.scale,
    (sy - transform.offsetY) / transform.scale,
  ];
}

export const EmbeddingAtlas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const { papers, clusters, loading, loadingProgress, error, reload } =
    useParquetData(size.width, size.height);

  // ── Coordinate bounds from papers (same min/max useParquetData computes) ──
  const bounds = useMemo(() => {
    if (papers.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of papers) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }, [papers]);

  // ── Void data ─────────────────────────────────────────────────────────────
  const { voids, loading: voidsLoading } = useVoidData(
    bounds.minX, bounds.maxX, bounds.minY, bounds.maxY,
    papers.length > 0,   // only load after papers so bounds are real
  );

  const [selectedVoidId,  setSelectedVoidId]  = useState<number | null>(null);
  const [voidsVisible,    setVoidsVisible]    = useState(true);
  const [showVoidLabels,  setShowVoidLabels]  = useState(false);

  // ── General atlas state ───────────────────────────────────────────────────
  const [transform,         setTransform]         = useState<ViewTransform>({ scale: 600, offsetX: 50, offsetY: 50 });
  const [hovered,           setHovered]           = useState<ProcessedPaper | null>(null);
  const [mousePos,          setMousePos]          = useState({ x: 0, y: 0 });
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [hoveredClusterId,  setHoveredClusterId]  = useState<number | null>(null);
  const [searchResultIds,   setSearchResultIds]   = useState<Set<string | number> | null>(null);

  const qtRef = useRef<ReturnType<typeof buildQuadtree> | null>(null);
  const isDragging  = useRef(false);
  const dragMoved   = useRef(false);
  const lastMouse   = useRef({ x: 0, y: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // ── Build a Set of border-paper DOIs for the selected void ───────────────
  // Used to highlight those points in the WebGL layer
  const voidBorderIds = useMemo<Set<string | number> | null>(() => {
    if (selectedVoidId === null) return null;
    const v = voids.find(v => v.void_id === selectedVoidId);
    if (!v) return null;
    // Match by DOI (same field used as paper id in ProcessedPaper)
    const ids = new Set<string | number>(v.border_papers.map(p => p.DOI));
    return ids;
  }, [selectedVoidId, voids]);

  // The WebGL renderer receives either cluster/search highlights or void highlights.
  // Void selection takes priority.
  const activeSearchResultIds = useMemo(() => {
    if (voidBorderIds !== null) return voidBorderIds;
    return searchResultIds;
  }, [voidBorderIds, searchResultIds]);

  const activeSelectedClusterId = useMemo(() => {
    if (selectedVoidId !== null) return null;   // void mode dims clusters
    return selectedClusterId;
  }, [selectedVoidId, selectedClusterId]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── Quadtree ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (papers.length > 0) qtRef.current = buildQuadtree(papers);
  }, [papers]);

  // ── Initial fit ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (papers.length === 0) return;
    setTransform({
      scale:   Math.min(size.width, size.height) * 0.9,
      offsetX: size.width  * 0.05,
      offsetY: size.height * 0.05,
    });
  }, [size.width, size.height, papers.length > 0]);

  // ── WebGL renderer ────────────────────────────────────────────────────────
  useWebGLRenderer(canvasRef, {
    papers,
    width:             size.width,
    height:            size.height,
    transform,
    hoveredId:         hovered?.id ?? null,
    selectedClusterId: activeSelectedClusterId,
    searchResultIds:   activeSearchResultIds,
  });

  // ── Pointer events ────────────────────────────────────────────────────────
  const rafRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setMousePos({ x: sx, y: sy });

    if (isDragging.current) {
      const dx = sx - lastMouse.current.x;
      const dy = sy - lastMouse.current.y;
      if (
        Math.abs(e.clientX - lastMouse.current.x) > DRAG_THRESHOLD_PX ||
        Math.abs(e.clientY - lastMouse.current.y) > DRAG_THRESHOLD_PX
      ) dragMoved.current = true;
      setTransform(t => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
      lastMouse.current = { x: sx, y: sy };
      return;
    }

    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!qtRef.current) return;
      const t = transformRef.current;
      const [nx, ny] = screenToNorm(sx, sy, t);
      const radiusNorm = HOVER_RADIUS_PX / t.scale;
      const found = qtRef.current.find(nx, ny, radiusNorm);
      setHovered(found ?? null);
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragMoved.current  = false;
    lastMouse.current  = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragMoved.current) return;
    if (!hovered) {
      if (selectedClusterId !== null) setSelectedClusterId(null);
      if (selectedVoidId   !== null) setSelectedVoidId(null);
      return;
    }
    const doi = hovered.doi;
    if (doi && doi !== 'null' && doi.trim()) {
      const url = doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [hovered, selectedClusterId, selectedVoidId]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTransform(t => {
      const newScale  = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
      const scaleDelta = newScale / t.scale;
      return {
        scale:   newScale,
        offsetX: mx - scaleDelta * (mx - t.offsetX),
        offsetY: my - scaleDelta * (my - t.offsetY),
      };
    });
  }, []);

  // Touch / pinch
  const lastTouches = useRef<React.TouchList | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    lastTouches.current = e.touches;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!lastTouches.current) return;
    if (e.touches.length === 1 && lastTouches.current.length === 1) {
      const dx = e.touches[0].clientX - lastTouches.current[0].clientX;
      const dy = e.touches[0].clientY - lastTouches.current[0].clientY;
      setTransform(t => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
    } else if (e.touches.length === 2 && lastTouches.current.length === 2) {
      const d0 = Math.hypot(
        lastTouches.current[0].clientX - lastTouches.current[1].clientX,
        lastTouches.current[0].clientY - lastTouches.current[1].clientY,
      );
      const d1 = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const factor = d1 / (d0 || 1);
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setTransform(t => {
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
        const sf = newScale / t.scale;
        return {
          scale:   newScale,
          offsetX: mx - sf * (mx - t.offsetX),
          offsetY: my - sf * (my - t.offsetY),
        };
      });
    }
    lastTouches.current = e.touches;
  }, []);

  // ── Search callbacks ──────────────────────────────────────────────────────
  const handleSearchResults = useCallback((
    ids: Set<string | number> | null,
    focusPaper?: ProcessedPaper,
  ) => {
    setSearchResultIds(ids);
    setSelectedVoidId(null);
    if (focusPaper) {
      setTransform(t => ({
        ...t,
        offsetX: size.width  / 2 - focusPaper.nx * t.scale,
        offsetY: size.height / 2 - focusPaper.ny * t.scale,
      }));
    }
  }, [size]);

  const handleClusterClick = useCallback((id: number) => {
    setSelectedClusterId(prev => prev === id ? null : id);
    setSelectedVoidId(null);
    setSearchResultIds(null);
    const cluster = clusters.get(id);
    if (cluster) {
      setTransform(t => ({
        ...t,
        offsetX: size.width  / 2 - cluster.centroid[0] * t.scale,
        offsetY: size.height / 2 - cluster.centroid[1] * t.scale,
      }));
    }
  }, [clusters, size]);

  // ── Void callbacks ────────────────────────────────────────────────────────
  const handleVoidSelect = useCallback((id: number | null) => {
    setSelectedVoidId(id);
    setSelectedClusterId(null);
    setSearchResultIds(null);

    if (id === null) return;
    const v = voids.find(v => v.void_id === id);
    if (!v) return;

    // Pan so the void centroid is centred
    setTransform(t => ({
      ...t,
      offsetX: size.width  / 2 - v.ncx * t.scale,
      offsetY: size.height / 2 - v.ncy * t.scale,
    }));
  }, [voids, size]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:        papers.length,
    clusterCount: clusters.size,
  }), [papers.length, clusters.size]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0f2f8 0%, #e8ecf5 40%, #f2eef8 100%)' }}
    >
      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(120,130,180,0.12) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          zIndex: 0,
        }}
      />

      {/* ── Void panel (left slide-in) ── */}
      <VoidPanel
        voids={voids}
        selectedVoidId={selectedVoidId}
        showVoidLabels={showVoidLabels}
        voidsVisible={voidsVisible}
        loading={voidsLoading}
        onSelectVoid={handleVoidSelect}
        onToggleLabels={() => setShowVoidLabels(v => !v)}
        onToggleVoids={() => setVoidsVisible(v => !v)}
      />

      {/* ── Main canvas + overlay container ── */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          cursor: isDragging.current ? 'grabbing' : hovered ? 'pointer' : 'grab',
          zIndex: 1,
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { lastTouches.current = null; }}
      >
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="absolute inset-0"
          style={{ zIndex: 1 }}
        />

        {/* Cluster rings */}
        {!loading && (
          <ClusterRings
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            hoveredClusterId={hoveredClusterId}
            transform={transform}
            width={size.width}
            height={size.height}
            onClusterClick={handleClusterClick}
            onClusterHover={setHoveredClusterId}
          />
        )}

        {/* Void overlay */}
        {!loading && voidsVisible && voids.length > 0 && (
          <VoidOverlay
            voids={voids}
            selectedVoidId={selectedVoidId}
            showVoidLabels={showVoidLabels}
            transform={transform}
            width={size.width}
            height={size.height}
            onVoidClick={id => handleVoidSelect(id === selectedVoidId ? null : id)}
          />
        )}
      </div>

      {/* ── Tooltip ── */}
      <Tooltip
        paper={hovered}
        x={mousePos.x}
        y={mousePos.y}
        containerWidth={size.width}
        containerHeight={size.height}
      />

      {/* ── Search bar ── */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3"
        style={{ zIndex: 50 }}
      >
        <SearchBar
          papers={papers}
          onResults={handleSearchResults}
          disabled={loading}
        />
      </div>

      {/* ── Top-left title ── */}
      <div className="absolute top-4 left-4" style={{ zIndex: 50 }}>
        <div
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 10,
            padding: '8px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
          }}
        >
          <h1
            className="text-gray-800 font-semibold tracking-tight"
            style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 17, lineHeight: 1 }}
          >
            arXiv Atlas
          </h1>
          <p
            className="text-gray-400 mt-0.5"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.04em' }}
          >
            {stats.total > 0
              ? `${stats.total.toLocaleString()} papers · ${stats.clusterCount} clusters · ${voids.length} voids`
              : 'Loading…'}
          </p>
        </div>
      </div>

      {/* ── Bottom-right zoom controls ── */}
      <div
        className="absolute bottom-4 right-4 flex flex-col gap-2"
        style={{ zIndex: 50 }}
      >
        {[
          { label: '+',  delta: 1.5,   title: 'Zoom in'    },
          { label: '−',  delta: 1/1.5, title: 'Zoom out'   },
          { label: '⊙',  delta: null,  title: 'Reset view' },
        ].map(({ label, delta, title }) => (
          <button
            key={label}
            title={title}
            onClick={() => {
              if (delta === null) {
                setTransform({
                  scale:   Math.min(size.width, size.height) * 0.9,
                  offsetX: size.width  * 0.05,
                  offsetY: size.height * 0.05,
                });
                setSelectedClusterId(null);
                setSelectedVoidId(null);
                setSearchResultIds(null);
              } else {
                setTransform(t => {
                  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * delta));
                  const sf = newScale / t.scale;
                  return {
                    scale:   newScale,
                    offsetX: size.width  / 2 - sf * (size.width  / 2 - t.offsetX),
                    offsetY: size.height / 2 - sf * (size.height / 2 - t.offsetY),
                  };
                });
              }
            }}
            style={{
              width: 36, height: 36,
              background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
              fontSize: label === '⊙' ? 16 : 20,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Bottom-left cluster info ── */}
      {selectedClusterId !== null && selectedVoidId === null && (
        <div className="absolute bottom-4 left-4" style={{ zIndex: 50 }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${clusters.get(selectedClusterId)?.color ?? '#ccc'}40`,
              borderRadius: 10,
              padding: '10px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              maxWidth: 260,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: clusters.get(selectedClusterId)?.color ?? '#ccc',
              }} />
              <span
                className="text-gray-700 font-medium"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              >
                {clusters.get(selectedClusterId)?.label ?? `Cluster ${selectedClusterId}`}
              </span>
              <button
                onClick={() => setSelectedClusterId(null)}
                className="ml-auto text-gray-300 hover:text-gray-500"
                style={{ fontSize: 14 }}
              >
                ×
              </button>
            </div>
            <p
              className="text-gray-500"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}
            >
              {clusters.get(selectedClusterId)?.size.toLocaleString() ?? 0} papers
            </p>
          </div>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {loading && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(240,242,248,0.9)', zIndex: 100, backdropFilter: 'blur(4px)' }}
        >
          <div className="flex flex-col items-center gap-4">
            <div style={{
              width: 44, height: 44,
              border: '3px solid rgba(79,110,247,0.15)',
              borderTop: '3px solid #4F6EF7',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div className="text-center">
              <p
                className="text-gray-700 font-medium"
                style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 18 }}
              >
                arXiv Atlas
              </p>
              <p
                className="text-gray-400 mt-1"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              >
                {loadingProgress}
              </p>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Error overlay ── */}
      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(240,242,248,0.95)', zIndex: 100 }}
        >
          <div style={{
            background: 'white',
            border: '1px solid rgba(232,86,74,0.3)',
            borderRadius: 12,
            padding: '24px 28px',
            maxWidth: 440,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          }}>
            <p
              className="text-gray-800 font-semibold mb-2"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 17 }}
            >
              Failed to load data
            </p>
            <p
              className="text-gray-500 mb-4"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, wordBreak: 'break-all' }}
            >
              {error}
            </p>
            <p className="text-gray-400 text-xs mb-4">
              Make sure <code className="bg-gray-100 px-1 py-0.5 rounded">umap_200k.parquet</code> and{' '}
              <code className="bg-gray-100 px-1 py-0.5 rounded">voids.json</code> are in your{' '}
              <code className="bg-gray-100 px-1 py-0.5 rounded">public/</code> folder.
            </p>
            <button
              onClick={reload}
              style={{
                background: '#4F6EF7', color: 'white',
                border: 'none', borderRadius: 7,
                padding: '8px 16px', fontSize: 13,
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};