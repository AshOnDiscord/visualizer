import React, { useState, useCallback } from "react";
import type { Void, SelectedPaper } from "../hooks/useVoidData";

interface VoidPanelProps {
  voids: Void[];
  selectedVoidId: number | null;
  showVoidLabels: boolean;
  voidsVisible: boolean;
  loading: boolean;
  onSelectVoid: (id: number | null) => void;
  onToggleLabels: () => void;
  onToggleVoids: () => void;
}

const PANEL_W = 310;
const mono = "'JetBrains Mono', monospace";
const serif = "'Crimson Pro', Georgia, serif";

// ── Emptiness bar: empty_radius is ~0.05–0.5 in practice, normalise to 0–1
function emptinessOf(v: Void): number {
  return Math.min(1, Math.max(0, v.empty_radius / 0.35));
}

// ── Sector compass needle ─────────────────────────────────────────────────────

const SectorCompass: React.FC<{
  angleDeg: number;
  sector: number;
  dim?: boolean;
}> = ({ angleDeg, sector, dim = false }) => {
  const rad = (angleDeg * Math.PI) / 180;
  const nx = Math.sin(rad) * 7;
  const ny = -Math.cos(rad) * 7;
  const op = dim ? 0.45 : 1.0;

  return (
    <svg
      width={24}
      height={24}
      viewBox="-12 -12 24 24"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* ring */}
      <circle
        r={10}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={0.8}
        opacity={dim ? 0.3 : 0.55}
      />
      {/* 8 tick marks */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = Math.sin(a) * 7.5;
        const y1 = -Math.cos(a) * 7.5;
        const x2 = Math.sin(a) * 10;
        const y2 = -Math.cos(a) * 10;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#fbbf24"
            strokeWidth={0.6}
            opacity={0.35}
          />
        );
      })}
      {/* needle */}
      <line
        x1={0}
        y1={0}
        x2={nx}
        y2={ny}
        stroke="#d97706"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={op}
      />
      {/* hub dot */}
      <circle r={2} fill="#fbbf24" opacity={op} />
      {/* sector label below ring */}
      <text
        x={0}
        y={14}
        textAnchor="middle"
        fontFamily={mono}
        fontSize={6}
        fill="#a16207"
        opacity={op}
      >
        S{sector}
      </text>
    </svg>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  // Toggle tab
  toggle: {
    position: "absolute" as const,
    top: "50%",
    left: 0,
    transform: "translateY(-50%)",
    zIndex: 60,
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderLeft: "none",
    borderRadius: "0 8px 8px 0",
    padding: "12px 6px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    boxShadow: "2px 0 12px rgba(0,0,0,0.06)",
    transition: "left 0.28s cubic-bezier(.4,0,.2,1)",
  },
  toggleLabel: {
    writingMode: "vertical-rl" as const,
    textOrientation: "mixed" as const,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    color: "#92400e",
    userSelect: "none" as const,
  },

  // Panel shell
  panel: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: PANEL_W,
    height: "100%",
    zIndex: 55,
    background: "rgba(255,255,255,0.94)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRight: "1px solid rgba(0,0,0,0.07)",
    boxShadow: "4px 0 24px rgba(0,0,0,0.07)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden" as const,
    transition: "transform 0.28s cubic-bezier(.4,0,.2,1)",
  },

  // Fixed header + controls
  header: {
    padding: "16px 16px 10px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    flexShrink: 0,
  },
  controls: {
    padding: "8px 16px",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  labelToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 10,
    color: "#78716c",
    userSelect: "none" as const,
  },

  // Void list (scrollable, takes available space above detail)
  list: {
    overflowY: "auto" as const,
    flex: "1 1 0" as unknown as number,
    minHeight: 0,
    padding: "4px 0",
  },
  voidItem: (selected: boolean) => ({
    padding: "10px 14px",
    cursor: "pointer",
    background: selected ? "rgba(251,191,36,0.10)" : "transparent",
    borderLeft: selected ? "3px solid #fbbf24" : "3px solid transparent",
    transition: "background 0.12s",
  }),
  rankBadge: {
    fontFamily: mono,
    fontSize: 9,
    color: "#a8a29e",
    marginBottom: 3,
    letterSpacing: "0.04em",
  },
  voidName: (selected: boolean) => ({
    fontFamily: serif,
    fontSize: 13,
    fontWeight: selected ? 700 : 500,
    color: selected ? "#92400e" : "#292524",
    lineHeight: 1.3,
    marginBottom: 3,
  }),
  emptyBar: {
    height: 3,
    borderRadius: 2,
    background: "#fef3c7",
    marginTop: 5,
    position: "relative" as const,
    overflow: "hidden" as const,
  },

  // Detail pane — fixed height, scrollable
  detail: {
    flexShrink: 0,
    height: "50%",
    minHeight: 0,
    overflowY: "auto" as const,
    borderTop: "1px solid rgba(0,0,0,0.07)",
    display: "flex",
    flexDirection: "column" as const,
  },

  // ── Selected papers section ──────────────────────────────────────────────

  selHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px 7px",
    position: "sticky" as const,
    top: 0,
    zIndex: 2,
    background: "rgba(255,251,235,0.97)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderBottom: "1px solid rgba(251,191,36,0.2)",
    flexShrink: 0,
  },
  selHeaderLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: "#a16207",
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    fontWeight: 600,
  },
  selHeaderSub: {
    fontFamily: mono,
    fontSize: 8,
    color: "#c4924a",
    marginLeft: "auto" as const,
    fontStyle: "italic",
  },

  // Each selected paper card
  card: (rank: number) => ({
    margin: rank === 0 ? "7px 10px 5px" : "4px 10px",
    borderRadius: 7,
    border:
      rank === 0
        ? "1px solid rgba(251,191,36,0.6)"
        : "1px solid rgba(0,0,0,0.07)",
    background: rank === 0 ? "rgba(255,251,235,0.85)" : "rgba(255,255,255,0.6)",
    overflow: "hidden" as const,
    cursor: "pointer",
    position: "relative" as const,
    transition: "background 0.1s",
    flexShrink: 0,
  }),
  // Left accent bar: opacity encodes combined score
  accentBar: (score: number) => ({
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: `linear-gradient(to bottom, #fbbf24, #f59e0b)`,
    opacity: 0.25 + score * 0.75,
    borderRadius: "7px 0 0 7px",
  }),
  cardInner: {
    padding: "8px 10px 9px 14px",
  },
  cardTopRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  rankPill: (rank: number) => ({
    fontFamily: mono,
    fontSize: 8,
    color: rank === 0 ? "#92400e" : "#a8a29e",
    background: rank === 0 ? "#fef3c7" : "rgba(0,0,0,0.05)",
    borderRadius: 3,
    padding: "2px 6px",
    letterSpacing: "0.03em",
    flexShrink: 0,
  }),
  angleLbl: {
    fontFamily: mono,
    fontSize: 8,
    color: "#c4a264",
    marginLeft: "auto" as const,
  },
  cardTitle: {
    fontFamily: serif,
    fontSize: 12,
    color: "#1c1917",
    lineHeight: 1.4,
    marginBottom: 6,
  },
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
    flexWrap: "wrap" as const,
  },
  chip: (highlight: boolean) => ({
    fontFamily: mono,
    fontSize: 8,
    color: highlight ? "#92400e" : "#a8a29e",
    background: highlight ? "rgba(251,191,36,0.18)" : "rgba(0,0,0,0.05)",
    borderRadius: 3,
    padding: "2px 5px",
    letterSpacing: "0.02em",
    flexShrink: 0,
  }),
  doiChip: {
    fontFamily: mono,
    fontSize: 8,
    color: "#a16207",
    background: "transparent",
    borderRadius: 3,
    padding: "2px 5px",
    letterSpacing: "0.02em",
    flexShrink: 0,
  },

  // Score bars
  scoreRows: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  scoreLbl: {
    fontFamily: mono,
    fontSize: 8,
    color: "#a8a29e",
    width: 22,
    flexShrink: 0,
  },
  scoreTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: "rgba(0,0,0,0.08)",
    overflow: "hidden" as const,
    position: "relative" as const,
  },
  scoreFill: (pct: number, color: string) => ({
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: `${Math.min(1, Math.max(0, pct)) * 100}%`,
    background: color,
    borderRadius: 2,
  }),
  scoreVal: {
    fontFamily: mono,
    fontSize: 8,
    color: "#d97706",
    width: 32,
    textAlign: "right" as const,
    flexShrink: 0,
  },

  // ── Void metadata block ──────────────────────────────────────────────────

  metaDivider: {
    height: 1,
    background: "rgba(0,0,0,0.06)",
    margin: "6px 0 0",
    flexShrink: 0,
  },
  metaBlock: {
    padding: "10px 14px 8px",
    flexShrink: 0,
  },
  detailName: {
    fontFamily: serif,
    fontSize: 14,
    fontWeight: 700,
    color: "#92400e",
    lineHeight: 1.3,
    marginBottom: 4,
  },
  detailReasoning: {
    fontFamily: serif,
    fontSize: 12,
    color: "#57534e",
    lineHeight: 1.55,
    fontStyle: "italic",
    marginBottom: 8,
  },
  detailMeta: {
    fontFamily: mono,
    fontSize: 9,
    color: "#a8a29e",
    letterSpacing: "0.03em",
    marginBottom: 10,
  },

  // ── Border papers ────────────────────────────────────────────────────────

  borderLabel: {
    fontFamily: mono,
    fontSize: 9,
    color: "#a16207",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    padding: "4px 14px 5px",
    flexShrink: 0,
  },
  borderRow: {
    padding: "5px 14px",
    borderBottom: "1px solid rgba(0,0,0,0.04)",
    cursor: "pointer",
  },
  borderTitle: {
    fontFamily: serif,
    fontSize: 12,
    color: "#44403c",
    lineHeight: 1.35,
    margin: 0,
  },
  borderDOI: {
    fontFamily: mono,
    fontSize: 9,
    color: "#a16207",
    margin: "2px 0 0",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export const VoidPanel: React.FC<VoidPanelProps> = ({
  voids,
  selectedVoidId,
  showVoidLabels,
  voidsVisible,
  loading,
  onSelectVoid,
  onToggleLabels,
  onToggleVoids,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);

  const selectedVoid = voids.find((v) => v.void_id === selectedVoidId) ?? null;

  const handleItemClick = useCallback(
    (id: number) => {
      onSelectVoid(id === selectedVoidId ? null : id);
    },
    [selectedVoidId, onSelectVoid],
  );

  const openDOI = useCallback((doi: string) => {
    const url = `https://arxiv.org/abs/${doi}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <>
      {/* ── Toggle tab ── */}
      <div
        style={{ ...S.toggle, left: panelOpen ? PANEL_W : 0 }}
        onClick={() => setPanelOpen((o) => !o)}
        title={panelOpen ? "Close void panel" : "Open void panel"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <polygon
            points="8,2 14,8 8,14 2,8"
            stroke="#d97706"
            strokeWidth="1.4"
            strokeDasharray="3 2"
            fill="rgba(217,119,6,0.08)"
          />
          <circle cx="8" cy="8" r="1.5" fill="rgba(217,119,6,0.5)" />
        </svg>
        <span style={S.toggleLabel}>{panelOpen ? "CLOSE" : "VOIDS"}</span>
      </div>

      {/* ── Panel ── */}
      <div
        style={{
          ...S.panel,
          transform: panelOpen ? "translateX(0)" : `translateX(-${PANEL_W}px)`,
          pointerEvents: panelOpen ? "all" : "none",
        }}
      >
        {/* Header */}
        <div style={S.header}>
          <p
            style={{
              fontFamily: serif,
              fontSize: 17,
              fontWeight: 600,
              color: "#1c1917",
              margin: 0,
              lineHeight: 1,
            }}
          >
            Knowledge Voids
          </p>
          <p
            style={{
              fontFamily: mono,
              fontSize: 9,
              color: "#a16207",
              marginTop: 4,
              letterSpacing: "0.04em",
              marginBottom: 0,
            }}
          >
            {loading
              ? "Loading…"
              : `${voids.length} sparse regions · ranked by emptiness`}
          </p>
        </div>

        {/* Controls */}
        <div style={S.controls}>
          <label style={S.labelToggle}>
            <input
              type="checkbox"
              checked={voidsVisible}
              onChange={onToggleVoids}
              style={{ accentColor: "#d97706" }}
            />
            Show shapes
          </label>
          <label style={{ ...S.labelToggle, marginLeft: 8 }}>
            <input
              type="checkbox"
              checked={showVoidLabels}
              onChange={onToggleLabels}
              style={{ accentColor: "#d97706" }}
            />
            Show labels
          </label>
          {selectedVoidId !== null && (
            <button
              onClick={() => onSelectVoid(null)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: mono,
                fontSize: 9,
                color: "#a8a29e",
                padding: "2px 4px",
              }}
            >
              clear ×
            </button>
          )}
        </div>

        {/* ── Void list (scrollable) ── */}
        <div style={S.list}>
          {loading && (
            <p
              style={{
                fontFamily: mono,
                fontSize: 10,
                color: "#a8a29e",
                padding: 16,
                textAlign: "center",
              }}
            >
              Loading voids…
            </p>
          )}

          {!loading &&
            voids.map((v) => {
              const selected = v.void_id === selectedVoidId;
              const fill = emptinessOf(v);

              return (
                <div
                  key={v.void_id}
                  style={S.voidItem(selected)}
                  onClick={() => handleItemClick(v.void_id)}
                >
                  <div style={S.rankBadge}>
                    #{v.void_rank}
                    {" · "}r={v.empty_radius.toFixed(3)}
                    {" · "}
                    {v.border_papers.length} border papers
                    {v.shape_area > 0 && ` · area ${v.shape_area.toFixed(3)}`}
                  </div>
                  <div style={S.voidName(selected)}>
                    {v.name ?? `Void ${v.void_id}`}
                  </div>
                  <div style={S.emptyBar}>
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: "100%",
                        width: `${fill * 100}%`,
                        background: "#fbbf24",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              );
            })}
        </div>

        {/* ── Detail pane (fixed 50%, scrollable) ── */}
        {selectedVoid && (
          <div style={S.detail}>
            {/* Sticky section header */}
            <div style={S.selHeader}>
              <svg
                width={11}
                height={11}
                viewBox="-6 -6 12 12"
                style={{ flexShrink: 0 }}
              >
                <polygon points="0,-5 5,0 0,5 -5,0" fill="#fbbf24" />
              </svg>
              <span style={S.selHeaderLabel}>
                Selected · {selectedVoid.selected_papers.length} picks
              </span>
              <span style={S.selHeaderSub}>cross-pollination</span>
            </div>
            {/* ── Void metadata ── */}
            <div style={S.metaBlock}>
              <div style={S.detailName}>
                {selectedVoid.name ?? `Void ${selectedVoid.void_rank}`}
              </div>
              {selectedVoid.name_reasoning && (
                <div style={S.detailReasoning}>
                  {selectedVoid.name_reasoning}
                </div>
              )}
              <div style={S.detailMeta}>
                rank #{selectedVoid.void_rank}
                {" · "}empty_r={selectedVoid.empty_radius.toFixed(4)}
                {selectedVoid.shape_area > 0 &&
                  ` · hull ${selectedVoid.shape_area.toFixed(3)}`}
                {" · "}
                {selectedVoid.shape?.vertices?.length ?? 0} hull verts
              </div>
            </div>
            <div style={S.metaDivider} />

            {/* ── Selected papers ── */}
            {selectedVoid.selected_papers.length > 0 && (
              <>
                {selectedVoid.selected_papers.map((p) => (
                  <div
                    key={p.rank}
                    style={S.card(p.rank)}
                    onClick={() => openDOI(p.DOI)}
                    title={
                      p.DOI && p.DOI !== "null" ? `arXiv: ${p.DOI}` : undefined
                    }
                  >
                    {/* Score-encoded accent bar */}
                    <div style={S.accentBar(p.scores.combined)} />

                    <div style={S.cardInner}>
                      {/* Compass + rank pill + angle */}
                      <div style={S.cardTopRow}>
                        <SectorCompass
                          angleDeg={p.scores.angle_deg}
                          sector={p.scores.sector}
                          dim={p.rank > 0}
                        />
                        <span style={S.rankPill(p.rank)}>#{p.rank + 1}</span>
                        <span style={S.angleLbl}>
                          {p.scores.angle_deg.toFixed(0)}° · S{p.scores.sector}
                        </span>
                      </div>

                      {/* Title */}
                      <div style={S.cardTitle}>
                        {p.title.replace(/\n/g, " ").trim()}
                      </div>

                      {/* Chips */}
                      <div style={S.chipRow}>
                        {p.year != null && (
                          <span style={S.chip(true)}>{p.year}</span>
                        )}
                        {p.citation_count != null && (
                          <span style={S.chip(p.citation_count > 50)}>
                            {p.citation_count.toLocaleString()} ✦
                          </span>
                        )}
                        {p.DOI && p.DOI !== "null" && (
                          <span style={S.doiChip}>
                            {p.DOI.length > 15
                              ? p.DOI.slice(0, 13) + "…"
                              : p.DOI}
                          </span>
                        )}
                      </div>

                      {/* Score bars */}
                      <div style={S.scoreRows}>
                        <div style={S.scoreRow}>
                          <span style={S.scoreLbl}>cite</span>
                          <div style={S.scoreTrack}>
                            <div
                              style={S.scoreFill(p.scores.citation, "#fbbf24")}
                            />
                          </div>
                          <span style={S.scoreLbl}>rec</span>
                          <div style={S.scoreTrack}>
                            <div
                              style={S.scoreFill(p.scores.recency, "#f59e0b")}
                            />
                          </div>
                          <span style={S.scoreVal}>
                            {p.scores.combined.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={S.metaDivider} />
              </>
            )}

            {/* ── Border papers ── */}
            <div style={S.borderLabel}>
              Border papers ({selectedVoid.border_papers.length})
            </div>
            {selectedVoid.border_papers.map((p, i) => (
              <div
                key={i}
                style={S.borderRow}
                onClick={() => openDOI(p.DOI)}
                title={p.DOI ? `arXiv: ${p.DOI}` : undefined}
              >
                <p style={S.borderTitle}>
                  {p.title.replace(/\n/g, " ").trim()}
                </p>
                {p.DOI && p.DOI !== "null" && (
                  <p style={S.borderDOI}>{p.DOI}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
