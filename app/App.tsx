import React, { useState, useEffect, useRef } from 'react';
import { UploadedFile, GeneratedImage, MetadataCopyMode, METADATA_FIELDS, MetadataField } from './types';
import ImageUploader from './components/ImageUploader';
import ResultCard from './components/ResultCard';
import { runGenerate, providerKeyPresent } from './services/generate';
import {
  PROVIDERS, getModel, modelsByProvider, getProviderLabel, formatCost, formatUsd, closestRatio,
  DEFAULT_MODEL_KEY, Provider, finalResolution,
} from './services/registry';
import { Sparkles, AlertCircle, Zap, Lock, Wand2, History as HistoryIcon, Trash2, RotateCcw, ArrowLeft, MapPin, Edit2, FileDigit, ArrowDown, Info, Copy, FileType, LocateFixed, RefreshCw, Clock, HelpCircle } from 'lucide-react';
import TemplateMenu from './components/TemplateMenu';
import GuideView from './components/GuideView';
import SpendSummary from './components/SpendSummary';
import {
  loadHistory, saveHistory, clearHistory as clearHistoryStore, persistImage, deleteImage,
  loadLedger, recordSpend, backfillLedger, SpendLedger,
} from './services/history';
import { providerOf } from './services/spend';
// @ts-ignore
import piexif from 'piexifjs';
import { setAppPassword, getAppPassword } from './config';

// Ratio dropdown labels (value -> friendly name).
const RATIO_LABELS: Record<string, string> = {
  '1:1': '1:1 Square',
  '4:3': '4:3 Landscape', '3:4': '3:4 Portrait',
  '3:2': '3:2 Film', '2:3': '2:3 Classic',
  '16:9': '16:9 Cinema', '9:16': '9:16 Mobile',
  '4:5': '4:5 Social', '5:4': '5:4 Classic',
  '21:9': '21:9 Ultra Wide',
  '4:1': '4:1 Ultra Pano', '1:4': '1:4 Ultra Tall',
  '8:1': '8:1 Extreme Pano', '1:8': '1:8 Extreme Tall',
};

// No count limit on history; entries simply expire after 90 days.
const HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const PROMPT_TEMPLATES = [
  {
    name: "✨ Aesthetic & Pro",
    templates: [
      { name: "General Upgrade", prompt: "Enhance this image with professional quality. Improve lighting, sharpness, and color balance while keeping the original composition and content exactly as-is." },
      { name: "Moody / Cinematic", prompt: "Apply a moody, cinematic look with deep shadows, desaturated highlights, and a film-like color grade. Add subtle grain for texture." },
      { name: "Soft / Dreamy", prompt: "Transform into a soft, dreamy aesthetic with gentle diffusion, warm tones, and a slightly overexposed, airy feel." },
      { name: "Vibrant / Editorial", prompt: "Boost colors to editorial vibrancy. Rich, saturated hues with high contrast. Magazine-quality look." }
    ]
  },
  {
    name: "🔍 Fix Blur & Detail",
    templates: [
      { name: "Upscale & Enhance", prompt: "Upscale this image to a much higher resolution. Dramatically increase sharpness, fine detail and clarity while staying perfectly faithful to the original content, composition and colors. Remove blur, compression artifacts and noise." },
      { name: "Sharpen & Restore", prompt: "Sharpen this image and restore fine details that were lost to blur or compression. Keep the content exactly the same." },
      { name: "Texture Enhancement", prompt: "Enhance textures while preserving the natural feel of the image. Bring out surface detail, fabric, skin, or material realism." },
      { name: "Noise Reduction", prompt: "Reduce noise and grain in this image while preserving edge sharpness and detail. Clean up shadows especially." }
    ]
  },
  {
    name: "📐 Angle / Composition",
    templates: [
      { name: "Wide Angle / Epic", prompt: "Transform to a wide-angle epic composition with dramatic perspective. Expand the scene while keeping the main subject prominent." },
      { name: "Low Angle / Heroic", prompt: "Shift to a low-angle heroic perspective. Subject viewed from below, emphasizing scale, power, and drama." },
      { name: "Close-up / Intimate", prompt: "Create an intimate close-up composition focusing on the main subject, with soft background blur and emotional proximity." },
      { name: "Rule of Thirds", prompt: "Recompose using the rule of thirds. Place the main subject at a power point while maintaining natural framing." }
    ]
  },
  {
    name: "🌍 Scenario-Specific",
    templates: [
      { name: "Nature / Landscape", prompt: "Enhance as a stunning nature or landscape photo. Rich natural colors, dramatic sky, and vivid environmental detail." },
      { name: "City / Urban", prompt: "Transform into a vibrant urban scene. Emphasize city lights, architectural lines, and the energy of the street." },
      { name: "Portraits", prompt: "Enhance portrait with professional lighting. Skin retouching, catchlights in eyes, soft background separation." },
      { name: "Animals", prompt: "Enhance this animal photo with vivid detail. Sharpened fur or feathers, expressive eyes, natural habitat context." },
      { name: "Food / Product", prompt: "Enhance as a professional food or product photo. Warm inviting tones, sharp focus on subject, clean background." },
      { name: "Architecture", prompt: "Enhance architectural photography. Correct perspective distortion, boost detail in materials, balanced sky exposure." }
    ]
  },
  {
    name: "🎨 Style Transfer",
    templates: [
      { name: "Oil Painting Style", prompt: "Apply an oil painting style: visible brushstrokes, rich impasto texture, painterly color mixing. Classical fine art aesthetic." },
      { name: "Watercolor Style", prompt: "Transform into a delicate watercolor painting with soft color washes, visible paper texture, and gentle bleeding edges." },
      { name: "Vintage / Analog", prompt: "Apply vintage analog film look: faded colors, light leaks, vignetting, and characteristic color cast of 1970s film stock." },
      { name: "Neon / Cyberpunk", prompt: "Apply neon cyberpunk aesthetic: electric blues and purples, dramatic neon lighting, high contrast night scene." }
    ]
  }
];

// Helper to reuse file reading logic
const fileToDataUri = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to convert image to JPEG Data URI (for PNG targets)
const imageToJpegDataUri = async (file: File, quality = 0.95): Promise<string> => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });
    URL.revokeObjectURL(url);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");
    
    // Fill white background to handle transparency
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', quality);
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAppPassword());
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState(false);

  // App Modes
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'guide'>('create');
  const [creationMode, setCreationMode] = useState<'editor' | 'metadata'>('editor');

  // Editor State
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<Provider>('gemini');
  const [modelKey, setModelKey] = useState<string>(DEFAULT_MODEL_KEY);
  const [ratio, setRatio] = useState<string>('auto');
  const [resolution, setResolution] = useState<string>('1K');
  const [quality, setQuality] = useState<string>('medium');
  const [outputFormat, setOutputFormat] = useState<string>('');
  const [webSearch, setWebSearch] = useState(false);
  const [imageSearch, setImageSearch] = useState(false);
  const [flex, setFlex] = useState(false);

  // Metadata Tool State
  const [metadataSourceFiles, setMetadataSourceFiles] = useState<UploadedFile[]>([]);
  const [metadataTargetFiles, setMetadataTargetFiles] = useState<UploadedFile[]>([]);
  const [clearTargetMetadata, setClearTargetMetadata] = useState(false);
  const [convertToJpeg, setConvertToJpeg] = useState(false);
  const [metadataMode, setMetadataMode] = useState<MetadataCopyMode>(MetadataCopyMode.ALL_EXIF);
  const [customFields, setCustomFields] = useState<MetadataField[]>(['gps']);

  // Common State
  const [keepMetadata, setKeepMetadata] = useState(true);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [ledger, setLedger] = useState<SpendLedger | null>(null);
  const [latestResult, setLatestResult] = useState<GeneratedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const latestResultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const elapsedTimerRef = useRef<number | null>(null);

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    stopElapsedTimer();
    setElapsed(0);
    setLoading(false);
  };

  useEffect(() => {
    providerKeyPresent('gemini').then(setHasKey);
    // Slide the 90-day login window forward on each launch so active users stay
    // logged in. (isAuthenticated is already seeded from the stored token above.)
    const savedPw = getAppPassword();
    if (savedPw) setAppPassword(savedPw);
  }, []);

  // History lives on the server now (shared across devices). Load it once the
  // app is unlocked, dropping anything older than 90 days (and deleting those
  // images + rewriting the index so they don't pile up forever).
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    loadHistory().then(async (items) => {
      if (cancelled) return;
      const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
      const fresh = items.filter((it) => (it.timestamp ?? 0) >= cutoff);
      setResults(fresh);
      if (fresh.length !== items.length) {
        items.filter((it) => (it.timestamp ?? 0) < cutoff).forEach((it) => void deleteImage(it.url));
        void saveHistory(fresh);
      }
      // Load the persistent spend ledger; if there isn't one yet, seed it once
      // from whatever history we have so existing users get a lifetime total.
      const existing = await loadLedger();
      if (cancelled) return;
      if (existing) {
        setLedger(existing);
      } else if (fresh.length > 0) {
        setLedger(await backfillLedger(fresh, providerOf));
      } else {
        setLedger(null);
      }
    });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Switching provider selects that provider's first model.
  useEffect(() => {
    const list = modelsByProvider(provider);
    if (list.length && !list.some((m) => m.key === modelKey)) setModelKey(list[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // When the model changes, reset options to what that model supports + refresh key state.
  useEffect(() => {
    const def = getModel(modelKey);
    if (!def) return;
    providerKeyPresent(def.provider).then(setHasKey);
    setRatio((prev) => (prev !== 'auto' && def.ratios.length > 0 && !def.ratios.includes(prev) ? 'auto' : prev));
    setResolution(def.defaultResolution ?? (def.resolutions[0] ?? ''));
    setQuality(def.extras?.quality?.default ?? 'medium');
    setOutputFormat(def.outputFormats?.[0] ?? '');
    setWebSearch(false);
    setImageSearch(false);
    setFlex(false);
    setFiles((prev) => {
      // Text-to-image models use no reference image; keep any uploaded files in
      // state (just hidden) so switching back to an image model restores them.
      if (def.maxImages === 0 || prev.length <= def.maxImages) return prev;
      prev.slice(def.maxImages).forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      return prev.slice(0, def.maxImages);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      const pw = passwordInput;
      try {
          // In dev there is no proxy; accept locally so the UI is usable.
          if (!(import.meta as any).env?.DEV) {
              const res = await fetch('/api/auth', { headers: { 'X-App-Password': pw } });
              if (!res.ok) { setAuthError(true); return; }
          }
          setAppPassword(pw);
          setIsAuthenticated(true);
          setAuthError(false);
      } catch {
          setAuthError(true);
      }
  };

  const clearHistory = () => {
    results.forEach((r) => void deleteImage(r.url));
    setResults([]);
    void clearHistoryStore();
    setConfirmingClear(false);
  };

  const deleteHistoryItem = (item: GeneratedImage) => {
    void deleteImage(item.url);
    setResults((prev) => {
      const updated = prev.filter((r) => r.id !== item.id);
      void saveHistory(updated);
      return updated;
    });
  };

  const revokePreviews = (list: UploadedFile[]) => {
    list.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
  };

  const handleResetInputs = () => {
    revokePreviews([...files, ...metadataSourceFiles, ...metadataTargetFiles]);
    setFiles([]);
    setMetadataSourceFiles([]);
    setMetadataTargetFiles([]);
    setPrompt('');
    setLatestResult(null);
    if (creationMode === 'editor') {
        setProvider('gemini');
        setModelKey(DEFAULT_MODEL_KEY);
        setRatio('auto');
        // resolution / quality / extras are reset by the model-change effect
    } else {
        setClearTargetMetadata(false);
        setConvertToJpeg(false);
        setMetadataMode(MetadataCopyMode.ALL_EXIF);
        setCustomFields(['gps']);
    }
    setKeepMetadata(true);
    setError(null);
  };

  const handleMetadataCopy = async () => {
    if (metadataSourceFiles.length === 0 || metadataTargetFiles.length === 0) {
        setError("Please select both source and target images.");
        return;
    }
    const source = metadataSourceFiles[0];
    const target = metadataTargetFiles[0];

    if (source.file.type !== 'image/jpeg' && source.file.type !== 'image/jpg') {
         setError("Source image must be a JPEG (or compatible format).");
         return;
    }

    const isTargetPng = target.file.type === 'image/png';
    const isTargetJpeg = target.file.type === 'image/jpeg' || target.file.type === 'image/jpg';

    if (!isTargetJpeg && !isTargetPng) {
         setError("Target image must be JPEG or PNG.");
         return;
    }

    setLoading(true);
    setError(null);
    setLatestResult(null);

    try {
        const sourceData = await fileToDataUri(source.file);
        
        let sourceExifObj;
        try {
            sourceExifObj = piexif.load(sourceData);
        } catch(e) {
            throw new Error("Could not extract EXIF data from source image.");
        }

        // Prepare Target Data
        let finalTargetData = "";
        let resultFormat = "JPEG";
        let targetOriginalExifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {}, "thumbnail": null };
        let finalOrientation = 1; // Default upright

        // CASE 1: Re-encode (PNG or Force JPEG Convert)
        if (isTargetPng || convertToJpeg) {
            finalTargetData = await imageToJpegDataUri(target.file, 1.0); 
            resultFormat = "JPEG (Converted)";
            finalOrientation = 1; // Canvas is always Orientation 1

            // If we are keeping original metadata (not clearing), we should try to load it from the original file
            // Note: piexif can't read PNG chunks, so if source was PNG, we have no metadata to keep.
            // If source was JPEG, we load it.
            if (isTargetJpeg && !clearTargetMetadata) {
                const originalData = await fileToDataUri(target.file);
                try { 
                    targetOriginalExifObj = piexif.load(originalData); 
                } catch(e) {}
            }
        } 
        // CASE 2: Raw JPEG Copy
        else {
            finalTargetData = await fileToDataUri(target.file);
            try {
                const tempObj = piexif.load(finalTargetData);
                targetOriginalExifObj = tempObj;
                // Preserve Target Orientation
                if (tempObj["0th"] && tempObj["0th"][piexif.ImageIFD.Orientation]) {
                    finalOrientation = tempObj["0th"][piexif.ImageIFD.Orientation];
                }
            } catch {
                // No exif in target
            }
        }

        // Which EXIF tags belong to which selectable field (for GPS+Time / Custom).
        const FIELD_TAG_MAP: Record<string, Array<[string, number]>> = {
            datetime: [
                ["Exif", piexif.ExifIFD.DateTimeOriginal],
                ["Exif", piexif.ExifIFD.DateTimeDigitized],
                ["0th", piexif.ImageIFD.DateTime],
            ],
            camera: [
                ["0th", piexif.ImageIFD.Make],
                ["0th", piexif.ImageIFD.Model],
            ],
            lens: [
                ["Exif", piexif.ExifIFD.LensModel],
                ["Exif", piexif.ExifIFD.LensMake],
            ],
            exposure: [
                ["Exif", piexif.ExifIFD.ISOSpeedRatings],
                ["Exif", piexif.ExifIFD.ExposureTime],
                ["Exif", piexif.ExifIFD.FNumber],
            ],
            copyright: [["0th", piexif.ImageIFD.Copyright]],
        };

        // Base = cleared target, or the target's own EXIF when keeping it.
        const finalExifObj: any = clearTargetMetadata
            ? { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {}, "thumbnail": null }
            : JSON.parse(JSON.stringify(targetOriginalExifObj));

        const ensureIfd = (ifd: string) => { if (!finalExifObj[ifd]) finalExifObj[ifd] = {}; };
        const copyGps = () => { finalExifObj["GPS"] = JSON.parse(JSON.stringify(sourceExifObj["GPS"] || {})); };
        const copyField = (field: string) => {
            if (field === "gps") { copyGps(); return; }
            for (const [ifd, tag] of FIELD_TAG_MAP[field] || []) {
                const srcIfd = sourceExifObj[ifd] || {};
                if (tag in srcIfd) { ensureIfd(ifd); finalExifObj[ifd][tag] = srcIfd[tag]; }
            }
        };

        if (metadataMode === MetadataCopyMode.ALL_EXIF) {
            for (const ifd of ["0th", "Exif", "GPS", "1st"]) {
                ensureIfd(ifd);
                Object.assign(finalExifObj[ifd], sourceExifObj[ifd] || {});
            }
        } else if (metadataMode === MetadataCopyMode.GPS_ONLY) {
            copyGps();
        } else if (metadataMode === MetadataCopyMode.GPS_TIME) {
            copyGps();
            copyField("datetime");
        } else if (metadataMode === MetadataCopyMode.CUSTOM) {
            if (customFields.length === 0) throw new Error("Select at least one field to copy.");
            for (const f of customFields) copyField(f);
        }

        // FIX ROTATION: Force the orientation to match the target's physical pixel orientation
        ensureIfd("0th");
        finalExifObj["0th"][piexif.ImageIFD.Orientation] = finalOrientation;

        // Convert to string and insert
        const exifStr = piexif.dump(finalExifObj);
        const resultData = piexif.insert(exifStr, finalTargetData);

        // Calculate aspect ratio for display
        let ratio = 'auto';
        if (target.width && target.height) {
            ratio = closestRatio(target.width, target.height) || 'auto';
        }

        const MODE_LABELS: Record<MetadataCopyMode, string> = {
            [MetadataCopyMode.ALL_EXIF]: "All EXIF",
            [MetadataCopyMode.GPS_ONLY]: "GPS only",
            [MetadataCopyMode.GPS_TIME]: "GPS + Time",
            [MetadataCopyMode.CUSTOM]: `Custom (${customFields.join(", ")})`,
        };

        const newResult: GeneratedImage = {
            id: crypto.randomUUID(),
            url: resultData,
            prompt: `Metadata [${MODE_LABELS[metadataMode]}] copied from ${source.file.name}`,
            timestamp: Date.now(),
            aspectRatio: ratio,
            resolution: `${target.width}x${target.height}`,
            exifData: exifStr
        };

        setLatestResult(newResult);
        const storedUrl = await persistImage(newResult.id, newResult.url);
        const savedItem = storedUrl === newResult.url ? newResult : { ...newResult, url: storedUrl };
        setResults((prev) => {
            const updated = [savedItem, ...prev];
            void saveHistory(updated);
            return updated;
        });

        if (navigator.vibrate) navigator.vibrate(50);
        setTimeout(() => {
            latestResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

    } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to copy metadata.");
    } finally {
        setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (creationMode === 'metadata') {
        await handleMetadataCopy();
        return;
    }

    // Editor flow.
    const def = getModel(modelKey);
    if (!def) { setError("Unknown model."); return; }

    if (!hasKey) {
        setError(`No ${getProviderLabel(def.provider)} API key is configured on the server.`);
        return;
    }

    if (def.input === 'edit' && files.length === 0) {
        setError(`${def.label} edits a reference image. Add at least one.`);
        return;
    }
    if (def.input === 'text' && !prompt.trim()) {
        setError(`${def.label} is text-to-image. Type a prompt.`);
        return;
    }
    if (def.input === 'both' && !prompt.trim() && files.length === 0) {
        setError("Add a reference image, or type a prompt to generate from text.");
        return;
    }

    setLoading(true);
    setError(null);
    setLatestResult(null);

    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;
    setElapsed(0);
    stopElapsedTimer();
    elapsedTimerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      const response = await runGenerate({
        modelKey,
        prompt,
        images: files,
        ratio,
        resolution,
        quality,
        outputFormat,
        webSearch,
        imageSearch,
        flex,
        signal: controller.signal,
      });

      let exifToSave = undefined;
      if (keepMetadata && files.length > 0 && files[0].exifData) {
          exifToSave = files[0].exifData;
      }

      const stamp = Date.now();
      const newResult: GeneratedImage = {
        id: crypto.randomUUID(),
        url: response.imageUrl,
        prompt: prompt || "Auto-enhanced image",
        timestamp: stamp,
        aspectRatio: response.finalRatio,
        resolution: def.resolutions.length ? resolution : '',
        exifData: exifToSave,
        cost: response.cost ?? undefined,
        costEstimate: response.costEstimate,
        model: response.modelLabel,
        provider: response.provider,
      };

      setLatestResult(newResult);
      const storedUrl = await persistImage(newResult.id, newResult.url);
      const savedItem = storedUrl === newResult.url ? newResult : { ...newResult, url: storedUrl };
      setResults((prev) => {
        const updated = [savedItem, ...prev];
        void saveHistory(updated);
        return updated;
      });

      // Add to the persistent lifetime spend ledger (never decremented).
      // Generations are serialized by the loading guard, so `ledger` is current.
      if (typeof response.cost === 'number' && response.cost > 0) {
        recordSpend(ledger, { cost: response.cost, provider: response.provider, timestamp: stamp })
          .then(setLedger)
          .catch(() => {});
      }

      if (navigator.vibrate) navigator.vibrate(50);

      setTimeout(() => {
        latestResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

    } catch (err: any) {
      if (err?.name === 'AbortError' || cancelledRef.current) {
        // User cancelled, not an error.
      } else {
        console.error(err);
        setError(err.message || "Failed to process image.");
      }
    } finally {
      stopElapsedTimer();
      setElapsed(0);
      abortRef.current = null;
      setLoading(false);
    }
  };

  // Estimated cost for the current model + options, for the live hint.
  const costHint = (): string => {
    const def = getModel(modelKey);
    if (!def) return '';
    return formatCost(def, { resolution, quality, webSearch, imageSearch, flex });
  };

  // Re-edit loop: load the previous result back in as the input and let the
  // user type a new prompt (same model / ratio / resolution).
  const handleReEdit = async (result: GeneratedImage) => {
    try {
      setError(null);
      const res = await fetch(result.url);
      const blob = await res.blob();
      const type = blob.type || 'image/png';
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const file = new File([blob], `reedit-${result.id}.${ext}`, { type });
      const previewUrl = URL.createObjectURL(blob);
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = previewUrl;
      });

      const uploaded: UploadedFile = {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        width: dims.w || undefined,
        height: dims.h || undefined,
        aspectRatio: dims.w && dims.h ? dims.w / dims.h : undefined,
      };

      revokePreviews(files);
      setCreationMode('editor');
      setActiveTab('create');
      // Re-editing needs a model that accepts an image. If the current model is
      // text-to-image (e.g. Recraft), fall back to the default edit-capable model
      // so the image stays usable and visible in the uploader.
      const cur = getModel(modelKey);
      if (!cur || cur.input === 'text' || cur.maxImages === 0) {
        const fallback = getModel(DEFAULT_MODEL_KEY)!;
        setProvider(fallback.provider);
        setModelKey(DEFAULT_MODEL_KEY);
      }
      setFiles([uploaded]);
      setPrompt('');
      setLatestResult(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error(err);
      setError("Could not load that image for re-editing.");
    }
  };

  if (!isAuthenticated) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-background">
            <div className="w-full max-w-sm space-y-6">
                <div className="flex flex-col items-center gap-4 mb-8">
                     <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                        <Lock className="w-8 h-8 text-primary" />
                     </div>
                     <h1 className="text-2xl font-bold tracking-tight">Access Required</h1>
                </div>
                
                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="app-password" className="sr-only">Password</label>
                        <input
                            id="app-password"
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="Enter Password"
                            autoComplete="current-password"
                            aria-invalid={authError}
                            aria-describedby={authError ? "app-password-error" : undefined}
                            className={`w-full bg-surface border ${authError ? 'border-error' : 'border-gray-700'} rounded-xl p-4 text-center text-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition placeholder:text-gray-400`}
                            autoFocus
                        />
                        {authError && <p id="app-password-error" className="text-error text-xs text-center">Incorrect password</p>}
                    </div>
                    <button 
                        type="submit"
                        className="w-full bg-white text-black font-bold py-4 rounded-xl text-lg hover:bg-gray-100 active:scale-95 transition"
                    >
                        Unlock
                    </button>
                </form>
            </div>
        </div>
      );
  }

  const isEditor = creationMode === 'editor';
  const def = getModel(modelKey)!;
  const refDims = files[0]?.width && files[0]?.height ? { w: files[0].width!, h: files[0].height! } : undefined;
  const finalRes = finalResolution(def, ratio, resolution, refDims);
  const providerModels = modelsByProvider(provider);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/5 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between gap-2">
        <button
            type="button"
            className="flex items-center gap-2 cursor-pointer -m-2 p-2 min-w-0"
            onClick={() => (activeTab === 'create' ? window.location.reload() : setActiveTab('create'))}
            aria-label={activeTab === 'create' ? 'Photo-Shot home (reload)' : 'Back to editor'}
        >
          {activeTab !== 'create' ? (
              <ArrowLeft className="w-5 h-5 text-gray-400 flex-shrink-0" aria-hidden="true" />
          ) : (
              <img src="/icons/chameleon.png" alt="" aria-hidden="true" className="w-7 h-7 object-contain flex-shrink-0" />
          )}
          <h1 className="font-bold text-lg tracking-tight whitespace-nowrap">Photo-Shot</h1>
        </button>

        <div className="flex items-center gap-1.5">
             {!hasKey && activeTab === 'create' && isEditor && (
                 <span
                     className="text-[10px] bg-error/20 text-error px-2 py-1.5 rounded-md font-bold flex items-center"
                     title="This provider has no API key set in the server .env"
                 >
                     No key
                 </span>
             )}

            {activeTab === 'create' && (
                <button
                    onClick={handleResetInputs}
                    className="flex items-center gap-1 text-[10px] uppercase bg-surface text-gray-300 border border-white/10 px-2.5 py-1.5 rounded-full font-bold hover:bg-white/10 hover:text-white transition-colors"
                >
                    <RotateCcw size={11} aria-hidden="true" />
                    Clear
                </button>
            )}

            <button
                onClick={() => setActiveTab(prev => prev === 'history' ? 'create' : 'history')}
                aria-pressed={activeTab === 'history'}
                className={`flex items-center gap-1 text-[10px] uppercase border px-2.5 py-1.5 rounded-full font-bold transition ${
                    activeTab === 'history'
                    ? 'bg-white text-black border-white'
                    : 'bg-surface text-gray-300 border-white/10 hover:bg-white/10'
                }`}
            >
                <HistoryIcon size={11} aria-hidden="true" />
                History
            </button>

            <button
                onClick={() => setActiveTab(prev => prev === 'guide' ? 'create' : 'guide')}
                aria-label="Guide: providers, models and features"
                aria-pressed={activeTab === 'guide'}
                className={`flex items-center justify-center w-8 h-8 rounded-full border transition ${
                    activeTab === 'guide'
                    ? 'bg-primary text-background border-primary'
                    : 'bg-surface text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
            >
                <HelpCircle size={16} aria-hidden="true" />
            </button>
        </div>
      </header>

      <main className="p-6 space-y-8 max-w-md mx-auto">
        {activeTab === 'create' && (
            <div className="animate-fade-in">
                
                {/* Mode Switcher */}
                <div className="flex bg-surface rounded-xl p-1 mb-6 border border-gray-800 gap-1">
                    <button
                        onClick={() => { revokePreviews([...files, ...metadataSourceFiles, ...metadataTargetFiles]); setCreationMode('editor'); setFiles([]); setError(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] sm:text-sm font-bold transition ${creationMode === 'editor' ? 'bg-primary text-background shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Edit2 size={16} aria-hidden="true" /> Editor
                    </button>
                    <button
                        onClick={() => { revokePreviews([...files, ...metadataSourceFiles, ...metadataTargetFiles]); setCreationMode('metadata'); setFiles([]); setMetadataSourceFiles([]); setMetadataTargetFiles([]); setError(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] sm:text-sm font-bold transition ${creationMode === 'metadata' ? 'bg-primary text-background shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        <FileDigit size={16} aria-hidden="true" /> Metadata
                    </button>
                </div>

                <div className="space-y-8">
                    
                    {/* --- EDITOR UPLOAD (text-to-image models show a note instead) --- */}
                    {isEditor && def.input !== 'text' && (
                         <section>
                            <ImageUploader
                                files={files}
                                setFiles={setFiles}
                                maxFiles={def.maxImages}
                                label={def.input === 'edit' ? 'Reference Image (required)' : 'Reference Image (optional)'}
                            />
                        </section>
                    )}
                    {isEditor && def.input === 'text' && (
                        <section className="flex items-start gap-2 text-xs text-gray-400 bg-surface border border-gray-700 rounded-xl p-3">
                            <Info size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span>{def.label} generates from a text prompt only, so no reference image is used.</span>
                        </section>
                    )}

                    {/* --- EDITOR MODE UI --- */}
                    {isEditor && (
                        <>
                            <section className="space-y-3">
                                <label className="text-sm font-medium text-gray-400">Instructions</label>
                                <TemplateMenu categories={PROMPT_TEMPLATES} onSelect={setPrompt} />

                                <div className="relative">
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        maxLength={2000}
                                        aria-label="Edit instructions / prompt"
                                        placeholder={def.input === 'text' ? "Describe the image you want to create…" : "Describe your edit… (e.g., 'Make it cyberpunk style')"}
                                        className="w-full bg-surface border border-gray-700 rounded-2xl p-4 text-base focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none h-32"
                                    />
                                </div>
                            </section>

                            <section className="space-y-4">
                                {/* Provider */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Provider</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {PROVIDERS.map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setProvider(p)}
                                                className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold transition ${provider === p ? 'bg-primary/20 border-primary text-white' : 'bg-surface border-gray-700 text-gray-400 hover:bg-white/5 hover:text-gray-300'}`}
                                            >
                                                {getProviderLabel(p)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Model */}
                                <div className="space-y-2">
                                    <label htmlFor="model-select" className="text-xs font-bold text-gray-400 uppercase tracking-wider">Model</label>
                                    <select
                                        id="model-select"
                                        value={modelKey}
                                        onChange={(e) => setModelKey(e.target.value)}
                                        className="w-full bg-surface border border-gray-700 text-white text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        {providerModels.map((m) => (
                                            <option key={m.key} value={m.key}>
                                                {m.label} · {formatCost(m, { resolution: m.defaultResolution, quality: m.extras?.quality?.default })}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Resolution + Ratio (only where the model exposes them) */}
                                {(def.resolutions.length > 0 || def.ratios.length > 0) && (
                                    <div className="grid grid-cols-2 gap-4">
                                        {def.resolutions.length > 0 && (
                                            <div className="space-y-2">
                                                <label htmlFor="resolution-select" className="text-xs font-bold text-gray-400 uppercase tracking-wider">Resolution</label>
                                                <select
                                                    id="resolution-select"
                                                    value={resolution}
                                                    onChange={(e) => setResolution(e.target.value)}
                                                    className="w-full bg-surface border border-gray-700 text-white text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    {def.resolutions.map((res) => (
                                                        <option key={res} value={res}>{res}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {def.ratios.length > 0 && (
                                            <div className="space-y-2">
                                                <label htmlFor="ratio-select" className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ratio</label>
                                                <select
                                                    id="ratio-select"
                                                    value={ratio}
                                                    onChange={(e) => setRatio(e.target.value)}
                                                    className="w-full bg-surface border border-gray-700 text-white text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    <option value="auto">✨ Auto (Match)</option>
                                                    {def.ratios.map((r) => (
                                                        <option key={r} value={r}>{RATIO_LABELS[r] ?? r}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Estimated final output size + price */}
                                <div className="flex items-center justify-between text-[11px] text-gray-400">
                                    <span className="tabular-nums">
                                        {finalRes ? `${finalRes.estimate ? '≈ ' : ''}${finalRes.w} × ${finalRes.h} px` : ''}
                                    </span>
                                    <span className="text-success font-bold tabular-nums">{costHint()}</span>
                                </div>

                                {/* Model-specific extras */}
                                {(def.extras?.quality || def.outputFormats || def.extras?.webSearch || def.extras?.imageSearch || def.flex) && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Options</label>
                                        {(def.extras?.quality || def.outputFormats) && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {def.extras?.quality && (
                                                    <select
                                                        value={quality}
                                                        onChange={(e) => setQuality(e.target.value)}
                                                        aria-label="Quality"
                                                        className="w-full bg-surface border border-gray-700 text-white text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary capitalize"
                                                    >
                                                        {def.extras.quality.values.map((q) => (
                                                            <option key={q} value={q}>Quality: {q}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                {def.outputFormats && (
                                                    <select
                                                        value={outputFormat}
                                                        onChange={(e) => setOutputFormat(e.target.value)}
                                                        aria-label="Output format"
                                                        className="w-full bg-surface border border-gray-700 text-white text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary uppercase"
                                                    >
                                                        {def.outputFormats.map((f) => (
                                                            <option key={f} value={f}>{f}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            {def.extras?.webSearch && (
                                                <button onClick={() => setWebSearch((v) => !v)} className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition ${webSearch ? 'bg-primary/20 border-primary text-white' : 'bg-surface border-gray-700 text-gray-400 hover:bg-white/5 hover:text-gray-300'}`}>
                                                    {webSearch ? '✓ ' : ''}Web search (+$0.014)
                                                </button>
                                            )}
                                            {def.extras?.imageSearch && (
                                                <button onClick={() => setImageSearch((v) => !v)} className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition ${imageSearch ? 'bg-primary/20 border-primary text-white' : 'bg-surface border-gray-700 text-gray-400 hover:bg-white/5 hover:text-gray-300'}`}>
                                                    {imageSearch ? '✓ ' : ''}Image search (+$0.014)
                                                </button>
                                            )}
                                            {def.flex && (
                                                <button onClick={() => setFlex((v) => !v)} className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition ${flex ? 'bg-primary/20 border-primary text-white' : 'bg-surface border-gray-700 text-gray-400 hover:bg-white/5 hover:text-gray-300'}`}>
                                                    {flex ? '✓ ' : ''}FLEX (≈50% cheaper, slower)
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>
                        </>
                    )}

                    {/* --- METADATA MODE UI --- */}
                    {creationMode === 'metadata' && (
                      <section className="space-y-6">
                         <div className="p-4 bg-info/10 border border-info/25 rounded-xl text-xs text-blue-200">
                            <h2 className="font-bold flex items-center gap-2 mb-1"><Info size={14}/> How it works</h2>
                            <p className="opacity-70 leading-relaxed">Copy full EXIF metadata (Camera settings, GPS, Date/Time) from a source JPEG to a target image. If the target is PNG, it will be converted to JPEG.</p>
                         </div>
                         
                         <ImageUploader 
                            label="1. Source Photo (Metadata Provider)" 
                            files={metadataSourceFiles} 
                            setFiles={setMetadataSourceFiles} 
                            maxFiles={1} 
                         />
                         
                         <div className="flex justify-center relative z-10 pointer-events-none">
                            <div className="bg-surface border border-gray-700 p-2 rounded-full text-gray-400">
                                <ArrowDown size={20} />
                            </div>
                         </div>
                         
                         <ImageUploader 
                            label="2. Target Photo (Receiver)" 
                            files={metadataTargetFiles} 
                            setFiles={setMetadataTargetFiles} 
                            maxFiles={1} 
                         />
                         
                         <div className="pt-2 border-t border-white/5 space-y-3">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">What to copy</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { mode: MetadataCopyMode.ALL_EXIF, label: 'All EXIF', icon: <FileDigit size={14} /> },
                                        { mode: MetadataCopyMode.GPS_ONLY, label: 'GPS only', icon: <LocateFixed size={14} /> },
                                        { mode: MetadataCopyMode.GPS_TIME, label: 'GPS + Time', icon: <Clock size={14} /> },
                                        { mode: MetadataCopyMode.CUSTOM, label: 'Custom', icon: <Wand2 size={14} /> },
                                    ]).map(({ mode, label, icon }) => (
                                        <button
                                            key={mode}
                                            onClick={() => setMetadataMode(mode)}
                                            className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition ${metadataMode === mode ? 'bg-primary/20 border-primary text-white' : 'bg-surface border-gray-700 text-gray-400 hover:bg-white/5 hover:text-gray-300'}`}
                                        >
                                            {icon}{label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {metadataMode === MetadataCopyMode.CUSTOM && (
                                <div className="bg-surface rounded-xl p-3 border border-gray-700 grid grid-cols-3 gap-2">
                                    {METADATA_FIELDS.map((f) => {
                                        const on = customFields.includes(f);
                                        return (
                                            <button
                                                key={f}
                                                onClick={() => setCustomFields((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])}
                                                className={`py-2 px-2 rounded-lg text-[11px] font-bold capitalize border transition ${on ? 'bg-primary/20 border-primary text-white' : 'bg-black/20 border-gray-700 text-gray-400 hover:bg-white/5 hover:text-gray-300'}`}
                                            >
                                                {on ? '✓ ' : ''}{f}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-gray-300">
                                    <Trash2 size={16} className="text-error" />
                                    <span>Pre-clear all metadata from target</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        aria-label="Pre-clear all metadata from target"
                                        checked={clearTargetMetadata}
                                        onChange={(e) => setClearTargetMetadata(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-error rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition peer-checked:bg-error"></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-gray-300">
                                    <FileType size={16} className="text-warning" />
                                    <span>Convert output to JPEG</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        aria-label="Convert output to JPEG"
                                        checked={convertToJpeg}
                                        onChange={(e) => setConvertToJpeg(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-warning rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition peer-checked:bg-warning"></div>
                                </label>
                            </div>
                         </div>
                      </section>
                    )}

                    {/* Common Options (Editor only) */}
                    {creationMode !== 'metadata' && files.length > 0 && def.input !== 'text' && (
                    <div className="col-span-2 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-gray-700">
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                                <MapPin size={16} className="text-accent" />
                                <span>Keep Original Metadata (GPS/Time)</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    aria-label="Keep original metadata (GPS / time)"
                                    checked={keepMetadata}
                                    onChange={(e) => setKeepMetadata(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition peer-checked:bg-primary"></div>
                            </label>
                        </div>
                    </div>
                    )}

                    {error && (
                        <div className="p-4 bg-error/10 border border-error/40 rounded-xl flex items-start gap-3 text-red-200 text-sm">
                            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}
                    
                    {latestResult && (
                        <section ref={latestResultRef} className="pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles size={14} /> New Creation
                                </h2>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                                    {latestResult.model && <span>{latestResult.model}</span>}
                                    {typeof latestResult.cost === 'number' && latestResult.cost > 0 && (
                                        <span className="text-success tabular-nums">{latestResult.costEstimate ? '~' : ''}${formatUsd(latestResult.cost)}</span>
                                    )}
                                </div>
                            </div>
                            <ResultCard result={latestResult} />
                            {creationMode === 'editor' && (
                                <button
                                    onClick={() => handleReEdit(latestResult)}
                                    className="w-full -mt-2 flex items-center justify-center gap-2 bg-surface border border-white/10 text-gray-200 py-3 rounded-xl font-bold text-sm hover:bg-white/10 active:scale-95 transition"
                                >
                                    <RefreshCw size={16} /> Edit this image again
                                </button>
                            )}
                        </section>
                    )}
                </div>
            </div>
        )}
        
        {activeTab === 'history' && (
            <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold">History</h2>
                    <span className="text-xs text-gray-400 tabular-nums">{results.length} {results.length === 1 ? 'item' : 'items'}</span>
                </div>
                
                {results.length === 0 ? (
                     <div className="text-center text-gray-400 py-20 flex flex-col items-center">
                        <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4">
                            <HistoryIcon className="opacity-20" size={32} />
                        </div>
                        <h3 className="font-bold text-gray-400 mb-1">No history yet</h3>
                        <p className="text-xs max-w-[200px]">Your recent creations are saved on this device and appear here.</p>
                        <button 
                             onClick={() => setActiveTab('create')}
                             className="mt-6 text-primary text-sm font-bold"
                        >
                            Start Creating
                        </button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <SpendSummary results={results} ledger={ledger} />

                        {results.map(res => (
                            <ResultCard key={res.id} result={res} onDelete={() => deleteHistoryItem(res)} />
                        ))}
                        
                        <div className="pt-8 pb-4 border-t border-white/5 flex flex-col items-center gap-3">
                            {confirmingClear ? (
                                <>
                                    <p className="text-sm text-gray-400">Delete all {results.length} history items?</p>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={clearHistory}
                                            className="flex items-center gap-2 text-white bg-error px-5 py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition"
                                        >
                                            <Trash2 size={18} aria-hidden="true" /> Delete all
                                        </button>
                                        <button
                                            onClick={() => setConfirmingClear(false)}
                                            className="px-5 py-3 rounded-xl font-bold bg-surface border border-white/10 text-gray-200 hover:bg-white/10 active:scale-95 transition"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <button
                                    onClick={() => setConfirmingClear(true)}
                                    className="flex items-center gap-2 text-error bg-error/10 px-6 py-3 rounded-xl hover:bg-error/20 transition-colors"
                                >
                                    <Trash2 size={18} aria-hidden="true" />
                                    <span className="font-bold">Clear All History</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'guide' && <GuideView />}
      </main>

      {activeTab === 'create' && (
        <div className="max-w-md mx-auto px-6 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {loading && creationMode === 'editor' ? (
                <div className="flex gap-2">
                    <div className="flex-1 py-4 rounded-2xl bg-surface border border-white/10 text-gray-200 font-bold text-sm flex flex-col items-center justify-center">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span className="tabular-nums">Processing… {elapsed}s</span>
                        </div>
                        {elapsed >= 20 && (
                            <span className="text-[11px] font-medium text-gray-400 mt-1">Large 4K renders can take a minute.</span>
                        )}
                    </div>
                    <button
                        onClick={handleCancel}
                        className="px-5 rounded-2xl bg-surface border border-white/10 text-gray-200 font-bold text-sm hover:bg-white/10 active:scale-95 transition"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition ${
                        loading
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-black hover:bg-gray-100 active:scale-95'
                    }`}
                >
                    {loading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Processing…
                        </>
                    ) : (
                        <>
                            {creationMode === 'editor' ? <Zap className="fill-current" size={20} aria-hidden="true" /> : <Copy className="fill-current" size={20} aria-hidden="true" />}
                            {creationMode === 'editor' ? 'Generate' : 'Copy Metadata'}
                        </>
                    )}
                </button>
            )}
        </div>
      )}
    </div>
  );
};

export default App;