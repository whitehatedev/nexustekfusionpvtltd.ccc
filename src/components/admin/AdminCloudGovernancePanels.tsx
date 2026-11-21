import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileSignature,
  FileText,
  History,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Stamp,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';

export const ProjectAgreementsAdminPanel: React.FC<{
  projects: any[];
  enquiries: any[];
  onRefreshOverview?: () => void;
}> = ({ projects, enquiries, onRefreshOverview }) => {
  const { apiFetch, getIdToken, notify } = usePlatform();
  const [agreements, setAgreements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetEnquiryId, setTargetEnquiryId] = useState('');
  const [title, setTitle] = useState('Engineering Project Service Agreement');
  const [versionLabel, setVersionLabel] = useState('v1.0');
  const [notes, setNotes] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<'Draft' | 'Generated' | 'Awaiting Acceptance'>('Awaiting Acceptance');
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; code: string; reason: string } | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingAssets, setSigningAssets] = useState<any[]>([]);
  const [agSettings, setAgSettings] = useState<any>({
    companyName: 'NEXUSTEKFUSION PRIVATE LIMITED',
    companyLogoUrl: '/assets/aistudio/image_1a5ac752.png',
    companyAddress: '',
    contactEmail: '',
    contactPhone: '',
    gstin: '',
    cin: '',
    signatoryName: 'Authorized Signatory',
    signatoryDesignation: 'Director / Engineering Lead',
    stampAssetId: null,
    signatureAssetId: null,
    defaultScopeTemplate: '',
    defaultTimelineText: '',
    advancePaymentTerms: '',
    secondPaymentTerms: '',
    termsAndConditions: '',
    cancellationRefundPolicy: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const loadAgreements = useCallback(async () => {
    setLoading(true);
    try {
      const [agRes, cfgRes, assetRes] = await Promise.all([
        apiFetch<{ agreements: any[] }>(
          `/api/admin/agreements?includeArchived=${includeArchived ? 'true' : 'false'}`
        ),
        apiFetch<{ settings: any }>('/api/admin/agreement-settings').catch(() => ({ settings: null })),
        apiFetch<{ assets: any[] }>('/api/admin/signing-assets').catch(() => ({ assets: [] })),
      ]);
      setAgreements(agRes.agreements || []);
      if (cfgRes?.settings) setAgSettings(cfgRes.settings);
      setSigningAssets(assetRes?.assets || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load project agreements.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, includeArchived, notify]);

  useEffect(() => {
    loadAgreements();
  }, [loadAgreements]);

  const handleSaveAgreementSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiFetch<{ settings: any }>('/api/admin/agreement-settings', {
        method: 'PUT',
        body: JSON.stringify(agSettings),
      });
      setAgSettings(res.settings);
      notify('Agreement settings, clauses, stamp & signature configuration saved.', 'success');
      onRefreshOverview?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to save agreement settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePreviewAgreement = async () => {
    setPreviewLoading(true);
    try {
      const res = await apiFetch<{ pdfBase64: string }>('/api/admin/agreements/preview', {
        method: 'POST',
        body: JSON.stringify({
          projectId: targetProjectId ? Number(targetProjectId) : undefined,
          enquiryId: targetEnquiryId ? Number(targetEnquiryId) : undefined,
          status: generateStatus,
          customOverrides: {
            companyName: agSettings.companyName,
            companyAddress: agSettings.companyAddress,
            companyEmail: agSettings.contactEmail,
            companyPhone: agSettings.contactPhone,
            companyGstin: agSettings.gstin,
            companyCin: agSettings.cin,
            signatoryName: agSettings.signatoryName,
            signatoryDesignation: agSettings.signatoryDesignation,
            advancePaymentTerms: agSettings.advancePaymentTerms,
            secondPaymentTerms: agSettings.secondPaymentTerms,
            timelineText: agSettings.defaultTimelineText,
            termsAndConditions: agSettings.termsAndConditions,
            cancellationRefundPolicy: agSettings.cancellationRefundPolicy,
          },
        }),
      });
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err: any) {
      notify(err?.message || 'Failed to preview agreement PDF.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAutoGenerateAgreement = async () => {
    if (!targetProjectId && !targetEnquiryId) {
      notify('Select an Active Project or Project Enquiry first.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const url = targetProjectId
        ? `/api/admin/projects/${targetProjectId}/agreements/generate`
        : `/api/admin/project-enquiries/${targetEnquiryId}/agreements/generate`;
      const res = await apiFetch<{ agreement: any }>(url, {
        method: 'POST',
        body: JSON.stringify({
          status: generateStatus,
          notes: notes.trim(),
          forceNew: true,
        }),
      });
      notify(
        `Generated Agreement ${res.agreement.agreementNumber} (${res.agreement.status}) and stored permanently in Supabase Storage.`,
        'success'
      );
      setNotes('');
      await loadAgreements();
      onRefreshOverview?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to generate agreement PDF.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleUploadAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      notify('Please select an agreement PDF file (.pdf).', 'error');
      return;
    }
    if (!targetProjectId && !targetEnquiryId) {
      notify('Select either an Active Project or a Registered Project Enquiry.', 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', pdfFile);
      if (targetProjectId) fd.append('projectId', targetProjectId);
      if (targetEnquiryId) fd.append('enquiryId', targetEnquiryId);
      fd.append('title', title.trim() || 'Engineering Project Service Agreement');
      fd.append('versionLabel', versionLabel.trim() || 'v1.0');
      fd.append('status', generateStatus);
      fd.append('notes', notes.trim());

      const res = await apiFetch<{ agreement: any }>('/api/admin/agreements', {
        method: 'POST',
        body: fd,
      });
      notify(`Agreement ${res.agreement.agreementNumber} stored in Supabase Storage.`, 'success');
      setPdfFile(null);
      setNotes('');
      await loadAgreements();
      onRefreshOverview?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to upload agreement PDF.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const downloadAgreementBlob = async (id: number, kind: 'original' | 'signed', filename: string) => {
    try {
      const token = await getIdToken();
      const resp = await fetch(`/api/admin/agreements/${id}/download?kind=${kind}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Download failed.' }));
        throw new Error(err.error || 'Download failed.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(err?.message || 'Unable to download agreement PDF.', 'error');
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const reason = archiveTarget.reason.trim();
    if (!reason) {
      notify('Please provide an archive reason for audit history.', 'error');
      return;
    }
    try {
      await apiFetch(`/api/admin/agreements/${archiveTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      notify(`Agreement ${archiveTarget.code} archived with full history preserved.`, 'info');
      setArchiveTarget(null);
      await loadAgreements();
    } catch (err: any) {
      notify(err?.message || 'Failed to archive agreement.', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCEAF5] pb-3">
        <div>
          <h3 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-[#42A5F5]" />
            Project Development Agreements &amp; Agreement Settings (Supabase Storage)
          </h3>
          <p className="text-[#263746]/70">
            Configure company stamp, authorized signature &amp; clauses, preview before generating final PDFs, and track digital customer acceptance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`px-3 py-1.5 border rounded-lg font-semibold inline-flex items-center gap-1.5 ${
              settingsOpen
                ? 'bg-[#123B5D] text-white border-[#123B5D]'
                : 'border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] hover:bg-[#DCEAF5]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            {settingsOpen ? 'Hide Agreement Settings' : 'Agreement Settings & Templates'}
          </button>
          <label className="inline-flex items-center gap-1.5 text-[#123B5D] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-[#90CAF9]"
            />
            Show Archived
          </label>
          <button
            type="button"
            onClick={loadAgreements}
            className="px-3 py-1.5 border border-[#DCEAF5] rounded-lg hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Admin Agreement Settings Section */}
      {settingsOpen && (
        <form
          onSubmit={handleSaveAgreementSettings}
          className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/50 p-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-[#123B5D] text-sm">
              Admin Agreement Settings (Company Profile, Stamp, Signature &amp; Clauses)
            </div>
            <button
              type="button"
              disabled={previewLoading}
              onClick={handlePreviewAgreement}
              className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
              {previewLoading ? 'Rendering...' : 'Preview Agreement Template'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Company Name</label>
              <input
                value={agSettings.companyName || ''}
                onChange={(e) => setAgSettings({ ...agSettings, companyName: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Contact Email</label>
              <input
                value={agSettings.contactEmail || ''}
                onChange={(e) => setAgSettings({ ...agSettings, contactEmail: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Contact Phone</label>
              <input
                value={agSettings.contactPhone || ''}
                onChange={(e) => setAgSettings({ ...agSettings, contactPhone: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Registered Company Address</label>
              <input
                value={agSettings.companyAddress || ''}
                onChange={(e) => setAgSettings({ ...agSettings, companyAddress: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Company Logo URL / Path</label>
              <input
                value={agSettings.companyLogoUrl || ''}
                onChange={(e) => setAgSettings({ ...agSettings, companyLogoUrl: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">GSTIN</label>
              <input
                value={agSettings.gstin || ''}
                onChange={(e) => setAgSettings({ ...agSettings, gstin: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">CIN</label>
              <input
                value={agSettings.cin || ''}
                onChange={(e) => setAgSettings({ ...agSettings, cin: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Default Timeline</label>
              <input
                value={agSettings.defaultTimelineText || ''}
                onChange={(e) => setAgSettings({ ...agSettings, defaultTimelineText: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Authorized Signatory Name</label>
              <input
                value={agSettings.signatoryName || ''}
                onChange={(e) => setAgSettings({ ...agSettings, signatoryName: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Signatory Designation</label>
              <input
                value={agSettings.signatoryDesignation || ''}
                onChange={(e) => setAgSettings({ ...agSettings, signatoryDesignation: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Company Stamp</label>
                <select
                  value={agSettings.stampAssetId || ''}
                  onChange={(e) =>
                    setAgSettings({ ...agSettings, stampAssetId: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2 py-2 text-[#123B5D]"
                >
                  <option value="">Active Stamp (Auto)</option>
                  {signingAssets
                    .filter((a: any) => a.assetType === 'stamp')
                    .map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.label} {a.isActive ? '(Active)' : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Signature Image</label>
                <select
                  value={agSettings.signatureAssetId || ''}
                  onChange={(e) =>
                    setAgSettings({ ...agSettings, signatureAssetId: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2 py-2 text-[#123B5D]"
                >
                  <option value="">Active Signature (Auto)</option>
                  {signingAssets
                    .filter((a: any) => a.assetType === 'signature')
                    .map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.label} {a.isActive ? '(Active)' : ''}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                50% Advance Payment Terms
              </label>
              <textarea
                rows={2}
                value={agSettings.advancePaymentTerms || ''}
                onChange={(e) => setAgSettings({ ...agSettings, advancePaymentTerms: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                Remaining 50% Second Milestone Payment Terms
              </label>
              <textarea
                rows={2}
                value={agSettings.secondPaymentTerms || ''}
                onChange={(e) => setAgSettings({ ...agSettings, secondPaymentTerms: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">Terms &amp; Conditions</label>
              <textarea
                rows={3}
                value={agSettings.termsAndConditions || ''}
                onChange={(e) => setAgSettings({ ...agSettings, termsAndConditions: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                Cancellation &amp; Refund Policy
              </label>
              <textarea
                rows={3}
                value={agSettings.cancellationRefundPolicy || ''}
                onChange={(e) => setAgSettings({ ...agSettings, cancellationRefundPolicy: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {savingSettings ? 'Saving Settings...' : 'Save Agreement Settings'}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleUploadAgreement} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
        <div className="font-semibold text-[#123B5D]">
          Auto-Generate Branded PDF Agreement (with Stamp &amp; Signature) or Upload Custom PDF
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={targetProjectId}
            onChange={(e) => {
              setTargetProjectId(e.target.value);
              if (e.target.value) setTargetEnquiryId('');
            }}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          >
            <option value="">Select Active Project...</option>
            {projects.map((p: any) => (
              <option key={p.id} value={String(p.id)}>
                {p.projectCode} — {p.title}
              </option>
            ))}
          </select>
          <select
            value={targetEnquiryId}
            onChange={(e) => {
              setTargetEnquiryId(e.target.value);
              if (e.target.value) setTargetProjectId('');
            }}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          >
            <option value="">...or Registered Enquiry</option>
            {enquiries.map((eq: any) => (
              <option key={eq.id} value={String(eq.id)}>
                {eq.enquiryNumber} — {eq.projectTitle}
              </option>
            ))}
          </select>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Agreement Title"
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          />
          <select
            value={generateStatus}
            onChange={(e) => setGenerateStatus(e.target.value as any)}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D] font-semibold"
          >
            <option value="Draft">Status: Draft</option>
            <option value="Generated">Status: Generated</option>
            <option value="Awaiting Acceptance">Status: Awaiting Acceptance</option>
          </select>
          <input
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder="Version (e.g. v1.0)"
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#123B5D]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes or execution instructions..."
            className="flex-1 min-w-[200px] rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          />
          <button
            type="button"
            disabled={previewLoading}
            onClick={handlePreviewAgreement}
            className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
            {previewLoading ? 'Rendering...' : 'Preview PDF'}
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={handleAutoGenerateAgreement}
            className="px-4 py-2 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded-lg font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <FileSignature className="w-3.5 h-3.5" />
            {generating ? 'Generating PDF...' : 'Auto-Generate Agreement PDF'}
          </button>
          <label className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded-lg cursor-pointer font-semibold text-[#123B5D] inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-[#42A5F5]" />
            {pdfFile ? pdfFile.name : 'Or Choose Custom PDF'}
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {pdfFile && (
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {uploading ? 'Uploading...' : 'Upload PDF'}
            </button>
          )}
        </div>
      </form>

      {archiveTarget && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-amber-950">Archive {archiveTarget.code}:</span>
          <input
            value={archiveTarget.reason}
            onChange={(e) => setArchiveTarget({ ...archiveTarget, reason: e.target.value })}
            placeholder="Mandatory archive reason (original record preserved)..."
            className="flex-1 min-w-[220px] rounded border border-amber-300 bg-white px-3 py-1.5"
          />
          <button
            type="button"
            onClick={handleArchive}
            className="px-3 py-1.5 bg-amber-700 text-white rounded font-semibold"
          >
            Confirm Archive
          </button>
          <button
            type="button"
            onClick={() => setArchiveTarget(null)}
            className="px-3 py-1.5 border border-amber-300 bg-white rounded font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[#263746]/70">Loading agreements from cloud database...</p>
      ) : agreements.length === 0 ? (
        <p className="text-[#263746]/70">No project agreements uploaded yet.</p>
      ) : (
        <div className="divide-y divide-[#DCEAF5]">
          {agreements.map((ag: any) => (
            <div key={ag.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-[#123B5D]">{ag.agreementNumber}</span>
                  <span className="font-semibold text-[#123B5D]">{ag.title}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5]">
                    {ag.versionLabel}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      ag.status === 'Accepted' || ag.status === 'Signed'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : ag.isDeleted
                        ? 'bg-slate-100 text-slate-600 border-slate-300'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {ag.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#263746]/70 font-mono">
                  {ag.projectCode || ag.enquiryNumber || 'Unlinked'} · Customer: {ag.customerId || '—'} · Issued by {ag.uploadedBy}
                  {ag.acceptedAt
                    ? ` · Accepted by ${ag.acceptedByName || ag.signedByCustomer || 'Customer'} (${ag.acceptedByEmail || ''}) at ${new Date(ag.acceptedAt).toLocaleString('en-IN')}`
                    : ag.signedByCustomer
                    ? ` · Signed by ${ag.signedByCustomer}`
                    : ''}
                  {ag.acceptanceIp ? ` · IP ${ag.acceptanceIp}` : ''}
                  {ag.archivedReason ? ` · Archive Reason: ${ag.archivedReason}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAgreementBlob(ag.id, 'original', ag.fileName || `${ag.agreementNumber}.pdf`)}
                  className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Agreement PDF
                </button>
                {ag.signedPdfPath && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadAgreementBlob(ag.id, 'signed', ag.signedFileName || `${ag.agreementNumber}-signed.pdf`)
                    }
                    className="px-2.5 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg font-semibold inline-flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Signed Copy
                  </button>
                )}
                {!ag.isDeleted && (
                  <button
                    type="button"
                    onClick={() =>
                      setArchiveTarget({ id: ag.id, code: ag.agreementNumber, reason: '' })
                    }
                    className="px-2.5 py-1.5 border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-lg font-semibold inline-flex items-center gap-1"
                  >
                    <Archive className="w-3.5 h-3.5" /> Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123B5D]/50 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-4xl h-[85vh] bg-white rounded-xl border border-[#DCEAF5] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#DCEAF5] bg-[#F0F8FF]">
              <div className="font-display font-bold text-sm text-[#123B5D] flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#42A5F5]" />
                Agreement PDF Preview (Pre-Issue Check)
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewPdfUrl);
                  setPreviewPdfUrl(null);
                }}
                className="p-1 rounded hover:bg-white text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe title="Agreement Preview" src={previewPdfUrl} className="w-full flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
};

export const CompanySigningAssetsAdminPanel: React.FC = () => {
  const { apiFetch, getIdToken, notify } = usePlatform();
  const [assets, setAssets] = useState<any[]>([]);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [assetType, setAssetType] = useState<'signature' | 'stamp' | 'logo'>('signature');
  const [label, setLabel] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [designation, setDesignation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ assets: any[] }>('/api/admin/signing-assets');
      const list = res.assets || [];
      setAssets(list);

      const token = await getIdToken();
      const previewMap: Record<number, string> = {};
      await Promise.all(
        list.map(async (asset) => {
          try {
            const resp = await fetch(`/api/admin/signing-assets/${asset.id}/preview`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              credentials: 'same-origin',
            });
            if (resp.ok) {
              const blob = await resp.blob();
              previewMap[asset.id] = URL.createObjectURL(blob);
            }
          } catch {
            // ignore missing preview
          }
        })
      );
      setPreviews((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return previewMap;
      });
    } catch (err: any) {
      notify(err?.message || 'Failed to load company signatures and stamps.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, getIdToken, notify]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      notify('Select a PNG, JPG, or WEBP image file.', 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('assetType', assetType);
      fd.append('label', label.trim() || (assetType === 'stamp' ? 'Official Company Seal' : 'Authorized Signatory'));
      fd.append('signatoryName', signatoryName.trim());
      fd.append('designation', designation.trim());
      fd.append('isActive', 'true');

      await apiFetch('/api/admin/signing-assets', { method: 'POST', body: fd });
      notify('Signature/Stamp uploaded to private Supabase Storage and activated.', 'success');
      setLabel('');
      setSignatoryName('');
      setDesignation('');
      setFile(null);
      await loadAssets();
    } catch (err: any) {
      notify(err?.message || 'Failed to upload signing asset.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (asset: any) => {
    try {
      await apiFetch(`/api/admin/signing-assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !asset.isActive }),
      });
      notify(`${asset.label} updated.`, 'success');
      await loadAssets();
    } catch (err: any) {
      notify(err?.message || 'Failed to update signing asset.', 'error');
    }
  };

  const archiveAsset = async (asset: any) => {
    try {
      await apiFetch(`/api/admin/signing-assets/${asset.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Archived by Admin' }),
      });
      notify(`${asset.label} archived.`, 'info');
      await loadAssets();
    } catch (err: any) {
      notify(err?.message || 'Failed to archive signing asset.', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-3">
        <div>
          <h3 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
            <Stamp className="w-5 h-5 text-[#42A5F5]" />
            Company Signatures &amp; Stamps (Embedded in Cloud PDF Invoices)
          </h3>
          <p className="text-[#263746]/70">
            Stored in private Supabase Storage bucket <span className="font-mono">company-assets</span> and automatically embedded in generated Agreements, Invoices &amp; Quotations.
          </p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={assetType}
            onChange={(e) =>
              setAssetType(e.target.value === 'stamp' ? 'stamp' : e.target.value === 'logo' ? 'logo' : 'signature')
            }
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D] font-semibold"
          >
            <option value="signature">Authorized Signature</option>
            <option value="stamp">Official Company Stamp / Seal</option>
            <option value="logo">Company Logo</option>
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Asset Label (e.g. Director Sign)"
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          />
          <input
            value={signatoryName}
            onChange={(e) => setSignatoryName(e.target.value)}
            placeholder="Signatory Name"
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          />
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Designation (e.g. Managing Director)"
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded-lg cursor-pointer font-semibold text-[#123B5D] inline-flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-[#42A5F5]" />
            {file ? file.name : 'Choose Signature/Stamp Image (.png/.jpg/.webp)'}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : 'Upload & Set Active'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-[#263746]/70">Loading signatures and stamps...</p>
      ) : assets.length === 0 ? (
        <p className="text-[#263746]/70">No active company signature or stamp uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset: any) => (
            <div key={asset.id} className="rounded-lg border border-[#DCEAF5] bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#90CAF9] text-[#123B5D] font-mono text-[10px] uppercase font-bold">
                  {asset.assetType}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    asset.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {asset.isActive ? 'Active on PDFs' : 'Inactive'}
                </span>
              </div>
              <div className="h-24 rounded-lg border border-dashed border-[#DCEAF5] bg-[#F0F8FF]/40 flex items-center justify-center p-2 overflow-hidden">
                {previews[asset.id] ? (
                  <img
                    src={previews[asset.id]}
                    alt={asset.label}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-[#263746]/60">{asset.fileName}</span>
                )}
              </div>
              <div>
                <div className="font-semibold text-[#123B5D]">{asset.label}</div>
                <div className="text-[11px] text-[#263746]/70">
                  {[asset.signatoryName, asset.designation].filter(Boolean).join(' · ') || asset.fileName}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => toggleActive(asset)}
                  className="flex-1 px-2.5 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded font-semibold"
                >
                  {asset.isActive ? 'Deactivate' : 'Set Active'}
                </button>
                <button
                  type="button"
                  onClick={() => archiveAsset(asset)}
                  className="px-2.5 py-1.5 border border-amber-300 text-amber-800 hover:bg-amber-50 rounded font-semibold"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const RazorpayPaymentLinksAdminPanel: React.FC<{
  quotations: any[];
  storeOrders: any[];
  printingOrders: any[];
  installments?: any[];
  onRefreshOverview?: () => void;
}> = ({ quotations, storeOrders, printingOrders, installments = [], onRefreshOverview }) => {
  const { apiFetch, notify } = usePlatform();
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState<'project_installment' | 'project_quotation' | 'store_order' | 'printing_order'>('project_installment');
  const [entityId, setEntityId] = useState('');
  const [amountInr, setAmountInr] = useState('');
  const [paymentStage, setPaymentStage] = useState('advance');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ paymentLinks: any[] }>('/api/admin/payment-links');
      setLinks(res.paymentLinks || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load Razorpay payment links.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleSelectEntity = (val: string) => {
    setEntityId(val);
    const numId = Number(val);
    if (!numId) return;
    if (entityType === 'project_installment') {
      const inst = installments.find((x: any) => x.id === numId);
      if (inst) {
        const rem = Math.max(1, Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0));
        setAmountInr(String(rem));
        setPaymentStage(inst.installmentNumber === 1 ? 'advance' : 'final');
        setDescription(`${inst.title} (${inst.percentage}%)`);
      }
    } else if (entityType === 'project_quotation') {
      const q = quotations.find((x: any) => x.id === numId);
      if (q) {
        const rem = Math.max(0, Number(q.totalAmountInr || 0) - Number(q.paidAmountInr || 0));
        setAmountInr(String(Number(q.paidAmountInr || 0) === 0 ? q.advanceAmountInr || rem : rem));
        setPaymentStage(Number(q.paidAmountInr || 0) === 0 ? 'advance' : 'final');
        setDescription(`Project Quotation ${q.quotationNumber || `#${q.id}`}`);
      }
    } else if (entityType === 'store_order') {
      const o = storeOrders.find((x: any) => x.id === numId);
      if (o) {
        setAmountInr(String(o.totalInr || 0));
        setPaymentStage('full');
        setDescription(`Store Order ${o.orderNumber}`);
      }
    } else if (entityType === 'printing_order') {
      const po = printingOrders.find((x: any) => x.id === numId);
      if (po) {
        setAmountInr(String(po.totalInr || po.quotedPriceInr || 0));
        setPaymentStage('full');
        setDescription(`3D Printing Order ${po.orderNumber}`);
      }
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId || Number(amountInr) < 1) {
      notify('Select a record and valid INR amount.', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch<{ paymentLink: any }>('/api/admin/payment-links', {
        method: 'POST',
        body: JSON.stringify({
          entityType,
          entityId: Number(entityId),
          amountInr: Number(amountInr),
          paymentStage,
          description: description.trim(),
        }),
      });
      notify(`Payment link ${res.paymentLink.paymentLinkId} created and sent to customer.`, 'success');
      setEntityId('');
      setAmountInr('');
      setDescription('');
      await loadLinks();
      onRefreshOverview?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to generate Razorpay payment link.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRefreshStatus = async (id: number) => {
    try {
      const res = await apiFetch<{ paymentLink: any }>(`/api/admin/payment-links/${id}/refresh`, {
        method: 'POST',
      });
      notify(`Payment link status: ${res.paymentLink.status}`, 'info');
      await loadLinks();
      onRefreshOverview?.();
    } catch (err: any) {
      notify(err?.message || 'Unable to sync status from Razorpay.', 'error');
    }
  };

  const handleCancelLink = async (id: number) => {
    try {
      await apiFetch(`/api/admin/payment-links/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled by Admin' }),
      });
      notify('Payment link cancelled.', 'info');
      await loadLinks();
    } catch (err: any) {
      notify(err?.message || 'Unable to cancel payment link.', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-3">
        <div>
          <h3 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#42A5F5]" />
            Razorpay Payment Links (Webhook-Verified Cloud Ledger)
          </h3>
          <p className="text-[#263746]/70">
            Generate secure payment links on backend, dispatch to customer account/email, and reconcile via Razorpay webhook HMAC verification.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLinks}
          className="px-3 py-1.5 border border-[#DCEAF5] rounded-lg hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <form onSubmit={handleCreateLink} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
        <div className="font-semibold text-[#123B5D]">Generate New Razorpay Payment Link</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as any);
              setEntityId('');
            }}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D] font-semibold"
          >
            <option value="project_installment">Project Installment (50%)</option>
            <option value="project_quotation">Project Quotation</option>
            <option value="store_order">Store Order</option>
            <option value="printing_order">3D Printing Order</option>
          </select>

          <select
            value={entityId}
            onChange={(e) => handleSelectEntity(e.target.value)}
            className="md:col-span-2 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          >
            <option value="">Select Record...</option>
            {entityType === 'project_installment' &&
              installments.map((inst: any) => (
                <option key={inst.id} value={String(inst.id)}>
                  Project #{inst.projectId} · {inst.title} · ₹{Number(inst.amountInr || 0).toLocaleString('en-IN')} ({inst.status})
                </option>
              ))}
            {entityType === 'project_quotation' &&
              quotations.map((q: any) => (
                <option key={q.id} value={String(q.id)}>
                  {q.quotationNumber || `QT-${q.id}`} · Total ₹{Number(q.totalAmountInr || 0).toLocaleString('en-IN')} ({q.paymentStatus})
                </option>
              ))}
            {entityType === 'store_order' &&
              storeOrders.map((o: any) => (
                <option key={o.id} value={String(o.id)}>
                  {o.orderNumber} · ₹{Number(o.totalInr || 0).toLocaleString('en-IN')} ({o.paymentStatus})
                </option>
              ))}
            {entityType === 'printing_order' &&
              printingOrders.map((po: any) => (
                <option key={po.id} value={String(po.id)}>
                  {po.orderNumber} · ₹{Number(po.totalInr || po.quotedPriceInr || 0).toLocaleString('en-IN')} ({po.paymentStatus})
                </option>
              ))}
          </select>

          <input
            type="number"
            min={1}
            required
            placeholder="Amount (INR)"
            value={amountInr}
            onChange={(e) => setAmountInr(e.target.value)}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#123B5D]"
          />

          <select
            value={paymentStage}
            onChange={(e) => setPaymentStage(e.target.value)}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          >
            <option value="advance">Advance</option>
            <option value="final">Final Balance</option>
            <option value="full">Full 100%</option>
            <option value="milestone">Milestone</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Payment description shown to customer..."
            className="flex-1 min-w-[240px] rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#123B5D]"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Generating...' : 'Generate Payment Link'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-[#263746]/70">Loading payment links...</p>
      ) : links.length === 0 ? (
        <p className="text-[#263746]/70">No Razorpay payment links generated yet.</p>
      ) : (
        <div className="divide-y divide-[#DCEAF5] max-h-96 overflow-y-auto">
          {links.map((lk: any) => (
            <div key={lk.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-[#123B5D]">{lk.paymentLinkId}</span>
                  <span className="font-mono font-bold text-[#42A5F5]">
                    ₹{Number(lk.amountInr || 0).toLocaleString('en-IN')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                      lk.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : lk.status === 'cancelled'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {lk.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#263746]/75">
                  {lk.description} · Customer: {lk.customerId || lk.customerEmail} · Ref: {lk.referenceId}
                  {lk.razorpayPaymentId ? ` · Txn: ${lk.razorpayPaymentId}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {lk.shortUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(lk.shortUrl);
                        notify('Payment link URL copied.', 'info');
                      }}
                      className="px-2.5 py-1 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy Link
                    </button>
                    <a
                      href={lk.shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3 text-[#42A5F5]" /> Open
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleRefreshStatus(lk.id)}
                  className="px-2.5 py-1 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Sync
                </button>
                {lk.status !== 'paid' && lk.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleCancelLink(lk.id)}
                    className="px-2.5 py-1 border border-red-200 text-red-700 hover:bg-red-50 rounded font-semibold inline-flex items-center gap-1"
                  >
                    <XCircle className="w-3 h-3" /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const RecordHistoryAndActivityAdminPanel: React.FC = () => {
  const { apiFetch, notify } = usePlatform();
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [customerLogs, setCustomerLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedSnapId, setExpandedSnapId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (entityFilter !== 'all') qs.set('entityType', entityFilter);
      if (search.trim()) qs.set('search', search.trim());

      const [histRes, actRes] = await Promise.all([
        apiFetch<{ history: any[] }>(`/api/admin/record-history?${qs.toString()}`),
        apiFetch<{ customerLogs: any[] }>(
          `/api/admin/activity-logs${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`
        ),
      ]);
      setHistoryRows(histRes.history || []);
      setCustomerLogs(actRes.customerLogs || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load cloud governance history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, entityFilter, notify, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCEAF5] pb-3">
          <div>
            <h3 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#42A5F5]" />
              Non-Destructive Record Archive, Rejection &amp; Status History
            </h3>
            <p className="text-[#263746]/70">
              Original records are preserved whenever an enquiry, order, agreement, or invoice is rejected or archived.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-1.5 text-[#123B5D] font-semibold"
            >
              <option value="all">All Record Types</option>
              <option value="project_enquiry">Project Enquiries</option>
              <option value="project">Projects</option>
              <option value="printing_order">3D Printing Orders</option>
              <option value="store_order">Store Orders</option>
              <option value="project_agreement">Agreements</option>
              <option value="invoice">Invoices</option>
              <option value="razorpay_payment_link">Payment Links</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, Customer ID, admin, reason..."
              className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-1.5 text-[#123B5D] w-60"
            />
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 border border-[#DCEAF5] rounded-lg hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-[#263746]/70">Loading status &amp; archive history...</p>
        ) : historyRows.length === 0 ? (
          <p className="text-[#263746]/70">No status changes or archived records match the active filter.</p>
        ) : (
          <div className="divide-y divide-[#DCEAF5] max-h-96 overflow-y-auto">
            {historyRows.map((row: any) => (
              <div key={row.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#90CAF9] font-mono text-[10px] font-bold text-[#123B5D]">
                      {row.entityType}
                    </span>
                    <span className="font-mono font-bold text-[#123B5D]">
                      {row.entityCode || `#${row.entityId}`}
                    </span>
                    <span className="text-[#263746]">
                      {row.previousStatus} → <strong>{row.newStatus}</strong>
                    </span>
                    <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[10px] font-semibold uppercase">
                      {row.actionType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-[#263746]/70">
                    <span>{row.adminEmail || row.adminId}</span>
                    <span>· {new Date(row.actionDate).toLocaleString('en-IN')}</span>
                    <button
                      type="button"
                      onClick={() => setExpandedSnapId(expandedSnapId === row.id ? null : row.id)}
                      className="px-2 py-0.5 border border-[#DCEAF5] rounded text-[#123B5D] hover:bg-[#F0F8FF]"
                    >
                      {expandedSnapId === row.id ? 'Hide Snapshot' : 'Original Record'}
                    </button>
                  </div>
                </div>
                {row.reason && (
                  <div className="text-[#263746]">
                    <strong className="text-[#123B5D]">Reason:</strong> {row.reason}
                    {row.customerId ? ` · Customer ${row.customerId}` : ''}
                  </div>
                )}
                {expandedSnapId === row.id && (
                  <pre className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-3 text-[11px] font-mono overflow-x-auto max-h-56 text-[#123B5D]">
                    {JSON.stringify(row.originalRecord || {}, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
        <h3 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
          <History className="w-5 h-5 text-[#42A5F5]" />
          Customer Activity Cloud Log ({customerLogs.length})
        </h3>
        {customerLogs.length === 0 ? (
          <p className="text-[#263746]/70">No customer activity logs recorded yet.</p>
        ) : (
          <div className="divide-y divide-[#DCEAF5] max-h-72 overflow-y-auto font-mono">
            {customerLogs.map((l: any) => (
              <div key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[#263746]">
                <span>
                  <strong className="text-[#123B5D]">{l.customerId || l.email}</strong> · {l.action} · {l.description}
                </span>
                <span className="text-[11px] text-[#263746]/60">
                  {new Date(l.createdAt).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
