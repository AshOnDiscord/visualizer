import React, { useMemo } from 'react';
import { type Cluster, type ViewTransform } from '../types';
import { hullToSmoothPath, expandHull, type Vec2 } from '../utils/convexHull';
import { wrapLabel } from '../utils/measureLabels';

interface ClusterRingsProps {
  clusters:          Map<number, Cluster>;
  selectedClusterId: number | null;
  hoveredClusterId:  number | null;
  transform:         ViewTransform;
  width:             number;
  height:            number;
  onClusterClick:    (id: number) => void;
  onClusterHover:    (id: number | null) => void;
}

const LABEL_MAX_CHARS     = 16;
const LABEL_MAX_CHARS_SEL = 20;

function normToScreen(
  nx: number,
  ny: number,
  transform: ViewTransform,
): [number, number] {
  const ox = transform.offsetX / transform.scale;
  const oy = transform.offsetY / transform.scale;
  return [
    (nx + ox) * transform.scale,
    (ny + oy) * transform.scale,
  ];
}

export const ClusterRings: React.FC<ClusterRingsProps> = ({
  clusters,
  selectedClusterId,
  hoveredClusterId,
  transform,
  width,
  height,
  onClusterClick,
  onClusterHover,
}) => {
  const rings = useMemo(() => {
    return Array.from(clusters.values()).map(cluster => {
      const screenHull: Vec2[] = cluster.hull.map(([nx, ny]) =>
        normToScreen(nx, ny, transform),
      );

      const isSelected  = cluster.id === selectedClusterId;
      const isHovered   = cluster.id === hoveredClusterId;
      const displayHull = isSelected
        ? expandHull(screenHull, 6)
        : isHovered
          ? expandHull(screenHull, 3)
          : screenHull;

      const path           = hullToSmoothPath(displayHull);
      const centroidScreen = normToScreen(cluster.centroid[0], cluster.centroid[1], transform);

      // Label is visible when:
      //   - scale has reached or passed the precomputed reveal threshold, OR
      //   - the cluster is selected / hovered (always show those)
      const showLabel =
        isSelected ||
        isHovered  ||
        transform.scale >= (cluster.revealScale ?? Infinity);

      console.log(transform.scale)

      return { cluster, path, centroidScreen, isSelected, isHovered, showLabel };
    });
  }, [clusters, transform, selectedClusterId, hoveredClusterId]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      style={{ zIndex: 10 }}
    >
      <defs>
        {rings.map(({ cluster }) => (
          <filter
            key={`glow-${cluster.id}`}
            id={`glow-${cluster.id}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur
              stdDeviation={cluster.id === selectedClusterId ? '4' : '2'}
              result="blur"
            />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        ))}
      </defs>

      {rings.map(({ cluster, path, centroidScreen, isSelected, isHovered, showLabel }) => {
        const opacity =
          selectedClusterId !== null && !isSelected
            ? 0.12
            : isSelected
              ? 1
              : isHovered
                ? 0.75
                : 0.35;
        const strokeWidth = isSelected ? 2 : isHovered ? 1.5 : 1;
        const color       = cluster.color;

        const inView =
          centroidScreen[0] > -200 && centroidScreen[0] < width  + 200 &&
          centroidScreen[1] > -200 && centroidScreen[1] < height + 200;

        if (!inView && !isSelected) return null;

        const fontSize    = isSelected ? 14 : 12;
        const maxChars    = isSelected ? LABEL_MAX_CHARS_SEL : LABEL_MAX_CHARS;
        const lines       = wrapLabel(cluster.label ?? `Cluster ${cluster.id}`, maxChars);
        const lineHeight  = fontSize * 1.3;
        const blockHeight = lines.length * lineHeight;
        const startY      = centroidScreen[1] - blockHeight / 2 + lineHeight / 2;

        return (
          <g
            key={cluster.id}
            className="pointer-events-auto cursor-pointer"
            onClick={() => onClusterClick(cluster.id)}
            onMouseEnter={() => onClusterHover(cluster.id)}
            onMouseLeave={() => onClusterHover(null)}
          >
            {showLabel &&
              lines.map((line, i) => (
                <text
                  key={i}
                  x={centroidScreen[0]}
                  y={startY + i * lineHeight}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize={fontSize}
                  fontWeight={isSelected ? 600 : 500}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  <tspan
                    fill="white"
                    stroke="rgba(0,0,0,0.85)"
                    strokeWidth={isSelected ? 3.5 : 2.5}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    fillOpacity={1}
                  >
                    {line}
                  </tspan>
                </text>
              ))}
          </g>
        );
      })}
    </svg>
  );
};