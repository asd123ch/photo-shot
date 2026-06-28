// Models, providers, ratios and resolutions now live in services/registry.ts.

export enum MetadataCopyMode {
  ALL_EXIF = 'all',
  GPS_ONLY = 'gps',
  GPS_TIME = 'gps_time',
  CUSTOM = 'custom',
}

// Selectable fields for MetadataCopyMode.CUSTOM
export const METADATA_FIELDS = ['gps', 'datetime', 'camera', 'lens', 'exposure', 'copyright'] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  aspectRatio: string;
  resolution: string;
  exifData?: string;
  cost?: number; // USD, display only
  costEstimate?: boolean; // true = "~" estimate (token-billed); false = exact price
  model?: string; // model label, e.g. "Nano Banana Pro"
  provider?: string; // provider key, e.g. "gemini" (for cost aggregation)
}

export interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  exifData?: string;
  gpsCoords?: string; // human-readable, e.g. "47.38°N, 8.54°E"
}
