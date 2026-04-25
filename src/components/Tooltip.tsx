import React from 'react';
import type { ProcessedPaper } from '../types';

interface TooltipProps {
  paper: ProcessedPaper | null;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ paper, x, y, containerWidth, containerHeight }) => {
  if (!paper) return null;

  const PAD = 16;
  const TOOLTIP_W = 320;
  const TOOLTIP_H = 90; // estimated

  // Flip if near edge
  const left = x + PAD + TOOLTIP_W > containerWidth ? x - TOOLTIP_W - PAD : x + PAD;
  const top = y + PAD + TOOLTIP_H > containerHeight ? y - TOOLTIP_H - PAD : y + PAD;

  const hasDoi = paper.doi && paper.doi !== 'null' && paper.doi !== 'undefined' && paper.doi.trim() !== '';

  return (
    <div
      className="pointer-events-none absolute z-50 select-none"
      style={{ left, top, maxWidth: TOOLTIP_W }}
    >
      {/* Glass card */}
      <div
        style={{
          background: 'rgba(255,255,255,0.93)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 12,
          padding: '12px 14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <p
          className="text-xs leading-snug font-medium text-gray-800 mb-1"
          style={{ fontFamily: "'Crimson Pro', 'Georgia', serif", fontSize: 13, lineHeight: '1.4' }}
        >
          {paper.title || '(No title)'}
        </p>
        {hasDoi && (
          <p className="text-xs text-blue-500 truncate" style={{ fontSize: 11 }}>
            {paper.doi}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="text-xs text-gray-400"
            style={{ fontSize: 10, fontFamily: 'monospace' }}
          >
            id: {paper.id}
          </span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-400" style={{ fontSize: 10 }}>
            cluster {paper.clusterId < 0 ? 'noise' : paper.clusterId}
          </span>
        </div>
        {hasDoi && (
          <p className="text-xs mt-1" style={{ fontSize: 10, color: '#94a3b8' }}>
            Click to open paper ↗
          </p>
        )}
      </div>
    </div>
  );
};