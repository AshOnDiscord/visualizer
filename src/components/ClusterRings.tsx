import React, { useMemo } from 'react';
import { type Cluster, type ViewTransform } from '../types';
import { hullToSmoothPath, expandHull, type Vec2 } from '../utils/convexHull';

interface ClusterRingsProps {
  clusters: Map<number, Cluster>;
  selectedClusterId: number | null;
  hoveredClusterId: number | null;
  transform: ViewTransform;
  width: number;
  height: number;
  onClusterClick: (id: number) => void;
  onClusterHover: (id: number | null) => void;
}

function normToScreen(nx: number, ny: number, transform: ViewTransform, w: number, h: number): [number, number] {
  // Match the WebGL shader: pos = (position + offset/scale) * scale
  const ox = transform.offsetX / transform.scale;
  const oy = transform.offsetY / transform.scale;
  const sx = (nx + ox) * transform.scale;
  const sy = (ny + oy) * transform.scale;
  return [sx, sy];
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
      // Map hull to screen space
      const screenHull: Vec2[] = cluster.hull.map(([nx, ny]) => {
        return normToScreen(nx, ny, transform, width, height);
      });

      // Extra padding for selected state
      const isSelected = cluster.id === selectedClusterId;
      const isHovered = cluster.id === hoveredClusterId;
      const displayHull = isSelected
        ? expandHull(screenHull, 6)
        : isHovered
        ? expandHull(screenHull, 3)
        : screenHull;

      const path = hullToSmoothPath(displayHull);
      const centroidScreen = normToScreen(cluster.centroid[0], cluster.centroid[1], transform, width, height);

      return { cluster, path, centroidScreen, isSelected, isHovered };
    });
  }, [clusters, transform, selectedClusterId, hoveredClusterId, width, height]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      style={{ zIndex: 10 }}
    >
      <defs>
        {rings.map(({ cluster }) => (
          <filter key={`glow-${cluster.id}`} id={`glow-${cluster.id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={cluster.id === selectedClusterId ? "4" : "2"} result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        ))}
      </defs>

      {rings.map(({ cluster, path, centroidScreen, isSelected, isHovered }) => {
        const opacity = selectedClusterId !== null && !isSelected ? 0.12 : isSelected ? 1 : isHovered ? 0.75 : 0.35;
        const strokeWidth = isSelected ? 2 : isHovered ? 1.5 : 1;
        const color = cluster.color;

        // Check if centroid is in viewport
        const inView =
          centroidScreen[0] > -200 && centroidScreen[0] < width + 200 &&
          centroidScreen[1] > -200 && centroidScreen[1] < height + 200;

        if (!inView && !isSelected) return null;

        return (
          <g
            key={cluster.id}
            className="pointer-events-auto cursor-pointer"
            onClick={() => onClusterClick(cluster.id)}
            onMouseEnter={() => onClusterHover(cluster.id)}
            onMouseLeave={() => onClusterHover(null)}
          >
            {/* Fill */}
            {/* <path
              d={path}
              fill={color}
              fillOpacity={isSelected ? 0.06 : isHovered ? 0.04 : 0.02}
              style={{ transition: 'fill-opacity 0.2s' }}
            /> */}

            {/* Stroke ring */}
            {/* <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              strokeDasharray={isSelected ? 'none' : '4 3'}
              style={{
                transition: 'stroke-opacity 0.2s, stroke-width 0.2s',
                filter: isSelected ? `drop-shadow(0 0 6px ${color}80)` : 'none',
              }}
            /> */}

            {/* Outer glow ring when selected */}
            {/* {isSelected && (
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={4}
                strokeOpacity={0.15}
                style={{ filter: `blur(4px)` }}
              />
            )} */}

            {/* Cluster size label */}
            {(isSelected || isHovered || transform.scale > 600) && (
              <text
                x={centroidScreen[0]}
                y={centroidScreen[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontSize={isSelected ? 11 : 9}
                fontFamily="'JetBrains Mono', monospace"
                opacity={isSelected ? 0.8 : 0.5}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {cluster.size.toLocaleString()} papers
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};