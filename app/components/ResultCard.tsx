import React, { useState, useEffect } from 'react';
import { Download, Copy, Check, Share2, Info, HardDrive, Maximize, FileDigit, AlertTriangle, Trash2 } from 'lucide-react';
import { GeneratedImage } from '../types';
// @ts-ignore
import piexif from 'piexifjs';

interface ResultCardProps {
  result: GeneratedImage;
  onDelete?: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ result, onDelete }) => {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
        setCanShare(true);
    }

    const analyzeImage = async () => {
      if (!result.url || imageError) return;

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous'; 
        const dimPromise = new Promise<void>((resolve) => {
            img.onload = () => {
                if (img.naturalWidth && img.naturalHeight) {
                    setDimensions(`${img.naturalWidth}x${img.naturalHeight}px`);
                }
                resolve();
            };
            img.onerror = () => {
                setImageError(true);
                resolve();
            };
            img.src = result.url;
        });

        let sizeMB = 0;
        if (result.url.startsWith('data:')) {
          const base64Str = result.url.split(',')[1];
          const strLen = base64Str?.length || 0;
          const byteSize = (strLen * 3) / 4; 
          sizeMB = byteSize / (1024 * 1024);
        } else {
          // Only a cheap HEAD request for remote images. If the server doesn't
          // expose content-length we skip the size badge rather than re-download
          // the full image just to measure it.
          try {
              const response = await fetch(result.url, { method: 'HEAD' });
              const contentLength = response.ok ? response.headers.get('content-length') : null;
              if (contentLength) {
                  sizeMB = parseInt(contentLength) / (1024 * 1024);
              }
          } catch (e) {
             console.warn("Size check failed", e);
          }
        }
        
        if (sizeMB > 0) {
            setFileSize(`${sizeMB.toFixed(1)} MB`);
        }
        await dimPromise;
      } catch (error) {
        console.warn("Failed to analyze image", error);
      }
    };

    analyzeImage();
  }, [result.url, imageError]);

  const getProcessedImageFile = async (imageUrl: string, filename: string, exifData?: string): Promise<File> => {
    // Only attempt EXIF injection if it's likely a JPEG (data:image/jpeg or URL)
    const isJpeg = imageUrl.startsWith('data:image/jpeg') || (!imageUrl.startsWith('data:') && !imageUrl.toLowerCase().endsWith('.png'));

    if (exifData && isJpeg) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous'; 
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas context failed");
            ctx.drawImage(img, 0, 0);
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const newJpegDataUrl = piexif.insert(exifData, jpegDataUrl);
            const res = await fetch(newJpegDataUrl);
            const finalBlob = await res.blob();
            filename = filename.replace(/\.\w+$/, '.jpg');
            return new File([finalBlob], filename, { type: finalBlob.type });
        } catch (e) {
            console.warn("Failed to inject EXIF data", e);
        }
    } 
    const res = await fetch(imageUrl);
    const finalBlob = await res.blob();
    return new File([finalBlob], filename, { type: finalBlob.type });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
        const filename = `photo-shot-${result.id}.png`; 
        const file = await getProcessedImageFile(result.url, filename, result.exifData);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
    } catch (err) {
        console.error('Download failed', err);
    } finally {
        setDownloading(false);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSharing(true);
    try {
        const filename = `photo-shot-${result.id}.png`; 
        const file = await getProcessedImageFile(result.url, filename, result.exifData);
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Photo-Shot Creation',
                text: result.prompt,
            });
        }
    } catch (err) {
        console.error('Share failed', err);
    } finally {
        setSharing(false);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(result.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-surface rounded-3xl overflow-hidden border border-gray-800 shadow-xl mb-6 last:mb-24 animate-fade-in">
      <div className="relative w-full bg-black/50 overflow-hidden min-h-[200px] flex items-center justify-center">
        {imageError ? (
           <div className="flex flex-col items-center gap-3 p-10 text-center">
               <AlertTriangle className="text-error" size={48} aria-hidden="true" />
               <p className="text-sm text-gray-400">Failed to render generated image.<br/>The AI might have returned corrupted data.</p>
           </div>
        ) : (
           <img
            src={result.url}
            alt={result.prompt ? `Generated image: ${result.prompt}` : 'Generated image'}
            loading="lazy"
            decoding="async"
            className="w-full h-auto block"
            onError={() => setImageError(true)}
           />
        )}
        
        {!imageError && (
            <div className="absolute top-3 left-3 z-10 flex gap-2 overflow-x-auto no-scrollbar max-w-[90%] pointer-events-none tabular-nums">
                <div className="flex-shrink-0 bg-black/80 text-white/90 text-[10px] font-bold px-2 py-1 rounded-md border border-white/10 flex items-center gap-1">
                    <Info size={10} aria-hidden="true" />
                    {result.aspectRatio}
                </div>
                {dimensions && (
                    <div className="flex-shrink-0 bg-black/80 text-white/90 text-[10px] font-bold px-2 py-1 rounded-md border border-white/10 flex items-center gap-1">
                        <Maximize size={10} aria-hidden="true" />
                        {dimensions}
                    </div>
                )}
                {fileSize && (
                <div className="flex-shrink-0 bg-black/80 text-white/90 text-[10px] font-bold px-2 py-1 rounded-md border border-white/10 flex items-center gap-1">
                    <HardDrive size={10} aria-hidden="true" />
                    {fileSize}
                </div>
                )}
                {result.exifData && (
                    <div className="flex-shrink-0 bg-success/90 text-white text-[10px] font-bold px-2 py-1 rounded-md border border-white/10 flex items-center gap-1 uppercase">
                        <FileDigit size={10} aria-hidden="true" />
                        EXIF
                    </div>
                )}
            </div>
        )}
      </div>
      
      <div className="p-4 space-y-4">
        <div className="flex gap-3">
          <button 
            onClick={handleDownload}
            disabled={downloading || imageError}
            className="flex-1 bg-white text-black py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-gray-200 disabled:opacity-50"
          >
            {downloading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Download size={18} aria-hidden="true" />}
            Download
          </button>

          {canShare && (
              <button
                onClick={handleShare}
                disabled={sharing || imageError}
                className="flex-1 bg-gray-800 text-white border border-gray-700 py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-gray-700 disabled:opacity-50"
              >
                {sharing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Share2 size={18} aria-hidden="true" />}
                Share
              </button>
          )}

          {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                aria-label="Delete from history"
                title="Delete from history"
                className="bg-surface text-error border border-white/10 py-3 px-4 rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-error/10"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
          )}
        </div>
        
        <div
            onClick={handleCopyPrompt}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopyPrompt(); } }}
            role="button"
            tabIndex={0}
            aria-label={copied ? 'Prompt copied' : 'Copy prompt to clipboard'}
            className="relative -mx-4 px-4 pt-3 border-t border-white/5 cursor-pointer group hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
             <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Prompt Used</span>
             <div className="text-gray-400 group-hover:text-primary transition-colors">
                 {copied ? <div className="flex items-center gap-1 text-success text-[10px] font-bold"><Check size={12} aria-hidden="true" /> Copied</div> : <Copy size={14} aria-hidden="true" />}
             </div>
          </div>
          <p className="text-xs text-gray-300 font-mono break-words leading-relaxed">
             {result.prompt}
          </p>
        </div>
      </div>
    </div>
  );
};

// Memoize on the result's identity so a card skips re-rendering when the parent
// re-renders for unrelated reasons (delete-confirm dialog, ledger updates, tab
// state). History items keep their object identity across those renders. The
// onDelete closure changes identity every parent render but always deletes this
// same item, so it's intentionally excluded from the comparison.
export default React.memo(ResultCard, (prev, next) => prev.result === next.result);