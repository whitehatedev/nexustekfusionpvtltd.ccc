import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Save,
  Stamp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';

interface PlacementPos {
  preset: 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
  xMm: number;
  yMm: number;
}

interface PlacementSize {
  widthMm: number;
  heightMm: number;
}

interface DocumentSettingsRecord {
  id: number;
  letterheadFilePath: string;
  letterheadFileName: string;
  letterheadMimeType: string;
  stampFilePath: string;
  stampFileName: string;
  stampMimeType: string;
  signatureFilePath: string;
  signatureFileName: string;
  signatureMimeType: string;
  storageBucket: string;
  stampPosition: PlacementPos;
  stampSize: PlacementSize;
  signaturePosition: PlacementPos;
  signatureSize: PlacementSize;
  updatedBy: string;
  updatedAt: string;
}

const DEFAULT_STAMP_POS: PlacementPos = { preset: 'bottom-left', xMm: 22, yMm: 238 };
const DEFAULT_STAMP_SIZE: PlacementSize = { widthMm: 30, heightMm: 30 };
const DEFAULT_SIG_POS: PlacementPos = { preset: 'bottom-right', xMm: 140, yMm: 244 };
const DEFAULT_SIG_SIZE: PlacementSize = { widthMm: 48, heightMm: 20 };

export const DocumentInvoiceSettingsPanel: React.FC = () => {
  const { apiFetch, getIdToken, notify } = usePlatform();

  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [removingKind, setRemovingKind] = useState<string | null>(null);
  const [settings, setSettings] = useState<DocumentSettingsRecord | null>(null);

  const [stampPosition, setStampPosition] = useState<PlacementPos>(DEFAULT_STAMP_POS);
  const [stampSize, setStampSize] = useState<PlacementSize>(DEFAULT_STAMP_SIZE);
  const [signaturePosition, setSignaturePosition] = useState<PlacementPos>(DEFAULT_SIG_POS);
  const [signatureSize, setSignatureSize] = useState<PlacementSize>(DEFAULT_SIG_SIZE);

  // Staged local files for instant preview before saving
  const [stagedLetterhead, setStagedLetterhead] = useState<{ file: File; url: string } | null>(null);
  const [stagedStamp, setStagedStamp] = useState<{ file: File; url: string } | null>(null);
  const [stagedSignature, setStagedSignature] = useState<{ file: File; url: string } | null>(null);

  // Saved asset preview object URLs loaded securely from Supabase Storage via admin API
  const [savedPreviews, setSavedPreviews] = useState<{
    letterhead?: string;
    stamp?: string;
    signature?: string;
  }>({});

  const [previewDocModal, setPreviewDocModal] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);

  const fetchSavedAssetPreview = useCallback(
    async (kind: 'letterhead' | 'stamp' | 'signature') => {
      try {
        const token = await getIdToken();
        const resp = await fetch(`/api/admin/document-settings/asset/${kind}?t=${Date.now()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'same-origin',
        });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    },
    [getIdToken]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ settings: DocumentSettingsRecord }>('/api/admin/document-settings');
      const s = res.settings;
      setSettings(s);
      if (s.stampPosition) setStampPosition(s.stampPosition);
      if (s.stampSize) setStampSize(s.stampSize);
      if (s.signaturePosition) setSignaturePosition(s.signaturePosition);
      if (s.signatureSize) setSignatureSize(s.signatureSize);

      const [lhUrl, stUrl, sgUrl] = await Promise.all([
        s.letterheadFilePath ? fetchSavedAssetPreview('letterhead') : Promise.resolve(null),
        s.stampFilePath ? fetchSavedAssetPreview('stamp') : Promise.resolve(null),
        s.signatureFilePath ? fetchSavedAssetPreview('signature') : Promise.resolve(null),
      ]);

      setSavedPreviews((prev) => {
        if (prev.letterhead) URL.revokeObjectURL(prev.letterhead);
        if (prev.stamp) URL.revokeObjectURL(prev.stamp);
        if (prev.signature) URL.revokeObjectURL(prev.signature);
        return {
          letterhead: lhUrl || undefined,
          stamp: stUrl || undefined,
          signature: sgUrl || undefined,
        };
      });
    } catch (err: any) {
      notify(err?.message || 'Failed to load Document & Invoice Settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, fetchSavedAssetPreview, notify]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const stageFile = (kind: 'letterhead' | 'stamp' | 'signature', file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (kind === 'letterhead') {
      setStagedLetterhead((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { file, url };
      });
    } else if (kind === 'stamp') {
      setStagedStamp((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { file, url };
      });
    } else {
      setStagedSignature((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { file, url };
      });
    }
  };

  const uploadSingleKind = async (kind: 'letterhead' | 'stamp' | 'signature', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch<{ settings: DocumentSettingsRecord }>(
      `/api/admin/document-settings/upload/${kind}`,
      { method: 'POST', body: fd }
    );
    return res.settings;
  };

  const handleUploadStaged = async (kind: 'letterhead' | 'stamp' | 'signature') => {
    const staged =
      kind === 'letterhead' ? stagedLetterhead : kind === 'stamp' ? stagedStamp : stagedSignature;
    if (!staged) return;
    setUploadingKind(kind);
    try {
      await uploadSingleKind(kind, staged.file);
      if (kind === 'letterhead') {
        URL.revokeObjectURL(staged.url);
        setStagedLetterhead(null);
      } else if (kind === 'stamp') {
        URL.revokeObjectURL(staged.url);
        setStagedStamp(null);
      } else {
        URL.revokeObjectURL(staged.url);
        setStagedSignature(null);
      }
      notify(`${kind.charAt(0).toUpperCase() + kind.slice(1)} uploaded to Supabase Storage.`, 'success');
      await loadSettings();
    } catch (err: any) {
      notify(err?.message || `Failed to upload ${kind}.`, 'error');
    } finally {
      setUploadingKind(null);
    }
  };

  const handleRemoveAsset = async (kind: 'letterhead' | 'stamp' | 'signature') => {
    if (kind === 'letterhead' && stagedLetterhead) {
      URL.revokeObjectURL(stagedLetterhead.url);
      setStagedLetterhead(null);
      if (!settings?.letterheadFilePath) return;
    }
    if (kind === 'stamp' && stagedStamp) {
      URL.revokeObjectURL(stagedStamp.url);
      setStagedStamp(null);
      if (!settings?.stampFilePath) return;
    }
    if (kind === 'signature' && stagedSignature) {
      URL.revokeObjectURL(stagedSignature.url);
      setStagedSignature(null);
      if (!settings?.signatureFilePath) return;
    }

    setRemovingKind(kind);
    try {
      await apiFetch(`/api/admin/document-settings/asset/${kind}`, { method: 'DELETE' });
      notify(`${kind.charAt(0).toUpperCase() + kind.slice(1)} removed.`, 'info');
      await loadSettings();
    } catch (err: any) {
      notify(err?.message || `Failed to remove ${kind}.`, 'error');
    } finally {
      setRemovingKind(null);
    }
  };

  const handleSaveAllSettings = async () => {
    setSavingAll(true);
    try {
      if (stagedLetterhead) {
        await uploadSingleKind('letterhead', stagedLetterhead.file);
        URL.revokeObjectURL(stagedLetterhead.url);
        setStagedLetterhead(null);
      }
      if (stagedStamp) {
        await uploadSingleKind('stamp', stagedStamp.file);
        URL.revokeObjectURL(stagedStamp.url);
        setStagedStamp(null);
      }
      if (stagedSignature) {
        await uploadSingleKind('signature', stagedSignature.file);
        URL.revokeObjectURL(stagedSignature.url);
        setStagedSignature(null);
      }

      await apiFetch<{ settings: DocumentSettingsRecord }>('/api/admin/document-settings', {
        method: 'PUT',
        body: JSON.stringify({
          stampPosition,
          stampSize,
          signaturePosition,
          signatureSize,
        }),
      });
      notify('Document & Invoice Settings saved successfully.', 'success');
      await loadSettings();
    } catch (err: any) {
      notify(err?.message || 'Failed to save Document & Invoice Settings.', 'error');
    } finally {
      setSavingAll(false);
    }
  };

  const handlePreviewGeneratedDocument = async (
    docType: 'agreement' | 'receipt' | 'final_invoice',
    title: string
  ) => {
    if (stagedLetterhead || stagedStamp || stagedSignature) {
      notify('Tip: Click "Save Settings" first if you want staged unsaved files included in server preview.', 'info');
    }
    setPreviewBusy(docType);
    try {
      const res = await apiFetch<{ pdfBase64: string }>('/api/admin/document-settings/preview', {
        method: 'POST',
        body: JSON.stringify({
          docType,
          stampPosition,
          stampSize,
          signaturePosition,
          signatureSize,
        }),
      });
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewDocModal((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { title, url };
      });
    } catch (err: any) {
      notify(err?.message || 'Unable to generate PDF preview.', 'error');
    } finally {
      setPreviewBusy(null);
    }
  };

  const applyStampPreset = (preset: PlacementPos['preset']) => {
    if (preset === 'bottom-left') {
      setStampPosition({ preset, xMm: 20, yMm: 238 });
    } else if (preset === 'bottom-center') {
      setStampPosition({ preset, xMm: Math.round((210 - stampSize.widthMm) / 2), yMm: 238 });
    } else if (preset === 'bottom-right') {
      setStampPosition({ preset, xMm: Math.max(15, 190 - stampSize.widthMm), yMm: 238 });
    } else {
      setStampPosition((p) => ({ ...p, preset: 'custom' }));
    }
  };

  const applySigPreset = (preset: PlacementPos['preset']) => {
    if (preset === 'bottom-left') {
      setSignaturePosition({ preset, xMm: 20, yMm: 244 });
    } else if (preset === 'bottom-center') {
      setSignaturePosition({ preset, xMm: Math.round((210 - signatureSize.widthMm) / 2), yMm: 244 });
    } else if (preset === 'bottom-right') {
      setSignaturePosition({ preset, xMm: Math.max(15, 190 - signatureSize.widthMm), yMm: 244 });
    } else {
      setSignaturePosition((p) => ({ ...p, preset: 'custom' }));
    }
  };

  if (loading && !settings) {
    return (
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-center text-xs text-[#263746]/70">
        Loading Document &amp; Invoice Settings...
      </div>
    );
  }

  const letterheadPreviewUrl = stagedLetterhead?.url || savedPreviews.letterhead || '';
  const letterheadIsPdf = stagedLetterhead
    ? stagedLetterhead.file.type === 'application/pdf' ||
      stagedLetterhead.file.name.toLowerCase().endsWith('.pdf')
    : Boolean(settings?.letterheadMimeType?.includes('pdf'));

  const stampPreviewUrl = stagedStamp?.url || savedPreviews.stamp || '';
  const sigPreviewUrl = stagedSignature?.url || savedPreviews.signature || '';

  return (
    <div className="space-y-6 text-xs">
      {/* Header */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#123B5D] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#42A5F5]" />
            Document &amp; Invoice Settings
          </h2>
          <p className="text-[#263746]/75 mt-1">
            Configure your official A4 Company Letterhead (PDF/PNG/JPG), Company Stamp, and Authorized Signature for automatic Agreements, Installment Payment Receipts, and Final Project Invoices stored in Supabase Storage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadSettings}
            className="px-3 py-2 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#42A5F5]" /> Refresh
          </button>
          <button
            type="button"
            disabled={savingAll}
            onClick={handleSaveAllSettings}
            className="px-4 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {savingAll ? 'Saving Settings...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* A. COMPANY LETTERHEAD */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5] pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#123B5D]">
              A. Company Letterhead (A4 Portrait)
            </h3>
            <p className="text-[#263746]/75 mt-0.5">
              Supported formats: <strong>PDF, PNG, JPG</strong> · Recommended dimensions: <strong>A4 (210 × 297 mm), Portrait</strong>. Used without stretching as the template background for Agreements, Receipts &amp; Final Invoices.
            </p>
          </div>
          {settings?.letterheadFilePath && !stagedLetterhead && (
            <span className="px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved: {settings.letterheadFileName}
            </span>
          )}
          {stagedLetterhead && (
            <span className="px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[11px]">
              Previewing Unsaved File: {stagedLetterhead.file.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-3">
            <div className="rounded-lg border border-dashed border-[#90CAF9] bg-[#F0F8FF]/60 p-4 space-y-3">
              <label className="block font-semibold text-[#123B5D]">
                {settings?.letterheadFilePath ? 'Replace A4 Company Letterhead' : 'Upload A4 Company Letterhead'}
              </label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  stageFile('letterhead', e.target.files?.[0] || null);
                  e.target.value = '';
                }}
                className="block w-full text-xs text-[#263746] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#90CAF9] file:bg-white file:text-[#123B5D] file:font-semibold hover:file:bg-[#DCEAF5]"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {stagedLetterhead && (
                  <button
                    type="button"
                    disabled={uploadingKind === 'letterhead'}
                    onClick={() => handleUploadStaged('letterhead')}
                    className="px-3 py-1.5 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingKind === 'letterhead' ? 'Uploading...' : 'Save Letterhead to Cloud'}
                  </button>
                )}
                {(settings?.letterheadFilePath || stagedLetterhead) && (
                  <button
                    type="button"
                    disabled={removingKind === 'letterhead'}
                    onClick={() => handleRemoveAsset('letterhead')}
                    className="px-3 py-1.5 border border-red-300 bg-white hover:bg-red-50 text-red-700 rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {removingKind === 'letterhead' ? 'Removing...' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
            {settings?.letterheadFilePath && (
              <div className="text-[11px] font-mono text-[#263746]/70 break-all">
                Storage Path: {settings.storageBucket || 'company-assets'}/{settings.letterheadFilePath}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-[#123B5D]">Letterhead Preview (210 × 297 mm Portrait)</div>
            <div className="w-full max-w-[260px] aspect-[210/297] rounded-lg border border-[#DCEAF5] bg-[#F8FAFC] overflow-hidden flex items-center justify-center">
              {letterheadPreviewUrl ? (
                letterheadIsPdf ? (
                  <iframe
                    title="A4 Letterhead Preview"
                    src={letterheadPreviewUrl}
                    className="w-full h-full border-0"
                  />
                ) : (
                  <img
                    src={letterheadPreviewUrl}
                    alt="Company A4 Letterhead Preview"
                    className="w-full h-full object-contain"
                  />
                )
              ) : (
                <div className="p-4 text-center text-[#263746]/50">
                  <FileText className="w-8 h-8 mx-auto mb-1 text-[#90CAF9]" />
                  No A4 letterhead uploaded.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* B. COMPANY STAMP & C. AUTHORIZED SIGNATURE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* B. Company Stamp */}
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-2 border-b border-[#DCEAF5] pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#123B5D] flex items-center gap-1.5">
                <Stamp className="w-4 h-4 text-[#42A5F5]" />
                B. Company Stamp
              </h3>
              <p className="text-[#263746]/75 mt-0.5">
                PNG with transparent background preferred; JPG supported.
              </p>
            </div>
            {settings?.stampFilePath && !stagedStamp && (
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px]">
                Saved
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-28 h-28 rounded-lg border border-[#DCEAF5] bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:10px_10px] flex items-center justify-center overflow-hidden shrink-0">
              {stampPreviewUrl ? (
                <img src={stampPreviewUrl} alt="Company Stamp Preview" className="max-w-full max-h-full object-contain p-1" />
              ) : (
                <span className="text-[11px] text-[#263746]/50 text-center px-2">No Stamp</span>
              )}
            </div>
            <div className="flex-1 space-y-2.5 w-full">
              <input
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={(e) => {
                  stageFile('stamp', e.target.files?.[0] || null);
                  e.target.value = '';
                }}
                className="block w-full text-xs text-[#263746] file:mr-2.5 file:py-1 file:px-2.5 file:rounded file:border file:border-[#90CAF9] file:bg-[#F0F8FF] file:text-[#123B5D] file:font-semibold"
              />
              <div className="flex flex-wrap gap-2">
                {stagedStamp && (
                  <button
                    type="button"
                    disabled={uploadingKind === 'stamp'}
                    onClick={() => handleUploadStaged('stamp')}
                    className="px-3 py-1 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Upload className="w-3 h-3" />
                    {uploadingKind === 'stamp' ? 'Uploading...' : 'Save Stamp'}
                  </button>
                )}
                {(settings?.stampFilePath || stagedStamp) && (
                  <button
                    type="button"
                    disabled={removingKind === 'stamp'}
                    onClick={() => handleRemoveAsset('stamp')}
                    className="px-2.5 py-1 border border-red-300 text-red-700 hover:bg-red-50 rounded font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>
              {settings?.stampFilePath && (
                <div className="text-[10px] font-mono text-[#263746]/70 break-all">
                  {settings.stampFilePath}
                </div>
              )}
            </div>
          </div>

          {/* Stamp Position & Size Controls */}
          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-3.5 space-y-3">
            <div className="font-semibold text-[#123B5D]">Stamp Position &amp; Size on A4 (mm)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Placement Preset</label>
                <select
                  value={stampPosition.preset}
                  onChange={(e) => applyStampPreset(e.target.value as PlacementPos['preset'])}
                  className="w-full rounded border border-[#DCEAF5] bg-white px-2 py-1 text-[#123B5D]"
                >
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="custom">Custom X/Y</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">X (mm)</label>
                <input
                  type="number"
                  min={5}
                  max={190}
                  value={stampPosition.xMm}
                  onChange={(e) =>
                    setStampPosition({ ...stampPosition, preset: 'custom', xMm: Number(e.target.value || 0) })
                  }
                  className="w-full rounded border border-[#DCEAF5] bg-white px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Y from Top (mm)</label>
                <input
                  type="number"
                  min={20}
                  max={280}
                  value={stampPosition.yMm}
                  onChange={(e) =>
                    setStampPosition({ ...stampPosition, preset: 'custom', yMm: Number(e.target.value || 0) })
                  }
                  className="w-full rounded border border-[#DCEAF5] bg-white px-2 py-1 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">W (mm)</label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={stampSize.widthMm}
                    onChange={(e) => setStampSize({ ...stampSize, widthMm: Number(e.target.value || 20) })}
                    className="w-full rounded border border-[#DCEAF5] bg-white px-1.5 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">H (mm)</label>
                  <input
                    type="number"
                    min={10}
                    max={80}
                    value={stampSize.heightMm}
                    onChange={(e) => setStampSize({ ...stampSize, heightMm: Number(e.target.value || 20) })}
                    className="w-full rounded border border-[#DCEAF5] bg-white px-1.5 py-1 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* C. Authorized Signature */}
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-2 border-b border-[#DCEAF5] pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#123B5D] flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#42A5F5]" />
                C. Authorized Signature
              </h3>
              <p className="text-[#263746]/75 mt-0.5">
                Transparent PNG preferred; JPG supported.
              </p>
            </div>
            {settings?.signatureFilePath && !stagedSignature && (
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px]">
                Saved
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-36 h-24 rounded-lg border border-[#DCEAF5] bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:10px_10px] flex items-center justify-center overflow-hidden shrink-0">
              {sigPreviewUrl ? (
                <img src={sigPreviewUrl} alt="Authorized Signature Preview" className="max-w-full max-h-full object-contain p-1" />
              ) : (
                <span className="text-[11px] text-[#263746]/50 text-center px-2">No Signature</span>
              )}
            </div>
            <div className="flex-1 space-y-2.5 w-full">
              <input
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={(e) => {
                  stageFile('signature', e.target.files?.[0] || null);
                  e.target.value = '';
                }}
                className="block w-full text-xs text-[#263746] file:mr-2.5 file:py-1 file:px-2.5 file:rounded file:border file:border-[#90CAF9] file:bg-[#F0F8FF] file:text-[#123B5D] file:font-semibold"
              />
              <div className="flex flex-wrap gap-2">
                {stagedSignature && (
                  <button
                    type="button"
                    disabled={uploadingKind === 'signature'}
                    onClick={() => handleUploadStaged('signature')}
                    className="px-3 py-1 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Upload className="w-3 h-3" />
                    {uploadingKind === 'signature' ? 'Uploading...' : 'Save Signature'}
                  </button>
                )}
                {(settings?.signatureFilePath || stagedSignature) && (
                  <button
                    type="button"
                    disabled={removingKind === 'signature'}
                    onClick={() => handleRemoveAsset('signature')}
                    className="px-2.5 py-1 border border-red-300 text-red-700 hover:bg-red-50 rounded font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>
              {settings?.signatureFilePath && (
                <div className="text-[10px] font-mono text-[#263746]/70 break-all">
                  {settings.signatureFilePath}
                </div>
              )}
            </div>
          </div>

          {/* Signature Position & Size Controls */}
          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-3.5 space-y-3">
            <div className="font-semibold text-[#123B5D]">Signature Position &amp; Size on A4 (mm)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Placement Preset</label>
                <select
                  value={signaturePosition.preset}
                  onChange={(e) => applySigPreset(e.target.value as PlacementPos['preset'])}
                  className="w-full rounded border border-[#DCEAF5] bg-white px-2 py-1 text-[#123B5D]"
                >
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="custom">Custom X/Y</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">X (mm)</label>
                <input
                  type="number"
                  min={5}
                  max={190}
                  value={signaturePosition.xMm}
                  onChange={(e) =>
                    setSignaturePosition({
                      ...signaturePosition,
                      preset: 'custom',
                      xMm: Number(e.target.value || 0),
                    })
                  }
                  className="w-full rounded border border-[#DCEAF5] bg-white px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Y from Top (mm)</label>
                <input
                  type="number"
                  min={20}
                  max={280}
                  value={signaturePosition.yMm}
                  onChange={(e) =>
                    setSignaturePosition({
                      ...signaturePosition,
                      preset: 'custom',
                      yMm: Number(e.target.value || 0),
                    })
                  }
                  className="w-full rounded border border-[#DCEAF5] bg-white px-2 py-1 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">W (mm)</label>
                  <input
                    type="number"
                    min={12}
                    max={140}
                    value={signatureSize.widthMm}
                    onChange={(e) =>
                      setSignatureSize({ ...signatureSize, widthMm: Number(e.target.value || 30) })
                    }
                    className="w-full rounded border border-[#DCEAF5] bg-white px-1.5 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">H (mm)</label>
                  <input
                    type="number"
                    min={8}
                    max={80}
                    value={signatureSize.heightMm}
                    onChange={(e) =>
                      setSignatureSize({ ...signatureSize, heightMm: Number(e.target.value || 15) })
                    }
                    className="w-full rounded border border-[#DCEAF5] bg-white px-1.5 py-1 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* D. DOCUMENT PREVIEW & E. SAVE SETTINGS */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-base font-bold text-[#123B5D]">
            D. Document Preview (Live A4 Letterhead + Stamp &amp; Signature Overlay)
          </h3>
          <p className="text-[#263746]/75">
            Verify alignment, margins, readability, and aspect ratio before issuing agreements, receipts, or invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={previewBusy !== null}
            onClick={() => handlePreviewGeneratedDocument('agreement', 'Preview: Project Agreement (A4)')}
            className="px-3.5 py-2 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
            {previewBusy === 'agreement' ? 'Rendering...' : 'Preview Project Agreement'}
          </button>
          <button
            type="button"
            disabled={previewBusy !== null}
            onClick={() => handlePreviewGeneratedDocument('receipt', 'Preview: Payment Receipt (A4)')}
            className="px-3.5 py-2 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
            {previewBusy === 'receipt' ? 'Rendering...' : 'Preview Payment Receipt'}
          </button>
          <button
            type="button"
            disabled={previewBusy !== null}
            onClick={() => handlePreviewGeneratedDocument('final_invoice', 'Preview: Final Project Invoice (A4)')}
            className="px-3.5 py-2 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
            {previewBusy === 'final_invoice' ? 'Rendering...' : 'Preview Final Invoice'}
          </button>
          <button
            type="button"
            disabled={savingAll}
            onClick={handleSaveAllSettings}
            className="px-5 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {savingAll ? 'Saving...' : 'E. Save Settings'}
          </button>
        </div>
      </div>

      {/* PDF Document Preview Modal */}
      {previewDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123B5D]/50 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-4xl h-[88vh] bg-white rounded-xl border border-[#DCEAF5] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#DCEAF5] bg-[#F0F8FF]">
              <div className="font-display font-bold text-sm text-[#123B5D] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#42A5F5]" />
                {previewDocModal.title}
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewDocModal.url);
                  setPreviewDocModal(null);
                }}
                className="p-1 rounded hover:bg-white text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe title={previewDocModal.title} src={previewDocModal.url} className="w-full flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
};
