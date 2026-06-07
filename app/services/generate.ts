import { UploadedFile } from "../types";
import {
  API_GEMINI_BASE,
  API_WAVESPEED_BASE,
  API_OPENROUTER_BASE,
  PROVIDER_AVAILABLE,
  getAppPassword,
} from "../config";
import {
  ModelDef,
  Provider,
  getModel,
  resolveRatio,
  seedreamSize,
  computeCost,
  CostInput,
  finalResolution,
  isGeminiFamily,
} from "./registry";

// All provider traffic goes through the same-origin proxy; the server injects
// the real API keys. The upstream constant is only used to rewrite WaveSpeed's
// absolute poll URLs back onto the proxy.
const WAVESPEED_BASE = API_WAVESPEED_BASE;
const WAVESPEED_UPSTREAM = "https://api.wavespeed.ai/api/v3";
const GEMINI_RETRY_DELAYS_MS = [1000, 2000];

// Every /api request carries the unlock password; the server validates it.
const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  'X-App-Password': getAppPassword(),
  ...extra,
});

// --- small helpers ---------------------------------------------------------

const fileToPart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToDataUri = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getImageDimensions = (src: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Nano Banana (Gemini) downgrades EDITS to the input image's resolution and
// ignores the requested 2K/4K. Pre-upscaling the source to the target long edge
// makes the model output at the requested resolution, since it follows the
// input's pixel size more reliably than the size parameter. Only upscales (never
// shrinks) and silently no-ops on any failure so it can't block a generation.
const upscaleToLongEdge = async (uf: UploadedFile, targetLong: number): Promise<UploadedFile> => {
  try {
    const src = uf.previewUrl || (await fileToDataUri(uf.file));
    const img = await loadImage(src);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (!long || long >= targetLong * 0.98) return uf; // already large enough
    const scale = targetLong / long;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return uf;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const isPng = (uf.file.type || '').includes('png');
    const mime = isPng ? 'image/png' : 'image/jpeg';
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), mime, isPng ? undefined : 0.92),
    );
    const name = uf.file.name.replace(/\.[^.]+$/, '') + (isPng ? '.png' : '.jpg');
    return { ...uf, file: new File([blob], name, { type: mime }) };
  } catch {
    return uf;
  }
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};
const abortRejection = (signal?: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });

const geminiImageSize = (token: string): string => (token === '0.5K' ? '512' : token);
const wavespeedResolution = (token: string): string => token.toLowerCase();

const RECRAFT_SIZE: Record<string, string> = {
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
};

// ---------------------------------------------------------------------------
// API-key gating
// ---------------------------------------------------------------------------

// Keys are managed on the server now, so there is nothing to "connect" client
// side. Kept as a no-op so callers don't need to change.
export const promptForKey = async (): Promise<void> => {};

/** Whether a provider has a key configured on the server (from config.js). */
export const providerKeyPresent = async (provider: Provider): Promise<boolean> =>
  !!PROVIDER_AVAILABLE[provider];

// ---------------------------------------------------------------------------
// Shared WaveSpeed polling
// ---------------------------------------------------------------------------

const wavespeedRequest = async (endpoint: string, body: object, signal?: AbortSignal): Promise<string> => {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const text = await response.text();
    let data: any; try { data = JSON.parse(text); } catch { data = { message: text }; }
    throw new Error(data.error?.message || data.message || `WaveSpeed failed: ${response.status}`);
  }
  const result = await response.json();
  const rd = result.data ? result.data : result;
  if (result.error || rd.error) throw new Error(`WaveSpeed API Error: ${JSON.stringify(result.error || rd.error)}`);

  const immediate = rd.outputs || rd.output_urls || rd.images;
  if (immediate && immediate.length > 0) return immediate[0];

  const pollUrl = rd.urls?.get;
  if (!pollUrl) throw new Error("WaveSpeed returned no result URL.");
  // WaveSpeed returns an absolute api.wavespeed.ai URL; route it back through
  // our proxy so the server can attach the key.
  const proxiedPoll = pollUrl.replace(WAVESPEED_UPSTREAM, WAVESPEED_BASE);

  const MAX_ATTEMPTS = 150; // ~5 minutes
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    throwIfAborted(signal);
    await new Promise(r => setTimeout(r, 2000));
    throwIfAborted(signal);
    const pollRes = await fetch(proxiedPoll, { headers, signal });
    if (!pollRes.ok) continue;
    const raw = await pollRes.json();
    const pd = raw.data ? raw.data : raw;
    const outs = pd.outputs || pd.output_urls || pd.images;
    if (outs && outs.length > 0) return outs[0];
    const status = (pd.status || "").toLowerCase();
    if (status === 'completed' || status === 'succeeded') throw new Error("Task completed but returned no output URLs.");
    if (status === 'failed') throw new Error(`WaveSpeed generation failed: ${JSON.stringify(pd.error || "Unknown error")}`);
  }
  throw new Error("WaveSpeed generation timed out.");
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

interface RunOpts {
  modelKey: string;
  prompt: string;
  images: UploadedFile[];
  ratio: string;        // 'auto' or an aspect ratio like '16:9'
  resolution: string;   // display token, e.g. '2K'
  quality?: string;
  outputFormat?: string;
  webSearch?: boolean;
  imageSearch?: boolean;
  flex?: boolean;
  signal?: AbortSignal;
}

export interface GenerateResult {
  imageUrl: string;
  finalRatio: string;
  cost: number | null;
  modelLabel: string;
}

const isRetryableGeminiError = (err: any): boolean => {
  const status = err?.status ?? err?.code;
  if ([429, 500, 502, 503, 504].includes(Number(status))) return true;
  const msg = String(err?.message || err).toUpperCase();
  return ['UNAVAILABLE', 'OVERLOADED', 'HIGH DEMAND', 'RESOURCE_EXHAUSTED', 'SERVICE UNAVAILABLE'].some((m) => msg.includes(m));
};

const generateGemini = async (def: ModelDef, o: RunOpts, ratio: string): Promise<string> => {
  if (!PROVIDER_AVAILABLE.gemini) throw new Error("No Gemini API key configured on the server.");
  // Load the Gemini SDK on demand so it stays out of the initial bundle.
  const { GoogleGenAI, Modality } = await import("@google/genai");
  // Route the SDK through our same-origin proxy; the server swaps the placeholder
  // key for the real one. The unlock password rides along as a header.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const ai = new GoogleGenAI({
    apiKey: 'proxy',
    httpOptions: { baseUrl: `${origin}${API_GEMINI_BASE}`, headers: authHeaders() },
  });
  const parts = await Promise.all(o.images.map((img) => fileToPart(img.file)));
  const contents = { parts: [...parts, { text: o.prompt || "Professional high-quality edit and enhancement." }] };
  const imageConfig: any = { imageSize: geminiImageSize(o.resolution) };
  if (ratio) imageConfig.aspectRatio = ratio;
  const config = { responseModalities: [Modality.IMAGE, Modality.TEXT], imageConfig };

  const attempts = GEMINI_RETRY_DELAYS_MS.length + 1;
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      throwIfAborted(o.signal);
      const response = await Promise.race([
        ai.models.generateContent({ model: def.apiModel, contents, config }),
        abortRejection(o.signal),
      ]);
      const candidate = (response as any).candidates?.[0];
      if (!candidate) throw new Error("No candidates returned from Gemini (content may have been blocked).");
      if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
        throw new Error(`Generation stopped by the model (${candidate.finishReason}). Often a safety policy.`);
      }
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
      throw new Error("The model returned no image data. Try adjusting your prompt.");
    } catch (error: any) {
      lastError = error;
      if (error?.name === 'AbortError') throw error;
      if (error.message?.includes("Requested entity was not found")) {
        throw new Error("The Gemini API key configured on the server is invalid or expired.");
      }
      if (isRetryableGeminiError(error) && attempt < attempts) {
        await new Promise((r) => setTimeout(r, GEMINI_RETRY_DELAYS_MS[attempt - 1]));
        continue;
      }
      break;
    }
  }
  if (isRetryableGeminiError(lastError)) throw new Error("Gemini image API is temporarily overloaded. Please try again in a minute.");
  throw new Error(lastError?.message || "Unknown Gemini error");
};

const generateWavespeed = async (def: ModelDef, o: RunOpts, ratio: string): Promise<string> => {
  if (!PROVIDER_AVAILABLE.wavespeed) throw new Error("No WaveSpeed API key configured on the server.");
  const body: Record<string, unknown> = { enable_sync_mode: false, enable_base64_output: false };
  body.prompt = o.prompt || "Professional high-quality edit and enhancement.";

  const isRecraft = def.apiModel.includes('recraft');

  if (def.input !== 'text') {
    const uris = await Promise.all(o.images.map((img) => fileToDataUri(img.file)));
    if (def.singleImageParam) body.image = uris[0];
    else body.images = uris;
  }

  if (def.freeSize) {
    body.size = seedreamSize(ratio || '1:1', o.resolution);
    if (def.outputFormats) body.output_format = o.outputFormat || def.outputFormats[0];
  } else if (isRecraft) {
    body.image_size = RECRAFT_SIZE[ratio] || 'square_hd';
  } else {
    // nano-banana family + gpt-image-2
    if (ratio) body.aspect_ratio = ratio;
    if (o.resolution) body.resolution = wavespeedResolution(o.resolution);
    if (def.outputFormats) body.output_format = o.outputFormat || def.outputFormats[0];
    if (def.extras?.quality) body.quality = o.quality || def.extras.quality.default;
    if (o.webSearch && def.extras?.webSearch) body.enable_web_search = true;
    if (o.imageSearch && def.extras?.imageSearch) body.enable_image_search = true;
  }

  return wavespeedRequest(`${WAVESPEED_BASE}/${def.apiModel}`, body, o.signal);
};

const generateOpenrouter = async (def: ModelDef, o: RunOpts, ratio: string): Promise<string> => {
  if (!PROVIDER_AVAILABLE.openrouter) throw new Error("No OpenRouter API key configured on the server.");
  const content: any[] = [{ type: 'text', text: o.prompt || "Professional high-quality edit and enhancement." }];
  for (const img of o.images) {
    content.push({ type: 'image_url', image_url: { url: await fileToDataUri(img.file) } });
  }
  const body: any = {
    model: def.apiModel,
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content }],
  };
  // OpenRouter image_config: aspect_ratio + image_size ("2K"/"4K"). image_size is
  // only honoured by models that expose resolution (def.resolutions non-empty).
  const imageConfig: Record<string, string> = {};
  if (ratio) imageConfig.aspect_ratio = ratio;
  if (def.resolutions.length > 0 && o.resolution) imageConfig.image_size = o.resolution;
  if (Object.keys(imageConfig).length) body.image_config = imageConfig;
  if (o.flex && def.flex) body.service_tier = 'flex';

  const response = await Promise.race([
    fetch(`${API_OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: o.signal,
    }),
    abortRejection(o.signal),
  ]);
  if (!response.ok) {
    const text = await response.text();
    let data: any; try { data = JSON.parse(text); } catch { data = { error: { message: text } }; }
    throw new Error(data.error?.message || `OpenRouter failed: ${response.status}`);
  }
  const data = await response.json();
  const msg = data.choices?.[0]?.message;
  const url = msg?.images?.[0]?.image_url?.url;
  if (url) return url;
  throw new Error("OpenRouter returned no image. The model may not support image output or rejected the request.");
};

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

export const runGenerate = async (o: RunOpts): Promise<GenerateResult> => {
  const def = getModel(o.modelKey);
  if (!def) throw new Error(`Unknown model: ${o.modelKey}`);
  throwIfAborted(o.signal);

  // Resolve "auto" to a concrete ratio (model-aware, from first image if present).
  let imgDims: { w: number; h: number } | undefined;
  if ((o.ratio === 'auto' || !o.ratio) && o.images.length > 0) {
    imgDims = await getImageDimensions(o.images[0].previewUrl);
  }
  const ratio = resolveRatio(def, o.ratio, imgDims);

  // Gemini downgrades edits to the source's resolution, so upscale the source
  // up to the requested 2K/4K first (no-op if it's already large enough or the
  // model isn't a resolution-controlled Gemini-family edit).
  let images = o.images;
  if (images.length > 0 && isGeminiFamily(def) && def.resolutions.length > 0 && o.resolution) {
    const target = finalResolution(def, o.ratio, o.resolution, imgDims);
    if (target) {
      const targetLong = Math.max(target.w, target.h);
      images = await Promise.all(images.map((img) => upscaleToLongEdge(img, targetLong)));
      throwIfAborted(o.signal);
    }
  }
  const oo: RunOpts = { ...o, images };

  let imageUrl: string;
  if (def.provider === 'gemini') imageUrl = await generateGemini(def, oo, ratio);
  else if (def.provider === 'wavespeed') imageUrl = await generateWavespeed(def, oo, ratio);
  else imageUrl = await generateOpenrouter(def, oo, ratio);

  const costSel: CostInput = {
    resolution: o.resolution,
    quality: o.quality,
    webSearch: o.webSearch,
    imageSearch: o.imageSearch,
    flex: o.flex,
  };
  return {
    imageUrl,
    finalRatio: ratio || 'auto',
    cost: computeCost(def, costSel).usd,
    modelLabel: def.label,
  };
};
