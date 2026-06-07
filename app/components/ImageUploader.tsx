import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, MapPin, Loader2 } from 'lucide-react';
import { UploadedFile } from '../types';
// @ts-ignore
import piexif from 'piexifjs';

interface ImageUploaderProps {
  files: UploadedFile[];
  setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  maxFiles?: number;
  label?: string;
}

const isHeic = (file: File): boolean =>
  /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

// Convert HEIC/HEIF (typical for iPhone uploads) to JPEG so the browser can
// preview and process it. heic2any is loaded on demand only when needed.
const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    // @ts-ignore — heic2any ships no types
    const heic2any = (await import('heic2any')).default;
    const blob = (await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })) as Blob;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('HEIC conversion failed, using original file', err);
    return file;
  }
};

const ratToFloat = (r: any): number => (Array.isArray(r) ? r[0] / r[1] : Number(r));

const dmsToDecimal = (dms: any, ref: any): number | null => {
  if (!dms || dms.length < 3) return null;
  try {
    const dec = ratToFloat(dms[0]) + ratToFloat(dms[1]) / 60 + ratToFloat(dms[2]) / 3600;
    const r = typeof ref === 'string' ? ref : '';
    return r === 'S' || r === 'W' ? -dec : dec;
  } catch {
    return null;
  }
};

const extractGps = (exifObj: any): string | undefined => {
  const gps = exifObj?.['GPS'];
  if (!gps) return undefined;
  const lat = dmsToDecimal(gps[piexif.GPSIFD.GPSLatitude], gps[piexif.GPSIFD.GPSLatitudeRef]);
  const lon = dmsToDecimal(gps[piexif.GPSIFD.GPSLongitude], gps[piexif.GPSIFD.GPSLongitudeRef]);
  if (lat == null || lon == null) return undefined;
  const latRef = lat >= 0 ? 'N' : 'S';
  const lonRef = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latRef}, ${Math.abs(lon).toFixed(2)}°${lonRef}`;
};

const ImageUploader: React.FC<ImageUploaderProps> = ({ files, setFiles, maxFiles = 5, label = "Input Image" }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles: File[] = Array.from(e.target.files);
      setBusy(true);

      try {
        const newFilesPromises = selectedFiles.map(async (rawFile) => {
          const file = isHeic(rawFile) ? await convertHeicToJpeg(rawFile) : rawFile;
          const previewUrl = URL.createObjectURL(file);

          // Extract dimensions, EXIF and GPS
          const { w, h, exif, gps } = await new Promise<{ w: number; h: number; exif?: string; gps?: string }>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                let foundExif: string | undefined;
                let foundGps: string | undefined;
                try {
                  const result = ev.target?.result as string;
                  if (result && (file.type === 'image/jpeg' || file.type === 'image/jpg')) {
                    const exifObj = piexif.load(result);
                    foundExif = piexif.dump(exifObj);
                    foundGps = extractGps(exifObj);
                  }
                } catch (err) {
                  console.debug("No EXIF data or parse error", err);
                }
                resolve({ w: img.width, h: img.height, exif: foundExif, gps: foundGps });
              };
              reader.readAsDataURL(file);
            };
            img.onerror = () => resolve({ w: 0, h: 0 });
            img.src = previewUrl;
          });

          return {
            id: crypto.randomUUID(),
            file,
            previewUrl,
            width: w,
            height: h,
            aspectRatio: h > 0 ? w / h : undefined,
            exifData: exif,
            gpsCoords: gps,
          } as UploadedFile;
        });

        const newFiles = await Promise.all(newFilesPromises);

        if (maxFiles === 1) {
          setFiles((prev) => {
            prev.forEach((f) => URL.revokeObjectURL(f.previewUrl));
            return newFiles.slice(0, 1);
          });
        } else {
          setFiles((prev) => {
            const combined = [...prev, ...newFiles];
            // Revoke any that overflow maxFiles so their blob URLs don't leak.
            combined.slice(maxFiles).forEach((f) => URL.revokeObjectURL(f.previewUrl));
            return combined.slice(0, maxFiles);
          });
        }
      } finally {
        setBusy(false);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-400 tabular-nums">{label} ({files.length}/{maxFiles})</label>
        {files.length < maxFiles && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-xs text-primary font-bold uppercase tracking-wider px-2 -mr-2 rounded-md min-h-[44px] hover:bg-white/5 transition-colors"
          >
            <Upload size={14} aria-hidden="true" /> Add Photo
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {files.length === 0 ? (
          <button
            type="button"
            disabled={busy}
            aria-label="Upload image"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-32 h-32 rounded-2xl border-2 border-dashed border-gray-700 bg-surface flex flex-col items-center justify-center text-gray-400 active:bg-gray-800 transition-colors cursor-pointer"
          >
            {busy ? (
              <Loader2 size={24} className="mb-2 animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon size={24} className="mb-2 opacity-50" aria-hidden="true" />
            )}
            <span className="text-xs">{busy ? 'Processing…' : 'Tap to upload'}</span>
          </button>
        ) : (
          files.map((file, i) => (
            <div key={file.id} className="relative flex-shrink-0 w-32 h-32 group snap-start">
              <img
                src={file.previewUrl}
                alt={`Reference image ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover rounded-2xl border border-gray-700"
              />
              <button
                type="button"
                onClick={() => removeFile(file.id)}
                aria-label={`Remove image ${i + 1}`}
                className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
              >
                <span className="bg-black/70 text-white p-1.5 rounded-full flex items-center justify-center">
                  <X size={16} aria-hidden="true" />
                </span>
              </button>
              {file.gpsCoords && (
                <div className="absolute bottom-1 left-1 right-1 bg-black/80 text-white/90 text-[9px] font-bold px-1.5 py-1 rounded-md flex items-center gap-1 truncate tabular-nums">
                  <MapPin size={9} className="flex-shrink-0 text-success" aria-hidden="true" />
                  <span className="truncate">{file.gpsCoords}</span>
                </div>
              )}
            </div>
          ))
        )}

        {files.length > 0 && files.length < maxFiles && (
          <button
            type="button"
            disabled={busy}
            aria-label="Add another image"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-32 h-32 rounded-2xl border-2 border-dashed border-gray-700 bg-surface/50 flex flex-col items-center justify-center text-gray-400 snap-start cursor-pointer hover:bg-white/5"
          >
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}
          </button>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple={maxFiles > 1}
        accept="image/jpeg, image/png, image/webp, image/heic, image/heif, .heic, .heif"
      />
    </div>
  );
};

export default ImageUploader;
