import React, { useEffect, useRef, useState } from 'react';
import { Check, FolderOpen, RotateCcw, Shuffle, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { MediaPickerModal } from './MediaLibraryPanel';

export const NEUTRAL_AVATARS = [
  '/assets/avatars/neutral-avatar-1.svg',
  '/assets/avatars/neutral-avatar-2.svg',
  '/assets/avatars/neutral-avatar-3.svg',
  '/assets/avatars/neutral-avatar-4.svg',
] as const;

type AspectPreset = '1:1' | '4:5' | '3:4';

const ASPECT_RATIO_DIMENSIONS: Record<AspectPreset, { w: number; h: number; label: string }> = {
  '1:1': { w: 480, h: 480, label: '1:1 Square' },
  '4:5': { w: 480, h: 600, label: '4:5 Portrait' },
  '3:4': { w: 480, h: 640, label: '3:4 Frame' },
};

export const ProfileImageCropModal: React.FC<{
  open: boolean;
  memberName: string;
  currentPhotoUrl: string;
  defaultCategory?: string;
  onClose: () => void;
  onApplyPhoto: (url: string, altText?: string) => void;
}> = ({
  open,
  memberName,
  currentPhotoUrl,
  defaultCategory = 'Team Photographs',
  onClose,
  onApplyPhoto,
}) => {
  const { apiFetch, notify } = usePlatform();
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [aspect, setAspect] = useState<AspectPreset>('4:5');
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setSourceUrl(currentPhotoUrl || '');
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(false);
    }
  }, [open, currentPhotoUrl]);

  if (!open) return null;

  const handleFilePick = (file: File | null) => {
    if (!file) return;
    const valid = /\.(jpg|jpeg|png|webp)$/i.test(file.name) || /^image\/(jpeg|png|webp)$/i.test(file.type);
    if (!valid) {
      notify('Please select a JPG, JPEG, PNG, or WebP photograph.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setImgLoaded(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: Math.max(-180, Math.min(180, dragStartRef.current.ox + dx)),
      y: Math.max(-180, Math.min(180, dragStartRef.current.oy + dy)),
    });
  };

  const handlePointerUp = () => setDragging(false);

  const pickRandomNeutralAvatar = () => {
    const others = NEUTRAL_AVATARS.filter((u) => u !== sourceUrl);
    const chosen = others[Math.floor(Math.random() * others.length)] || NEUTRAL_AVATARS[0];
    onApplyPhoto(chosen, `${memberName || 'Team Member'} neutral avatar`);
    onClose();
  };

  const handleRemovePhoto = () => {
    onApplyPhoto(NEUTRAL_AVATARS[0], `${memberName || 'Team Member'} profile avatar`);
    onClose();
  };

  const handleSaveCropped = async () => {
    if (!sourceUrl) {
      pickRandomNeutralAvatar();
      return;
    }

    // If unmodified existing neutral SVG or external URL that wasn't cropped, apply directly
    if (sourceUrl.endsWith('.svg') || (sourceUrl === currentPhotoUrl && zoom === 1 && offset.x === 0 && offset.y === 0)) {
      onApplyPhoto(sourceUrl);
      onClose();
      return;
    }

    setUploading(true);
    try {
      const img = imgRef.current;
      if (!img || !imgLoaded) {
        throw new Error('Image preview is still loading. Try again in a moment.');
      }

      const target = ASPECT_RATIO_DIMENSIONS[aspect];
      const canvas = document.createElement('canvas');
      canvas.width = target.w;
      canvas.height = target.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas cropping is unavailable in this browser.');

      ctx.fillStyle = '#F0F8FF';
      ctx.fillRect(0, 0, target.w, target.h);

      const baseScale = Math.max(target.w / img.naturalWidth, target.h / img.naturalHeight);
      const drawW = img.naturalWidth * baseScale * zoom;
      const drawH = img.naturalHeight * baseScale * zoom;
      // Preview box is ~280px wide, scale offset proportionally
      const offsetRatio = target.w / 280;
      const drawX = (target.w - drawW) / 2 + offset.x * offsetRatio;
      const drawY = (target.h - drawH) / 2 + offset.y * offsetRatio;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode cropped image.'))),
          'image/webp',
          0.92
        );
      });

      const safeSlug = (memberName || 'team-member').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const file = new File([blob], `${safeSlug}-portrait.webp`, { type: 'image/webp' });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', `${memberName || 'Team Member'} Profile Photograph`);
      fd.append('category', defaultCategory);
      fd.append('altText', `${memberName || 'Team Member'} — NexusTekFusion Private Limited`);
      fd.append('folder', 'team');

      const res = await apiFetch<{ asset: { url: string } }>('/api/admin/media/upload', {
        method: 'POST',
        body: fd,
      });

      onApplyPhoto(res.asset.url, `${memberName || 'Team Member'} portrait`);
      notify('Cropped profile photograph uploaded & applied.', 'success');
      onClose();
    } catch (err: any) {
      notify(err?.message || 'Unable to save cropped portrait.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const previewHeight = aspect === '1:1' ? 280 : aspect === '4:5' ? 350 : 373;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-[#DCEAF5] text-xs">
          <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-[#123B5D]">
                Profile Image Studio — {memberName || 'Team Member'}
              </h3>
              <p className="text-[11px] text-[#263746]/70">
                Upload JPG/PNG/WebP, reposition &amp; crop, pick from Media Library, or assign a neutral avatar.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 text-[#263746] hover:bg-white rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Crop Frame */}
            <div className="md:col-span-6 flex flex-col items-center space-y-3">
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ width: 280, height: previewHeight }}
                className="relative rounded-xl overflow-hidden bg-[#F0F8FF] border-2 border-[#90CAF9] cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
              >
                {sourceUrl ? (
                  <img
                    ref={imgRef}
                    src={sourceUrl}
                    alt={memberName || 'Portrait preview'}
                    crossOrigin="anonymous"
                    onLoad={() => setImgLoaded(true)}
                    draggable={false}
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    }}
                    className="w-full h-full object-cover transition-none pointer-events-none"
                  />
                ) : (
                  <div className="text-[#263746]/60 text-center p-6">No photograph selected</div>
                )}
                <div className="pointer-events-none absolute inset-0 border border-[#64B5F6]/40 rounded-xl" />
              </div>

              <div className="w-[280px] flex items-center gap-2">
                <ZoomOut className="w-4 h-4 text-[#42A5F5] shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={2.6}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-[#64B5F6]"
                />
                <ZoomIn className="w-4 h-4 text-[#42A5F5] shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                  title="Reset Crop & Position"
                  className="p-1.5 border border-[#90CAF9] bg-white rounded hover:bg-[#F0F8FF] text-[#123B5D]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[11px] text-[#263746]/70">Drag inside the frame to reposition · Slider to zoom</div>
            </div>

            {/* Controls */}
            <div className="md:col-span-6 space-y-4">
              <div className="space-y-1.5">
                <div className="font-semibold text-[#123B5D]">Upload New Photograph</div>
                <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold cursor-pointer transition-colors">
                  <Upload className="w-4 h-4" /> Upload JPG / PNG / WebP
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      handleFilePick(e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-[#123B5D]">Aspect Ratio</div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ASPECT_RATIO_DIMENSIONS) as AspectPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAspect(preset)}
                      className={`py-2 px-2 rounded-lg border font-semibold transition-colors ${
                        aspect === preset
                          ? 'bg-[#64B5F6] text-white border-[#64B5F6]'
                          : 'bg-white text-[#263746] border-[#DCEAF5] hover:bg-[#F0F8FF]'
                      }`}
                    >
                      {ASPECT_RATIO_DIMENSIONS[preset].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#DCEAF5] pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full py-2 px-3 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#42A5F5]" /> Pick from Media Library
                </button>
                <button
                  type="button"
                  onClick={pickRandomNeutralAvatar}
                  className="w-full py-2 px-3 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Shuffle className="w-3.5 h-3.5 text-[#42A5F5]" /> Use Random Neutral Avatar
                </button>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="w-full py-2 px-3 rounded-lg border border-red-200 bg-red-50/60 hover:bg-red-50 text-red-700 font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove Uploaded Photo
                </button>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-[#F0F8FF] border-t border-[#DCEAF5] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={handleSaveCropped}
              className="px-5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" />
              {uploading ? 'Uploading Cropped Photo...' : 'Apply & Save Portrait'}
            </button>
          </div>
        </div>
      </div>

      <MediaPickerModal
        open={pickerOpen}
        title="Select Team Portrait from Media Library"
        filterKind="image"
        defaultCategory={defaultCategory}
        onClose={() => setPickerOpen(false)}
        onSelect={(asset) => {
          setSourceUrl(asset.url);
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        }}
      />
    </>
  );
};
