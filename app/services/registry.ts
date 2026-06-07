// Provider / model capability registry.
//
// One entry per selectable model, with everything the UI and adapters need:
// supported aspect ratios, resolutions, multi-image limits, output formats,
// pricing, OpenRouter FLEX support and model-specific extras. Data sourced from
// the official provider docs (Gemini API, wavespeed.ai model schemas, OpenRouter
// docs) — see the research matrix in the project history.

export type Provider = 'gemini' | 'wavespeed' | 'openrouter';

// 'text' = text-to-image only (no reference image)
// 'edit' = requires at least one reference image
// 'both' = reference image optional
export type InputMode = 'text' | 'edit' | 'both';

export type Pricing =
  | { kind: 'flat'; usd: number }                                   // same price for any resolution
  | { kind: 'perResolution'; usd: Record<string, number> }          // resolution token -> price
  | { kind: 'qualityRes'; usd: Record<string, Record<string, number>> } // quality -> resolution -> price
  | { kind: 'from'; usd: number }                                   // "from $X / image"
  | { kind: 'token'; inPerM: number; outPerM: number; estPerImage?: number }; // token-billed

export interface ModelExtras {
  quality?: { values: string[]; default: string }; // e.g. gpt-image-2
  webSearch?: boolean;   // wavespeed nano-banana: enable_web_search (+$0.014)
  imageSearch?: boolean; // wavespeed nano-banana-2: enable_image_search (+$0.014)
}

export interface ModelDef {
  key: string;          // unique internal key
  provider: Provider;
  apiModel: string;     // endpoint path / slug / model id used in the request
  label: string;        // UI display name
  tag: string;          // short descriptor
  input: InputMode;
  maxImages: number;    // 0 for text-only; otherwise max reference images
  ratios: string[];     // supported aspect-ratio enum (no 'auto'); [] = model decides / none
  freeSize?: boolean;   // size derived from ratio x long-edge (Seedream wavespeed)
  pixelBudget?: number; // output sized by a total-pixel budget spread over the ratio (e.g. Grok 2K)
  baseLongEdge?: number;// resolution-less model with a fixed long edge
  singleImageParam?: boolean; // WaveSpeed edit models that take a single `image` param instead of `images`
  resolutions: string[];// display tokens, e.g. ['1K','2K','4K']; [] = N/A
  defaultResolution?: string;
  outputFormats?: string[];
  pricing: Pricing;
  flex?: boolean;       // OpenRouter: offer service_tier 'flex' (~50% cheaper, slower)
  extras?: ModelExtras;
  notes?: string;
}

// --- Aspect-ratio sets -----------------------------------------------------
const STD = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '21:9'];
const EXTREME = ['4:1', '1:4', '8:1', '1:8'];
const NB2_RATIOS = [...STD, ...EXTREME];
const SEEDREAM_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'];
const GROK_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'];

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini (AI Studio)',
  wavespeed: 'WaveSpeed',
  openrouter: 'OpenRouter',
};

export const getProviderLabel = (p: Provider): string => PROVIDER_LABELS[p];

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

export const MODELS: ModelDef[] = [
  // --- Gemini (direct) -----------------------------------------------------
  {
    key: 'gemini:flash',
    provider: 'gemini',
    apiModel: 'gemini-3.1-flash-image', // GA id (preview shut down 2026-06-25)
    label: 'Nano Banana 2',
    tag: 'Flash · fast',
    input: 'both',
    maxImages: 5,
    ratios: NB2_RATIOS,
    resolutions: ['2K', '4K'],
    defaultResolution: '2K',
    pricing: { kind: 'perResolution', usd: { '0.5K': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 } },
  },
  {
    key: 'gemini:pro',
    provider: 'gemini',
    apiModel: 'gemini-3-pro-image',
    label: 'Nano Banana Pro',
    tag: 'Best quality',
    input: 'both',
    maxImages: 5,
    ratios: STD,
    resolutions: ['2K', '4K'],
    defaultResolution: '2K',
    pricing: { kind: 'perResolution', usd: { '1K': 0.134, '2K': 0.134, '4K': 0.24 } },
  },

  // --- WaveSpeed -----------------------------------------------------------
  {
    key: 'wavespeed:seedream-v5-lite-edit',
    provider: 'wavespeed',
    apiModel: 'bytedance/seedream-v5.0-lite/edit',
    label: 'Seedream v5 Lite',
    tag: 'Edit · cheap',
    input: 'edit',
    maxImages: 5,
    ratios: SEEDREAM_RATIOS,
    freeSize: true,
    resolutions: ['2K', '4K'],
    defaultResolution: '4K',
    outputFormats: ['jpeg', 'png'],
    pricing: { kind: 'flat', usd: 0.035 },
  },
  {
    key: 'wavespeed:seedream-v45-edit',
    provider: 'wavespeed',
    apiModel: 'bytedance/seedream-v4.5/edit',
    label: 'Seedream v4.5',
    tag: 'Edit',
    input: 'edit',
    maxImages: 5,
    ratios: SEEDREAM_RATIOS,
    freeSize: true,
    resolutions: ['2K', '4K'],
    defaultResolution: '4K',
    pricing: { kind: 'flat', usd: 0.04 },
  },
  {
    key: 'wavespeed:nano-banana-pro-edit',
    provider: 'wavespeed',
    apiModel: 'google/nano-banana-pro/edit',
    label: 'Nano Banana Pro',
    tag: 'Edit',
    input: 'edit',
    maxImages: 5,
    ratios: STD,
    resolutions: ['2K', '4K'],
    defaultResolution: '2K',
    outputFormats: ['png', 'jpeg'],
    pricing: { kind: 'perResolution', usd: { '1K': 0.14, '2K': 0.14, '4K': 0.24 } },
  },
  {
    key: 'wavespeed:nano-banana-2-edit',
    provider: 'wavespeed',
    apiModel: 'google/nano-banana-2/edit',
    label: 'Nano Banana 2',
    tag: 'Edit',
    input: 'edit',
    maxImages: 5,
    ratios: NB2_RATIOS,
    resolutions: ['2K', '4K'],
    defaultResolution: '2K',
    outputFormats: ['png', 'jpeg'],
    pricing: { kind: 'perResolution', usd: { '0.5K': 0.045, '1K': 0.07, '2K': 0.105, '4K': 0.14 } },
    extras: { webSearch: true, imageSearch: true },
  },
  {
    key: 'wavespeed:nano-banana-pro-edit-ultra',
    provider: 'wavespeed',
    apiModel: 'google/nano-banana-pro/edit-ultra',
    label: 'Nano Banana Pro Ultra',
    tag: 'Edit · 4K/8K',
    input: 'edit',
    maxImages: 5,
    ratios: STD,
    resolutions: ['4K', '8K'],
    defaultResolution: '4K',
    outputFormats: ['png', 'jpeg'],
    pricing: { kind: 'perResolution', usd: { '4K': 0.15, '8K': 0.18 } },
    notes: 'Slow (~2 min).',
  },
  {
    key: 'wavespeed:nano-banana-2-edit-fast',
    provider: 'wavespeed',
    apiModel: 'google/nano-banana-2/edit-fast',
    label: 'Nano Banana 2 Fast',
    tag: 'Edit · fast',
    input: 'edit',
    maxImages: 5,
    ratios: NB2_RATIOS,
    resolutions: ['2K', '4K'],
    defaultResolution: '2K',
    outputFormats: ['png', 'jpeg'],
    pricing: { kind: 'perResolution', usd: { '2K': 0.045, '4K': 0.05 } },
    extras: { webSearch: true },
  },
  {
    key: 'wavespeed:gpt-image-2-edit',
    provider: 'wavespeed',
    apiModel: 'openai/gpt-image-2/edit',
    label: 'GPT Image 2',
    tag: 'Edit',
    input: 'edit',
    maxImages: 5,
    ratios: STD,
    resolutions: ['2K', '4K'],
    defaultResolution: '2K',
    outputFormats: ['png', 'jpeg', 'webp'],
    pricing: {
      kind: 'qualityRes',
      usd: {
        low: { '1K': 0.03, '2K': 0.06, '4K': 0.09 },
        medium: { '1K': 0.06, '2K': 0.12, '4K': 0.18 },
        high: { '1K': 0.22, '2K': 0.44, '4K': 0.66 },
      },
    },
    extras: { quality: { values: ['low', 'medium', 'high'], default: 'medium' } },
  },
  {
    key: 'wavespeed:grok-imagine-edit',
    provider: 'wavespeed',
    apiModel: 'x-ai/grok-imagine-image-quality/edit',
    label: 'Grok Imagine',
    tag: 'Edit',
    input: 'edit',
    maxImages: 1,
    singleImageParam: true, // WaveSpeed Grok edit takes a single `image` param
    ratios: GROK_RATIOS,
    resolutions: ['2K'], // 1k/2k available; 2K is the max and our floor
    defaultResolution: '2K',
    pixelBudget: 2816 * 1584, // 2K is area-based (~2112²); 16:9 -> 2816x1584 (confirmed)
    outputFormats: ['jpeg', 'png', 'webp'],
    pricing: { kind: 'perResolution', usd: { '1K': 0.07, '2K': 0.09 } },
  },

  // --- OpenRouter ----------------------------------------------------------
  {
    key: 'openrouter:gemini-3-pro',
    provider: 'openrouter',
    apiModel: 'google/gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    tag: 'OpenRouter',
    input: 'both',
    maxImages: 5,
    ratios: STD,
    resolutions: ['2K', '4K'], // OpenRouter image_config.image_size
    defaultResolution: '2K',
    pricing: { kind: 'token', inPerM: 2, outPerM: 12, estPerImage: 0.13 },
    flex: true,
  },
  {
    key: 'openrouter:gemini-3.1-flash',
    provider: 'openrouter',
    apiModel: 'google/gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    tag: 'OpenRouter',
    input: 'both',
    maxImages: 5,
    ratios: NB2_RATIOS,
    resolutions: ['2K', '4K'], // OpenRouter image_config.image_size
    defaultResolution: '2K',
    pricing: { kind: 'token', inPerM: 0.5, outPerM: 3, estPerImage: 0.07 },
    flex: true,
  },
  {
    key: 'openrouter:gpt-5.4-image-2',
    provider: 'openrouter',
    apiModel: 'openai/gpt-5.4-image-2',
    label: 'GPT Image 2',
    tag: 'OpenRouter',
    input: 'both',
    maxImages: 5,
    ratios: STD,
    resolutions: ['2K', '4K'], // OpenRouter image_config.image_size
    defaultResolution: '2K',
    pricing: { kind: 'token', inPerM: 8, outPerM: 15, estPerImage: 0.12 },
    flex: true,
  },
  {
    key: 'openrouter:seedream-4.5',
    provider: 'openrouter',
    apiModel: 'bytedance-seed/seedream-4.5',
    label: 'Seedream v4.5',
    tag: 'OpenRouter',
    input: 'both',
    maxImages: 5,
    ratios: SEEDREAM_RATIOS,
    resolutions: ['2K', '4K'], // OpenRouter image_config.image_size
    defaultResolution: '2K',
    pricing: { kind: 'flat', usd: 0.04 },
  },
];

// ---------------------------------------------------------------------------
// Lookups & helpers
// ---------------------------------------------------------------------------

const MODEL_BY_KEY: Record<string, ModelDef> = Object.fromEntries(MODELS.map((m) => [m.key, m]));

export const getModel = (key: string): ModelDef | undefined => MODEL_BY_KEY[key];

export const PROVIDERS: Provider[] = ['gemini', 'wavespeed', 'openrouter'];

export const modelsByProvider = (p: Provider): ModelDef[] => MODELS.filter((m) => m.provider === p);

export const DEFAULT_MODEL_KEY = 'gemini:flash';

// ratio value as a number, e.g. "16:9" -> 1.777
export const ratioValue = (ratio: string): number => {
  const [w, h] = ratio.split(':').map(Number);
  return h ? w / h : 1;
};

/** Closest ratio from a standard set (for display when no model is involved, e.g. metadata). */
export const closestRatio = (w: number, h: number, ratios: string[] = STD): string => {
  if (!w || !h) return '';
  const actual = w / h;
  return ratios.reduce((best, r) =>
    Math.abs(ratioValue(r) - actual) < Math.abs(ratioValue(best) - actual) ? r : best,
  );
};

/** Resolve "auto" to a concrete ratio the model supports (or '' to let the model decide). */
export const resolveRatio = (
  def: ModelDef,
  ratio: string,
  imgDims?: { w: number; h: number },
): string => {
  if (ratio && ratio !== 'auto') return ratio;
  if (def.ratios.length === 0) return ''; // model has no ratio control
  if (imgDims && imgDims.w && imgDims.h) {
    const actual = imgDims.w / imgDims.h;
    return def.ratios.reduce((best, r) =>
      Math.abs(ratioValue(r) - actual) < Math.abs(ratioValue(best) - actual) ? r : best,
    );
  }
  return def.ratios.includes('1:1') ? '1:1' : def.ratios[0];
};

const LONG_EDGE: Record<string, number> = { '0.5K': 512, '1K': 1024, '2K': 2048, '4K': 4096, '8K': 8192 };

/** Seedream free-size: WxH (multiple of 8, clamped 512..8192) from ratio + resolution long-edge. */
export const seedreamSize = (ratio: string, resolution: string): string => {
  const longEdge = LONG_EDGE[resolution] ?? 4096;
  const r = ratioValue(ratio || '1:1');
  let w: number;
  let h: number;
  if (r >= 1) { w = longEdge; h = longEdge / r; } else { h = longEdge; w = longEdge * r; }
  const round8 = (v: number) => Math.min(8192, Math.max(512, Math.round(v / 8) * 8));
  return `${round8(w)}*${round8(h)}`;
};

// Exact output dimensions for the Gemini / Nano Banana family, straight from
// Google's image-generation docs (ratio -> resolution -> [w, h]). "2K"/"4K" are
// area-based (~2048²/~4096²), NOT long-edge, so they can't be derived by scaling.
// Flash & Pro share these for the shared ratios; the 1:4/4:1/1:8/8:1 rows are
// Flash-only (Pro doesn't expose them). Only the resolutions the app offers.
const GEMINI_DIMS: Record<string, Record<string, [number, number]>> = {
  '1:1':  { '2K': [2048, 2048], '4K': [4096, 4096] },
  '2:3':  { '2K': [1696, 2528], '4K': [3392, 5056] },
  '3:2':  { '2K': [2528, 1696], '4K': [5056, 3392] },
  '3:4':  { '2K': [1792, 2400], '4K': [3584, 4800] },
  '4:3':  { '2K': [2400, 1792], '4K': [4800, 3584] },
  '4:5':  { '2K': [1856, 2304], '4K': [3712, 4608] },
  '5:4':  { '2K': [2304, 1856], '4K': [4608, 3712] },
  '9:16': { '2K': [1536, 2752], '4K': [3072, 5504] },
  '16:9': { '2K': [2752, 1536], '4K': [5504, 3072] },
  '21:9': { '2K': [3168, 1344], '4K': [6336, 2688] },
  '1:4':  { '2K': [1024, 4096], '4K': [2048, 8192] },
  '4:1':  { '2K': [4096, 1024], '4K': [8192, 2048] },
  '1:8':  { '2K': [768, 6144],  '4K': [1536, 12288] },
  '8:1':  { '2K': [6144, 768],  '4K': [12288, 1536] },
};

export const isGeminiFamily = (def: ModelDef): boolean =>
  def.provider === 'gemini' || /nano-banana|gemini/.test(def.apiModel);

/** Final output size (px) for the current ratio + resolution, for the UI hint.
 *  Resolves "auto" from the reference image. Exact for the Gemini/Nano Banana
 *  family (lookup table) and Seedream (free-size); a long-edge estimate
 *  otherwise. `estimate` flags which case it is. Null when the model has no
 *  resolution control (the provider decides). */
export const finalResolution = (
  def: ModelDef,
  ratio: string,
  resolution: string,
  imgDims?: { w: number; h: number },
): { w: number; h: number; estimate: boolean } | null => {
  const resolved = resolveRatio(def, ratio, imgDims) || '1:1';
  const r = ratioValue(resolved);
  const round8 = (v: number) => Math.round(v / 8) * 8;

  // Area-budget models (e.g. Grok 2K): output sized by total pixels across the
  // ratio, not by a fixed long edge. 16:9 -> 2816x1584 (confirmed).
  if (def.pixelBudget) {
    return {
      w: round8(Math.sqrt(def.pixelBudget * r)),
      h: round8(Math.sqrt(def.pixelBudget / r)),
      estimate: true,
    };
  }

  // 1) Models with a 2K/4K-style resolution control.
  if (def.resolutions.length > 0 && resolution) {
    if (isGeminiFamily(def)) {
      const dims = GEMINI_DIMS[resolved]?.[resolution];
      if (dims) return { w: dims[0], h: dims[1], estimate: false };
    }
    const longEdge = LONG_EDGE[resolution];
    if (!longEdge) return null;
    const dims = r >= 1
      ? { w: round8(longEdge), h: round8(longEdge / r) }
      : { w: round8(longEdge * r), h: round8(longEdge) };
    return { ...dims, estimate: !def.freeSize }; // Seedream free-size is exact
  }

  // 2) Resolution-less models with a fixed output footprint (Recraft ~2K presets).
  if (def.baseLongEdge) {
    const L = def.baseLongEdge;
    const dims = r >= 1 ? { w: round8(L), h: round8(L / r) } : { w: round8(L * r), h: round8(L) };
    return { ...dims, estimate: true };
  }

  return null;
};

export interface CostInput {
  resolution?: string;
  quality?: string;
  webSearch?: boolean;
  imageSearch?: boolean;
  flex?: boolean;
}

export interface CostResult {
  usd: number | null;  // null = not derivable (e.g. token-billed without estimate)
  from: boolean;       // "from $X" (varies)
  tokenBilled: boolean;
}

/** Estimated USD per image for display. */
export const computeCost = (def: ModelDef, sel: CostInput = {}): CostResult => {
  const p = def.pricing;
  let usd: number | null = null;
  let from = false;
  let tokenBilled = false;

  const res = sel.resolution || def.defaultResolution || '';
  if (p.kind === 'flat') {
    usd = p.usd;
  } else if (p.kind === 'perResolution') {
    usd = p.usd[res] ?? null;
  } else if (p.kind === 'qualityRes') {
    const q = sel.quality || def.extras?.quality?.default || 'medium';
    usd = p.usd[q]?.[res] ?? null;
  } else if (p.kind === 'from') {
    usd = p.usd;
    from = true;
  } else if (p.kind === 'token') {
    tokenBilled = true;
    usd = p.estPerImage ?? null;
    if (usd != null) from = true; // estimate
  }

  if (usd != null) {
    if (sel.webSearch && def.extras?.webSearch) usd += 0.014;
    if (sel.imageSearch && def.extras?.imageSearch) usd += 0.014;
    if (sel.flex && def.flex) usd *= 0.5; // FLEX ≈ 50% cheaper
  }

  return { usd, from, tokenBilled };
};

// Format a USD amount with up to 3 decimals, trailing zeros stripped, but always
// at least 2 (cents). 0.09 -> "0.09", 0.045 -> "0.045", 0.1 -> "0.10".
export const formatUsd = (n: number): string => {
  let s = n.toFixed(3).replace(/0+$/, '');
  if (s.endsWith('.')) s = s.slice(0, -1);
  const dot = s.indexOf('.');
  const decimals = dot === -1 ? 0 : s.length - dot - 1;
  return decimals < 2 ? n.toFixed(2) : s;
};

// Price for the current settings. Exact prices (flat / per-resolution / quality)
// show as "$X"; estimates (token-billed or "from") get a "~" prefix.
export const formatCost = (def: ModelDef, sel: CostInput = {}): string => {
  const { usd, from, tokenBilled } = computeCost(def, sel);
  if (usd == null) return '';
  return `${from || tokenBilled ? '~' : ''}$${formatUsd(usd)}`;
};
