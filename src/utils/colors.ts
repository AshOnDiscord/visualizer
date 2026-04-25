// Warm light-mode galaxy palette: cream/linen background, vibrant cluster colors
// Points colored by density: sparse=light indigo/periwinkle, dense=deep sapphire/violet

export const CLUSTER_PALETTE = [
  '#4F6EF7', // cobalt blue
  '#E8564A', // coral red
  '#2EC4B6', // teal
  '#F5A623', // amber
  '#9B5DE5', // violet
  '#00B4D8', // sky
  '#F72585', // hot pink
  '#3A86FF', // azure
  '#06D6A0', // mint
  '#FB8500', // orange
  '#8338EC', // purple
  '#FF006E', // rose
  '#3D405B', // slate
  '#E07A5F', // terracotta
  '#81B29A', // sage
  '#F2CC8F', // sand
  '#118AB2', // cerulean
  '#073B4C', // dark teal
  '#FFD166', // yellow
  '#EF476F', // pink-red
];

// export function clusterColor(id: number): string {
//   if (id < 0) return '#C8C8D8'; // noise: muted
//   return CLUSTER_PALETTE[id % CLUSTER_PALETTE.length]!;
// }

export function clusterColor(id: number): string {
  if (id < 0) return '#C8C8D8';
  const hue = (id * 137.508) % 360;
  return `oklch(0.62 0.17 ${hue.toFixed(1)})`;
}

// Density → color: low density = pale periwinkle, high = rich sapphire
export function densityToRGB(density: number, clusterId: number): [number, number, number] {
  if (clusterId < 0) {
    // Noise points: greyed out
    const v = 0.55 + density * 0.1;
    return [v, v, v + 0.05];
  }

  // Parse cluster base color
  const hex = CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length]!;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Blend toward white at low density, saturate at high density
  const t = 0.25 + density * 0.75;
  return [
    r * t + (1 - t) * 0.95,
    g * t + (1 - t) * 0.95,
    b * t + (1 - t) * 0.98,
  ];
}

export function hexToRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}