import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { MediaAssetRecord } from '../../types/platform';

export const CMS_MEDIA_CATEGORIES = [
  'Company Branding',
  'Team Photographs',
  'Founder Profile',
  'Agricultural Drones',
  'KRASHIVANTRI Products',
  'Engineering Projects',
  'Robotics',
  'Manufacturing',
  'Services',
  'Banners',
  'Promotional Videos',
  'Company Events',
] as const;

const ACCEPTED_MEDIA_TYPES =
  '.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,.mov,.m4v,.pdf,.stl,.obj,.glb,.step,.stp';

function inferKind(asset: Partial<MediaAssetRecord>): 'image' | 'video' | 'model3d' | 'document' {
  if (asset.mediaKind === 'video' || asset.mediaKind === 'image' || asset.mediaKind === 'model3d' || asset.mediaKind === 'document') {
    return asset.mediaKind;
  }
  const mime = String(asset.mimeType || '').toLowerCase();
  const name = String(asset.fileName || asset.url || '').toLowerCase();
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/.test(name)) return 'video';
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/.test(name)) return 'image';
  if (/\.(stl|obj|glb|step|stp)(\?|$)/.test(name)) return 'model3d';
  return 'document';
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MediaLibraryPanel: React.FC<{
  pickerMode?: boolean;
  filterKind?: 'all' | 'image' | 'video';
  defaultCategory?: string;
  onSelectAsset?: (asset: MediaAssetRecord) => void;
}> = ({ pickerMode = false, filterKind = 'all', defaultCategory = 'Company Branding', onSelectAsset }) => {
  const { apiFetch, notify } = usePlatform();
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>(defaultCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'video' | 'document' | 'model3d'>(filterKind);

  const [previewAsset, setPreviewAsset] = useState<MediaAssetRecord | null>(null);
  const [editingAsset, setEditingAsset] = useState<MediaAssetRecord | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    fileName: '',
    description: '',
    category: 'Company Branding',
    altText: '',
    thumbnailUrl: '',
  });
  const [savingMeta, setSavingMeta] = useState(false);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState<MediaAssetRecord | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: MediaAssetRecord[] }>('/api/admin/media');
      setAssets(res.items || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load media library.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const handleBatchUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const files = Array.from(fileList);
      if (files.length === 1) {
        const fd = new FormData();
        fd.append('file', files[0]);
        fd.append('category', uploadCategory);
        fd.append('folder', uploadCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        const res = await apiFetch<{ asset: MediaAssetRecord }>('/api/admin/media/upload', {
          method: 'POST',
          body: fd,
        });
        notify(`Uploaded "${res.asset.title || res.asset.fileName}".`, 'success');
      } else {
        const fd = new FormData();
        files.slice(0, 12).forEach((f) => fd.append('files', f));
        fd.append('category', uploadCategory);
        fd.append('folder', uploadCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        const res = await apiFetch<{ assets: MediaAssetRecord[] }>('/api/admin/media/upload-batch', {
          method: 'POST',
          body: fd,
        });
        notify(`Uploaded ${res.assets.length} media file(s) to ${uploadCategory}.`, 'success');
      }
      await loadMedia();
    } catch (err: any) {
      notify(err?.message || 'Media upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceFile = async (assetId: number, file: File | null) => {
    if (!file) return;
    setReplacingId(assetId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiFetch(`/api/admin/media/${assetId}/replace`, {
        method: 'POST',
        body: fd,
      });
      notify('Media file replaced seamlessly.', 'success');
      await loadMedia();
    } catch (err: any) {
      notify(err?.message || 'Failed to replace media file.', 'error');
    } finally {
      setReplacingId(null);
    }
  };

  const openMetadataModal = (asset: MediaAssetRecord) => {
    setEditingAsset(asset);
    setEditForm({
      title: asset.title || asset.fileName || '',
      fileName: asset.fileName || '',
      description: asset.description || '',
      category: asset.category || 'Company Branding',
      altText: asset.altText || '',
      thumbnailUrl: asset.thumbnailUrl || '',
    });
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset) return;
    setSavingMeta(true);
    try {
      await apiFetch(`/api/admin/media/${editingAsset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          folder: editForm.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        }),
      });
      notify('Media metadata updated.', 'success');
      setEditingAsset(null);
      await loadMedia();
    } catch (err: any) {
      notify(err?.message || 'Failed to update media metadata.', 'error');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmAsset) return;
    try {
      await apiFetch(`/api/admin/media/${deleteConfirmAsset.id}`, { method: 'DELETE' });
      notify(`Deleted "${deleteConfirmAsset.title || deleteConfirmAsset.fileName}".`, 'info');
      setDeleteConfirmAsset(null);
      await loadMedia();
    } catch (err: any) {
      notify(err?.message || 'Failed to delete media asset.', 'error');
    }
  };

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((a) => {
      const kind = inferKind(a);
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      if (activeCategory !== 'All') {
        const cat = a.category || a.folder || '';
        if (cat.toLowerCase() !== activeCategory.toLowerCase()) return false;
      }
      if (!q) return true;
      return (
        String(a.title || '').toLowerCase().includes(q) ||
        String(a.fileName || '').toLowerCase().includes(q) ||
        String(a.description || '').toLowerCase().includes(q) ||
        String(a.altText || '').toLowerCase().includes(q) ||
        String(a.category || '').toLowerCase().includes(q)
      );
    });
  }, [assets, activeCategory, kindFilter, searchQuery]);

  const counts = useMemo(() => {
    let images = 0;
    let videos = 0;
    let others = 0;
    for (const a of assets) {
      const k = inferKind(a);
      if (k === 'image') images++;
      else if (k === 'video') videos++;
      else others++;
    }
    return { total: assets.length, images, videos, others };
  }, [assets]);

  return (
    <div className="space-y-6 text-xs">
      {/* Upload Dropzone + Category Assignment */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#123B5D]">
              Centralized Media Library (Images, Videos &amp; Documents)
            </h2>
            <p className="text-[#263746]/70 mt-0.5 tabular-nums">
              {counts.total} total assets · {counts.images} images · {counts.videos} videos · {counts.others} docs/3D files
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold text-[#123B5D]">Upload Category:</label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-1.5 font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            >
              {CMS_MEDIA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadMedia}
              className="px-3 py-1.5 border border-[#90CAF9] bg-white rounded-lg font-semibold text-[#123B5D] hover:bg-[#F0F8FF] inline-flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#42A5F5]" /> Refresh
            </button>
          </div>
        </div>

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleBatchUpload(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#90CAF9] hover:border-[#42A5F5] rounded-xl p-7 bg-[#F0F8FF] cursor-pointer transition-colors"
        >
          <Upload className="w-6 h-6 text-[#42A5F5]" />
          <span className="font-semibold text-[#123B5D] text-sm">
            {uploading
              ? 'Uploading media files...'
              : 'Drag & drop multiple images or videos, or click to browse'}
          </span>
          <span className="text-[11px] text-[#263746]/70">
            Images (JPG, JPEG, PNG, WebP, SVG) · Videos (MP4, WebM, MOV) · PDF / STL / GLB · Up to 12 files per batch (150 MB max)
          </span>
          <input
            type="file"
            multiple
            accept={ACCEPTED_MEDIA_TYPES}
            disabled={uploading}
            onChange={(e) => {
              handleBatchUpload(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </label>
      </div>

      {/* Search, Kind & Category Filter Controls */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#42A5F5] absolute left-3 top-2.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, filename, description, or alt text..."
              className="w-full rounded-lg border border-[#DCEAF5] bg-white pl-9 pr-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            />
          </div>
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          >
            <option value="All">All 12 CMS Categories</option>
            {CMS_MEDIA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="flex items-center border border-[#DCEAF5] rounded-lg p-0.5 bg-[#F0F8FF]">
            {(
              [
                ['all', 'All'],
                ['image', 'Images'],
                ['video', 'Videos'],
                ['document', 'Docs'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  kindFilter === k ? 'bg-[#64B5F6] text-white' : 'text-[#263746] hover:text-[#123B5D]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Gallery */}
      {loading ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center text-[#263746]/70">
          Loading media assets...
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center text-[#263746]/70 space-y-2">
          <Layers className="w-8 h-8 text-[#90CAF9] mx-auto" />
          <div className="font-semibold text-[#123B5D]">No matching media assets found</div>
          <p className="text-[11px]">Upload images or videos above, or clear your search/category filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => {
            const kind = inferKind(asset);
            return (
              <div
                key={asset.id}
                className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between hover:border-[#64B5F6] transition-colors shadow-sm"
              >
                <div>
                  <div className="relative aspect-[4/3] bg-[#F0F8FF] flex items-center justify-center overflow-hidden group">
                    {kind === 'image' ? (
                      <img
                        src={asset.url}
                        alt={asset.altText || asset.title || asset.fileName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : kind === 'video' ? (
                      asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.title || asset.fileName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={asset.url}
                          preload="metadata"
                          muted
                          className="w-full h-full object-cover opacity-85"
                        />
                      )
                    ) : (
                      <FileText className="w-10 h-10 text-[#42A5F5]" />
                    )}

                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#123B5D]/85 text-white font-mono text-[10px] flex items-center gap-1">
                      {kind === 'video' ? (
                        <Film className="w-3 h-3 text-[#90CAF9]" />
                      ) : (
                        <ImageIcon className="w-3 h-3 text-[#90CAF9]" />
                      )}
                      <span>{kind}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPreviewAsset(asset)}
                      className="absolute bottom-2 right-2 px-2.5 py-1 rounded bg-white/95 text-[#123B5D] border border-[#DCEAF5] font-semibold text-[10px] inline-flex items-center gap-1 shadow hover:bg-[#F0F8FF]"
                    >
                      <Eye className="w-3 h-3 text-[#42A5F5]" /> Preview
                    </button>
                  </div>

                  <div className="p-3.5 space-y-1">
                    <div className="font-semibold text-[#123B5D] truncate" title={asset.title || asset.fileName}>
                      {asset.title || asset.fileName}
                    </div>
                    <div className="text-[11px] text-[#42A5F5] font-medium truncate">
                      {asset.category || asset.folder || 'Company Branding'}
                    </div>
                    {asset.description && (
                      <p className="text-[11px] text-[#263746]/70 line-clamp-2">{asset.description}</p>
                    )}
                    <div className="text-[10px] font-mono text-[#263746]/60 tabular-nums truncate">
                      {asset.fileName} · {formatBytes(asset.sizeBytes)}
                    </div>
                  </div>
                </div>

                <div className="px-3.5 pb-3.5 pt-2 border-t border-[#DCEAF5] space-y-2">
                  {pickerMode && onSelectAsset ? (
                    <button
                      type="button"
                      onClick={() => onSelectAsset(asset)}
                      className="w-full py-2 px-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Select Media
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(asset.url);
                          notify(`Copied URL: ${asset.url}`, 'info');
                        }}
                        className="flex-1 py-1.5 px-2 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold inline-flex items-center justify-center gap-1 hover:bg-[#F0F8FF] transition-colors"
                      >
                        <Copy className="w-3 h-3 text-[#42A5F5]" /> URL
                      </button>
                      <button
                        type="button"
                        onClick={() => openMetadataModal(asset)}
                        className="py-1.5 px-2 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF] transition-colors"
                        title="Rename & Edit Metadata"
                      >
                        <Edit3 className="w-3 h-3 text-[#42A5F5]" /> Edit
                      </button>
                      <label
                        className="py-1.5 px-2 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF] cursor-pointer transition-colors"
                        title="Replace File"
                      >
                        <Upload className="w-3 h-3 text-[#42A5F5]" />
                        {replacingId === asset.id ? '...' : 'Replace'}
                        <input
                          type="file"
                          accept={ACCEPTED_MEDIA_TYPES}
                          disabled={replacingId === asset.id}
                          onChange={(e) => {
                            handleReplaceFile(asset.id, e.target.files?.[0] || null);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmAsset(asset)}
                        className="p-1.5 text-red-600 border border-red-200 rounded hover:bg-red-50"
                        title="Delete Media"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Media Preview Modal */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-[#DCEAF5]">
            <div className="px-5 py-3.5 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-display font-bold text-base text-[#123B5D] truncate">
                  {previewAsset.title || previewAsset.fileName}
                </div>
                <div className="text-[11px] font-mono text-[#263746]/70 truncate">{previewAsset.url}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="p-1.5 rounded-lg text-[#263746] hover:bg-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-[#F0F8FF] flex items-center justify-center max-h-[65vh] overflow-hidden p-4">
              {inferKind(previewAsset) === 'image' ? (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.altText || previewAsset.fileName}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] w-auto object-contain rounded border border-[#DCEAF5]"
                />
              ) : inferKind(previewAsset) === 'video' ? (
                <video
                  src={previewAsset.url}
                  poster={previewAsset.thumbnailUrl || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[60vh] w-full rounded bg-[#123B5D]"
                />
              ) : (
                <div className="py-12 text-center text-[#263746] space-y-2">
                  <FileText className="w-12 h-12 mx-auto text-[#42A5F5]" />
                  <div>{previewAsset.fileName}</div>
                  <a
                    href={previewAsset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                  >
                    Open Document
                  </a>
                </div>
              )}
            </div>
            <div className="p-4 bg-[#F0F8FF] border-t border-[#DCEAF5] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-[#263746]/80">
                <span className="font-semibold text-[#123B5D]">Category:</span> {previewAsset.category || 'Company Branding'} ·{' '}
                <span className="font-semibold text-[#123B5D]">Alt:</span> {previewAsset.altText || 'None'}
              </div>
              <div className="flex gap-2">
                {pickerMode && onSelectAsset && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAsset(previewAsset);
                      setPreviewAsset(null);
                    }}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                  >
                    Use This Asset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename & Metadata Editor Modal */}
      {editingAsset && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMetadata}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5]"
          >
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <h3 className="font-display text-base font-bold text-[#123B5D]">
                Edit Media Metadata
              </h3>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="p-1 text-[#263746] hover:bg-[#F0F8FF] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Title / Display Name</label>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">File Name</label>
                <input
                  required
                  value={editForm.fileName}
                  onChange={(e) => setEditForm({ ...editForm, fileName: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Category Folder</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                >
                  {CMS_MEDIA_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">SEO Alt Text</label>
                <input
                  value={editForm.altText}
                  onChange={(e) => setEditForm({ ...editForm, altText: e.target.value })}
                  placeholder="Descriptive alt text for accessibility & Google Image SEO"
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Description / Caption</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
              {inferKind(editingAsset) === 'video' && (
                <div className="space-y-1">
                  <label className="font-semibold text-[#123B5D]">Video Thumbnail Poster URL (Optional)</label>
                  <input
                    value={editForm.thumbnailUrl}
                    onChange={(e) => setEditForm({ ...editForm, thumbnailUrl: e.target.value })}
                    placeholder="https://... or /uploads/media/..."
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#DCEAF5]">
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingMeta}
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
              >
                {savingMeta ? 'Saving...' : 'Save Metadata'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAsset && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5]">
            <h3 className="font-display text-base font-bold text-red-700">Delete Media Asset?</h3>
            <p className="text-[#263746]/80 leading-relaxed">
              Permanently delete <strong className="text-[#123B5D]">{deleteConfirmAsset.title || deleteConfirmAsset.fileName}</strong> from the Media Library? Any website section referencing this URL will fall back to its placeholder until replaced.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmAsset(null)}
                className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MediaPickerModal: React.FC<{
  open: boolean;
  title?: string;
  filterKind?: 'all' | 'image' | 'video';
  defaultCategory?: string;
  onClose: () => void;
  onSelect: (asset: MediaAssetRecord) => void;
}> = ({ open, title = 'Select Media from Library', filterKind = 'all', defaultCategory, onClose, onSelect }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
      <div className="bg-[#F0F8FF] rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-[#90CAF9]">
        <div className="bg-white px-6 py-4 border-b border-[#DCEAF5] flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[#123B5D]">{title}</h2>
            <p className="text-xs text-[#263746]/70">Pick an existing asset or drag-and-drop a new file directly.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#263746] hover:bg-[#F0F8FF] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <MediaLibraryPanel
            pickerMode
            filterKind={filterKind}
            defaultCategory={defaultCategory}
            onSelectAsset={(asset) => {
              onSelect(asset);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};
