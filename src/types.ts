export interface Paper {
  id: string | number;
  title: string;
  doi: string;
  x: number;
  y: number;
}

export interface ProcessedPaper extends Paper {
  nx: number; // normalized [0,1]
  ny: number;
  density: number; // 0-1
  clusterId: number; // -1 = noise
}

export interface Cluster {
  id: number;
  hull: [number, number][]; // screen-space convex hull points
  hullNorm: [number, number][]; // normalized-space hull points
  color: string;
  centroid: [number, number];
  size: number;
  label: string;
  revealScale: number; 
}

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface AtlasState {
  papers: ProcessedPaper[];
  clusters: Map<number, Cluster>;
  loading: boolean;
  loadingProgress: string;
  error: string | null;
}