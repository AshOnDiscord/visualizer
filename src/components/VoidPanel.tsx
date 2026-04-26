/**
 * VoidPanel.tsx
 * -------------
 * Left-side slide-in panel for browsing and selecting voids.
 * Displays LLM-generated void names, reasoning, shape area,
 * and border paper detail.
 *
 * Colors updated to match VoidOverlay's brighter amber palette:
 *  - Accent:  oklch(0.88 0.19 55) → bright gold  (#fbbf24-ish, screen-readable)
 *  - Mid:     #d97706  → warm amber for secondary labels
 *  - Dark bg: rgba(251,191,36,0.10) for selected item tint
 */

import React, { useState, useCallback } from 'react';
import type { Void } from '../hooks/useVoidData';

interface VoidPanelProps {
  voids:          Void[];
  selectedVoidId: number | null;
  showVoidLabels: boolean;
  voidsVisible:   boolean;
  loading:        boolean;
  onSelectVoid:   (id: number | null) => void;
  onToggleLabels: () => void;
  onToggleVoids:  () => void;
}

// ── Palette ───────────────────────────────────────────────────────────────────
// Kept in sync with VoidOverlay's makeSolid / makeColor values.

const AMBER_BRIGHT  = '#f59e0b';   // close to oklch(0.88 0.19 55) in sRGB — vivid gold
const AMBER_MID     = '#d97706';   // amber-600, for secondary UI chrome
const AMBER_DARK    = '#92400e';   // amber-900, only for heavy-contrast needs (avoided mostly)
const AMBER_TINT    = 'rgba(251,191,36,0.10)';
const AMBER_TINT_HV = 'rgba(251,191,36,0.06)';
const AMBER_BAR     = '#fbbf24';
const AMBER_BAR_BG  = '#fef3c7';
const AMBER_BORDER  = 'rgba(251,191,36,0.30)';

// ── Styles ────────────────────────────────────────────────────────────────────

const PANEL_W = 310;
const mono  = "'JetBrains Mono', monospace";
const serif = "'Crimson Pro', Georgia, serif";

const styles = {
  toggle: {
    position:              'absolute'       as const,
    top:                   '50%',
    left:                  0,
    transform:             'translateY(-50%)',
    zIndex:                60,
    background:            'rgba(255,255,255,0.92)',
    backdropFilter:        'blur(12px)',
    WebkitBackdropFilter:  'blur(12px)',
    border:                '1px solid rgba(0,0,0,0.08)',
    borderLeft:            'none',
    borderRadius:          '0 8px 8px 0',
    padding:               '12px 6px',
    cursor:                'pointer',
    display:               'flex',
    flexDirection:         'column' as const,
    alignItems:            'center',
    gap:                   4,
    boxShadow:             '2px 0 12px rgba(0,0,0,0.06)',
    transition:            'left 0.28s cubic-bezier(.4,0,.2,1)',
  },
  toggleLabel: {
    writingMode:     'vertical-rl'  as const,
    textOrientation: 'mixed'        as const,
    fontFamily:      mono,
    fontSize:        10,
    letterSpacing:   '0.08em',
    color:           AMBER_MID,
    userSelect:      'none'         as const,
  },
  panel: {
    position:             'absolute'      as const,
    top:                  0,
    left:                 0,
    width:                PANEL_W,
    height:               '100%',
    zIndex:               55,
    background:           'rgba(255,255,255,0.94)',
    backdropFilter:       'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRight:          `1px solid ${AMBER_BORDER}`,
    boxShadow:            '4px 0 24px rgba(0,0,0,0.07)',
    display:              'flex',
    flexDirection:        'column' as const,
    transition:           'transform 0.28s cubic-bezier(.4,0,.2,1)',
  },
  header: {
    padding:       '16px 16px 10px',
    borderBottom:  `1px solid ${AMBER_BORDER}`,
    flexShrink:    0,
  },
  controls: {
    padding:       '8px 16px',
    borderBottom:  `1px solid rgba(251,191,36,0.15)`,
    display:       'flex',
    alignItems:    'center',
    gap:           8,
    flexShrink:    0,
  },
  labelToggle: {
    display:    'flex',
    alignItems: 'center',
    gap:        6,
    cursor:     'pointer',
    fontFamily: mono,
    fontSize:   10,
    color:      '#78716c',
    userSelect: 'none' as const,
  },
  list: {
    overflowY: 'auto' as const,
    flex:      1,
    padding:   '4px 0',
  },
  voidItem: (selected: boolean) => ({
    padding:      '10px 14px',
    cursor:       'pointer',
    background:   selected ? AMBER_TINT : 'transparent',
    borderLeft:   selected ? `3px solid ${AMBER_BRIGHT}` : '3px solid transparent',
    transition:   'background 0.12s',
  }),
  rankBadge: {
    fontFamily:   mono,
    fontSize:     9,
    color:        '#a8a29e',
    marginBottom: 3,
    letterSpacing:'0.04em',
  },
  voidName: (selected: boolean) => ({
    fontFamily:   serif,
    fontSize:     13,
    fontWeight:   selected ? 700 : 500,
    color:        selected ? AMBER_MID : '#292524',
    lineHeight:   1.3,
    marginBottom: 3,
  }),
  emptyBar: {
    height:       3,
    borderRadius: 2,
    background:   AMBER_BAR_BG,
    marginTop:    5,
    position:     'relative' as const,
    overflow:     'hidden'   as const,
  },

  // ── Detail pane ──
  detail: {
    borderTop:   `1px solid ${AMBER_BORDER}`,
    flexShrink:  0,
    maxHeight:   '46%',
    overflowY:   'auto' as const,
    padding:     '12px 16px 16px',
  },
  detailName: {
    fontFamily:   serif,
    fontSize:     15,
    fontWeight:   700,
    color:        AMBER_MID,
    lineHeight:   1.3,
    marginBottom: 4,
  },
  detailReasoning: {
    fontFamily:   serif,
    fontSize:     12,
    color:        '#57534e',
    lineHeight:   1.5,
    marginBottom: 10,
    fontStyle:    'italic',
  },
  detailMeta: {
    fontFamily:   mono,
    fontSize:     9,
    color:        '#a8a29e',
    marginBottom: 10,
    letterSpacing:'0.03em',
  },
  papersSectionLabel: {
    fontFamily:    mono,
    fontSize:      9,
    color:         AMBER_MID,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom:  6,
  },
  paperRow: {
    padding:      '5px 0',
    borderBottom: 'rgba(251,191,36,0.12) 1px solid',
    cursor:       'pointer',
  },
  paperTitle: {
    fontFamily: serif,
    fontSize:   12,
    color:      '#292524',
    lineHeight: 1.35,
  },
  paperDOI: {
    fontFamily: mono,
    fontSize:   9,
    color:      AMBER_MID,
    marginTop:  2,
  },
};

// ── Emptiness score 0–1 from log_density ─────────────────────────────────────
function emptinessOf(v: Void) {
  return Math.min(1, Math.max(0, (-v.log_density - 6.9) / 0.32));
}

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

  const selectedVoid = voids.find(v => v.void_id === selectedVoidId) ?? null;

  const handleItemClick = useCallback((id: number) => {
    onSelectVoid(id === selectedVoidId ? null : id);
  }, [selectedVoidId, onSelectVoid]);

  const handlePaperClick = useCallback((doi: string) => {
    if (!doi || doi === 'null') return;
    const url = doi.startsWith('http') ? doi : `https://arxiv.org/abs/${doi}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <>
      {/* ── Toggle button ── */}
      <div
        style={{ ...styles.toggle, left: panelOpen ? PANEL_W : 0 }}
        onClick={() => setPanelOpen(o => !o)}
        title={panelOpen ? 'Close void panel' : 'Open void panel'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <polygon
            points="8,2 14,8 8,14 2,8"
            stroke={AMBER_BRIGHT}
            strokeWidth="1.4"
            strokeDasharray="3 2"
            fill={AMBER_TINT_HV}
          />
          <circle cx="8" cy="8" r="1.5" fill={AMBER_BRIGHT} fillOpacity="0.6" />
        </svg>
        <span style={styles.toggleLabel}>
          {panelOpen ? 'CLOSE' : 'VOIDS'}
        </span>
      </div>

      {/* ── Panel ── */}
      <div
        style={{
          ...styles.panel,
          transform:     panelOpen ? 'translateX(0)' : `translateX(-${PANEL_W}px)`,
          pointerEvents: panelOpen ? 'all' : 'none',
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <p style={{
            fontFamily: serif, fontSize: 17, fontWeight: 600,
            color: '#1c1917', margin: 0, lineHeight: 1,
          }}>
            Knowledge Voids
          </p>
          <p style={{
            fontFamily: mono, fontSize: 9, color: AMBER_MID,
            marginTop: 4, letterSpacing: '0.04em',
          }}>
            {loading
              ? 'Loading…'
              : `${voids.length} sparse regions · ranked by emptiness`}
          </p>
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          <label style={styles.labelToggle}>
            <input
              type="checkbox"
              checked={voidsVisible}
              onChange={onToggleVoids}
              style={{ accentColor: AMBER_BRIGHT }}
            />
            Show shapes
          </label>
          <label style={{ ...styles.labelToggle, marginLeft: 8 }}>
            <input
              type="checkbox"
              checked={showVoidLabels}
              onChange={onToggleLabels}
              style={{ accentColor: AMBER_BRIGHT }}
            />
            Show labels
          </label>
          {selectedVoidId !== null && (
            <button
              onClick={() => onSelectVoid(null)}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: mono, fontSize: 9,
                color: '#a8a29e', padding: '2px 4px',
              }}
            >
              clear ×
            </button>
          )}
        </div>

        {/* Void list */}
        <div style={styles.list}>
          {loading && (
            <p style={{
              fontFamily: mono, fontSize: 10, color: '#a8a29e',
              padding: 16, textAlign: 'center',
            }}>
              Loading voids…
            </p>
          )}

          {!loading && voids.map(v => {
            const selected = v.void_id === selectedVoidId;
            const fill     = emptinessOf(v);
            const name     = v.name ?? `Void ${v.void_id}`;

            return (
              <div
                key={v.void_id}
                style={styles.voidItem(selected)}
                onClick={() => handleItemClick(v.void_id)}
              >
                <div style={styles.rankBadge}>
                  #{v.void_rank} · {v.border_papers.length} border papers
                  {v.shape_area > 0 &&
                    ` · area ${v.shape_area.toFixed(3)}`}
                </div>

                <div style={styles.voidName(selected)}>
                  {name}
                </div>

                {/* Emptiness bar */}
                <div style={styles.emptyBar}>
                  <div style={{
                    position:     'absolute',
                    top:          0, left: 0,
                    height:       '100%',
                    width:        `${fill * 100}%`,
                    background:   AMBER_BAR,
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Selected void detail ── */}
        {selectedVoid && (
          <div style={styles.detail}>
            <div style={styles.detailName}>
              {selectedVoid.name ?? `Void ${selectedVoid.void_rank}`}
            </div>

            {selectedVoid.name_reasoning && (
              <div style={styles.detailReasoning}>
                {selectedVoid.name_reasoning}
              </div>
            )}

            <div style={styles.detailMeta}>
              rank #{selectedVoid.void_rank}
              {' · '}
              log_density {selectedVoid.log_density.toFixed(3)}
              {selectedVoid.shape_area > 0 &&
                ` · hull area ${selectedVoid.shape_area.toFixed(3)}`}
              {' · '}
              {selectedVoid.shape?.vertices?.length ?? 0} hull vertices
            </div>

            <div style={styles.papersSectionLabel}>
              Border papers ({selectedVoid.border_papers.length})
            </div>
            {selectedVoid.border_papers.map((p, i) => (
              <div
                key={i}
                style={styles.paperRow}
                onClick={() => handlePaperClick(p.DOI)}
                title={p.DOI ? `Open arXiv: ${p.DOI}` : undefined}
              >
                <p style={styles.paperTitle}>
                  {p.title.replace(/\n/g, ' ').trim()}
                </p>
                {p.DOI && p.DOI !== 'null' && (
                  <p style={styles.paperDOI}>{p.DOI}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};