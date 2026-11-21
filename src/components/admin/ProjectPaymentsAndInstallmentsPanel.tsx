import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileSignature,
  Link2,
  Paperclip,
  Plus,
  Receipt,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';

interface ProjectPaymentsAndInstallmentsPanelProps {
  project: any;
  enquiry?: any;
  paymentSummary?: any;
  installments: any[];
  transactions: any[];
  reminders: any[];
  attachments: any[];
  agreements: any[];
  onRefresh: () => void;
  onDownloadFile?: (storagePath: string, fileName: string, bucket?: string) => void;
}

function getPaymentStatusBadge(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'accepted' || s === 'signed') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (s === 'partially paid' || s === 'partially_paid' || s === 'awaiting acceptance' || s === 'generated') {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (s === 'failed') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-[#F0F8FF] text-[#123B5D] border-[#90CAF9]';
}

export const ProjectPaymentsAndInstallmentsPanel: React.FC<ProjectPaymentsAndInstallmentsPanelProps> = ({
  project,
  enquiry,
  paymentSummary,
  installments,
  transactions,
  reminders,
  attachments,
  agreements,
  onRefresh,
  onDownloadFile,
}) => {
  const { apiFetch, getIdToken, notify } = usePlatform();

  const existingTotal = Number(
    paymentSummary?.totalAmountInr || project.totalAmountInr || project.budgetInr || 0
  );
  const existingPaid = Number(paymentSummary?.paidAmountInr ?? project.paidAmountInr ?? 0);
  const existingPending = Number(
    paymentSummary?.pendingAmountInr ?? Math.max(0, existingTotal - existingPaid)
  );
  const paymentStatus = String(
    paymentSummary?.status || project.paymentClearanceStatus || 'Pending'
  );

  const [costFormOpen, setCostFormOpen] = useState(installments.length === 0);
  const [totalCostInput, setTotalCostInput] = useState(existingTotal > 0 ? String(existingTotal) : '');
  const [advanceDueDate, setAdvanceDueDate] = useState('');
  const [finalDueDate, setFinalDueDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [sendEmailOnSetup, setSendEmailOnSetup] = useState(true);
  const [savingCost, setSavingCost] = useState(false);

  const [busyInstLink, setBusyInstLink] = useState<number | null>(null);
  const [busyInstRemind, setBusyInstRemind] = useState<number | null>(null);
  const [manualOpenFor, setManualOpenFor] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState({
    amountInr: '',
    paymentMethod: 'bank_transfer',
    transactionRef: '',
    notes: '',
    isFailure: false,
    failureReason: '',
  });
  const [savingManual, setSavingManual] = useState(false);

  const [showTransactions, setShowTransactions] = useState(transactions.length > 0);
  const [showReminders, setShowReminders] = useState(false);
  const [uploadingAtt, setUploadingAtt] = useState(false);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generatingAgreement, setGeneratingAgreement] = useState(false);

  const firstInst = installments.find((i: any) => i.installmentNumber === 1);
  const secondInst = installments.find((i: any) => i.installmentNumber === 2);

  const handleConfigurePaymentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalAmountInr = Math.round(Number(totalCostInput || 0));
    if (!Number.isFinite(totalAmountInr) || totalAmountInr < 1) {
      notify('Enter a valid Total Project Cost (>= ₹1).', 'error');
      return;
    }
    setSavingCost(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/payment-request`, {
        method: 'POST',
        body: JSON.stringify({
          totalAmountInr,
          advanceDueDate,
          finalDueDate,
          notes: paymentNotes,
          sendNotificationEmail: sendEmailOnSetup,
        }),
      });
      notify(
        `Payment request configured for ${project.projectCode}: ₹${totalAmountInr.toLocaleString('en-IN')} split into two 50% installments.`,
        'success'
      );
      setCostFormOpen(false);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to save payment request.', 'error');
    } finally {
      setSavingCost(false);
    }
  };

  const handleGeneratePaymentLink = async (installmentNumber: 1 | 2) => {
    setBusyInstLink(installmentNumber);
    try {
      const res = await apiFetch<{ installment: any; paymentLink: any }>(
        `/api/admin/projects/${project.id}/installments/${installmentNumber}/payment-link`,
        {
          method: 'POST',
          body: JSON.stringify({ sendEmail: true }),
        }
      );
      notify(
        `Installment #${installmentNumber} payment link generated and emailed to customer.`,
        'success'
      );
      if (res.paymentLink?.shortUrl && navigator.clipboard) {
        navigator.clipboard.writeText(res.paymentLink.shortUrl).catch(() => {});
      }
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to generate payment link.', 'error');
    } finally {
      setBusyInstLink(null);
    }
  };

  const handleSendReminder = async (installmentNumber: 1 | 2) => {
    setBusyInstRemind(installmentNumber);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/installments/${installmentNumber}/remind`, {
        method: 'POST',
      });
      notify(`Payment reminder emailed for Installment #${installmentNumber}.`, 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to send payment reminder.', 'error');
    } finally {
      setBusyInstRemind(null);
    }
  };

  const handleManualPaymentSubmit = async (e: React.FormEvent, installmentNumber: 1 | 2) => {
    e.preventDefault();
    const amountNum = Math.round(Number(manualForm.amountInr || 0));
    if (!manualForm.isFailure && (!Number.isFinite(amountNum) || amountNum < 1)) {
      notify('Enter a valid paid amount in INR.', 'error');
      return;
    }
    setSavingManual(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/installments/${installmentNumber}/manual-payment`, {
        method: 'POST',
        body: JSON.stringify({
          amountInr: amountNum,
          paymentMethod: manualForm.paymentMethod,
          transactionRef: manualForm.transactionRef,
          notes: manualForm.notes,
          isFailure: manualForm.isFailure,
          failureReason: manualForm.failureReason,
        }),
      });
      notify(
        manualForm.isFailure
          ? `Recorded failed payment attempt on Installment #${installmentNumber}.`
          : `Manual payment ₹${amountNum.toLocaleString('en-IN')} recorded on Installment #${installmentNumber}.`,
        manualForm.isFailure ? 'info' : 'success'
      );
      setManualOpenFor(null);
      setManualForm({
        amountInr: '',
        paymentMethod: 'bank_transfer',
        transactionRef: '',
        notes: '',
        isFailure: false,
        failureReason: '',
      });
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to record payment.', 'error');
    } finally {
      setSavingManual(false);
    }
  };

  const handleUploadAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingAtt(true);
    try {
      const fd = new FormData();
      fd.append('category', 'project_document');
      Array.from(files).forEach((f) => fd.append('files', f));
      await apiFetch(`/api/admin/projects/${project.id}/attachments`, {
        method: 'POST',
        body: fd,
      });
      notify(`${files.length} optional attachment(s) uploaded to Supabase Storage.`, 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to upload project attachment.', 'error');
    } finally {
      setUploadingAtt(false);
    }
  };

  const handleDeleteAttachment = async (attId: number) => {
    try {
      await apiFetch(`/api/admin/projects/${project.id}/attachments/${attId}`, {
        method: 'DELETE',
      });
      notify('Attachment removed.', 'info');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to remove attachment.', 'error');
    }
  };

  const handlePreviewAgreement = async () => {
    setPreviewLoading(true);
    try {
      const res = await apiFetch<{ pdfBase64: string }>('/api/admin/agreements/preview', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          enquiryId: project.enquiryId,
          status: 'Draft',
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
      notify(err?.message || 'Unable to render agreement preview PDF.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerateAgreement = async () => {
    setGeneratingAgreement(true);
    try {
      const res = await apiFetch<{ agreement: any }>(`/api/admin/projects/${project.id}/agreements/generate`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'Awaiting Acceptance',
          notes: `Generated from Admin Project Console for ${project.projectCode}.`,
          forceNew: true,
        }),
      });
      notify(
        `Agreement ${res.agreement.agreementNumber} generated with company stamp & signature and sent for customer acceptance.`,
        'success'
      );
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to generate project agreement.', 'error');
    } finally {
      setGeneratingAgreement(false);
    }
  };

  const downloadAgreementBlob = async (agId: number, filename: string) => {
    try {
      const token = await getIdToken();
      const resp = await fetch(`/api/admin/agreements/${agId}/download?kind=original`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'same-origin',
      });
      if (!resp.ok) throw new Error('Download failed.');
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

  const renderInstallmentCard = (instNum: 1 | 2, inst: any) => {
    const label =
      instNum === 1 ? 'First Installment — 50% Advance' : 'Second Installment — 50% Milestone';
    const triggerNote =
      instNum === 1
        ? 'Required before project commencement (Status stays Awaiting Advance Payment until paid)'
        : 'Collected at agreed second payment milestone / prior to final handover';

    const amt = Number(inst?.amountInr || 0);
    const paid = Number(inst?.paidAmountInr || 0);
    const remaining = Math.max(0, amt - paid);
    const st = inst?.status || 'Pending';
    const isPaid = st === 'Paid' || (amt > 0 && remaining === 0);

    return (
      <div
        key={instNum}
        className={`rounded-xl border p-4 space-y-3 ${
          isPaid
            ? 'border-emerald-200 bg-emerald-50/40'
            : instNum === 1
            ? 'border-[#90CAF9] bg-[#F0F8FF]'
            : 'border-[#DCEAF5] bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-[#123B5D] text-xs">{inst?.title || label}</div>
            <div className="text-[11px] text-[#263746]/75 mt-0.5">{triggerNote}</div>
          </div>
          <span
            className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase shrink-0 ${getPaymentStatusBadge(
              st
            )}`}
          >
            {st}
          </span>
        </div>

        {!inst ? (
          <div className="text-[11px] text-[#263746]/70 italic">
            Configure total project cost above to initialize this 50% installment.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#DCEAF5] bg-white p-2.5 text-[11px] font-mono tabular-nums">
              <div>
                <div className="text-[#263746]/65 text-[10px]">Installment (50%)</div>
                <div className="font-bold text-[#123B5D]">₹{amt.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-[#263746]/65 text-[10px]">Paid</div>
                <div className="font-bold text-emerald-700">₹{paid.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-[#263746]/65 text-[10px]">Pending</div>
                <div className="font-bold text-amber-800">₹{remaining.toLocaleString('en-IN')}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#263746]/75 font-mono">
              <span>Due: {inst.dueDate || (instNum === 1 ? 'Before Commencement' : 'Second Milestone')}</span>
              <span>
                Reminders: {Number(inst.reminderCount || 0)}
                {inst.lastReminderAt
                  ? ` · Last ${new Date(inst.lastReminderAt).toLocaleDateString('en-IN')}`
                  : ''}
              </span>
            </div>

            {inst.paymentLinkUrl && (
              <div className="rounded-lg border border-[#90CAF9] bg-white px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <a
                  href={inst.paymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#1E88E5] hover:underline truncate max-w-[240px] inline-flex items-center gap-1"
                >
                  <Link2 className="w-3 h-3 shrink-0" />
                  {inst.paymentLinkUrl}
                </a>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(inst.paymentLinkUrl);
                      notify('Payment link copied to clipboard.', 'info');
                    }}
                    className="px-2 py-0.5 rounded border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  <a
                    href={inst.paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 rounded border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Open
                  </a>
                </div>
              </div>
            )}

            {!isPaid && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyInstLink === instNum}
                  onClick={() => handleGeneratePaymentLink(instNum)}
                  className="px-2.5 py-1.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {busyInstLink === instNum
                    ? 'Generating...'
                    : inst.paymentLinkUrl
                    ? 'Regenerate & Email Link'
                    : 'Generate Razorpay Link & Email'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (manualOpenFor === instNum) {
                      setManualOpenFor(null);
                    } else {
                      setManualOpenFor(instNum);
                      setManualForm({
                        amountInr: String(remaining || amt),
                        paymentMethod: 'bank_transfer',
                        transactionRef: '',
                        notes: '',
                        isFailure: false,
                        failureReason: '',
                      });
                    }
                  }}
                  className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Manual Payment
                </button>
                <button
                  type="button"
                  disabled={busyInstRemind === instNum}
                  onClick={() => handleSendReminder(instNum)}
                  className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {busyInstRemind === instNum ? 'Sending...' : 'Send Reminder'}
                </button>
              </div>
            )}

            {manualOpenFor === instNum && (
              <form
                onSubmit={(e) => handleManualPaymentSubmit(e, instNum)}
                className="rounded-lg border border-[#90CAF9] bg-white p-3 space-y-2 text-[11px]"
              >
                <div className="flex items-center justify-between font-semibold text-[#123B5D]">
                  <span>Record Payment Detail (Installment #{instNum})</span>
                  <label className="inline-flex items-center gap-1 text-red-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualForm.isFailure}
                      onChange={(e) => setManualForm({ ...manualForm, isFailure: e.target.checked })}
                    />
                    Log Failed Attempt
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="Amount INR"
                    value={manualForm.amountInr}
                    onChange={(e) => setManualForm({ ...manualForm, amountInr: e.target.value })}
                    className="rounded border border-[#DCEAF5] px-2 py-1.5 font-mono"
                  />
                  <select
                    value={manualForm.paymentMethod}
                    onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value })}
                    className="rounded border border-[#DCEAF5] px-2 py-1.5 bg-white"
                  >
                    <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="upi">UPI</option>
                    <option value="razorpay_payment_link">Razorpay Payment Link</option>
                    <option value="cash">Cash</option>
                    <option value="manual">Manual Adjustment</option>
                  </select>
                  <input
                    placeholder="Transaction / UTR Ref"
                    value={manualForm.transactionRef}
                    onChange={(e) => setManualForm({ ...manualForm, transactionRef: e.target.value })}
                    className="rounded border border-[#DCEAF5] px-2 py-1.5 font-mono"
                  />
                </div>
                {manualForm.isFailure ? (
                  <input
                    placeholder="Failure Reason (e.g. Bank timeout / Declined)"
                    value={manualForm.failureReason}
                    onChange={(e) => setManualForm({ ...manualForm, failureReason: e.target.value })}
                    className="w-full rounded border border-red-300 px-2 py-1.5"
                  />
                ) : (
                  <input
                    placeholder="Payment notes / remarks"
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                    className="w-full rounded border border-[#DCEAF5] px-2 py-1.5"
                  />
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setManualOpenFor(null)}
                    className="px-2.5 py-1 border border-[#DCEAF5] rounded text-[#263746]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingManual}
                    className="px-3 py-1 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded font-semibold disabled:opacity-60"
                  >
                    {savingManual ? 'Saving...' : 'Save Record'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/40 p-4 space-y-4 text-xs">
      {/* Header & Financial Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCEAF5] pb-3">
        <div>
          <div className="font-semibold text-[#123B5D] text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#42A5F5]" />
            Project Payment Management (Two 50% Installments) &amp; Agreement
          </div>
          <div className="text-[11px] text-[#263746]/75 font-mono mt-0.5">
            Project Status: <strong className="text-[#123B5D]">{project.status}</strong> · Payment:{' '}
            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getPaymentStatusBadge(paymentStatus)}`}>
              {paymentStatus}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
          <div className="px-2.5 py-1 rounded bg-white border border-[#DCEAF5]">
            Total: <strong className="text-[#123B5D]">₹{existingTotal.toLocaleString('en-IN')}</strong>
          </div>
          <div className="px-2.5 py-1 rounded bg-white border border-emerald-200 text-emerald-800">
            Paid: <strong>₹{existingPaid.toLocaleString('en-IN')}</strong>
          </div>
          <div className="px-2.5 py-1 rounded bg-white border border-amber-200 text-amber-800">
            Pending: <strong>₹{existingPending.toLocaleString('en-IN')}</strong>
          </div>
          <button
            type="button"
            onClick={() => setCostFormOpen(!costFormOpen)}
            className="px-2.5 py-1 rounded bg-white border border-[#90CAF9] hover:bg-[#F0F8FF] text-[#123B5D] font-sans font-semibold"
          >
            {costFormOpen ? 'Close Cost Editor' : installments.length === 0 ? 'Add Payment Request' : 'Edit Total Cost'}
          </button>
        </div>
      </div>

      {/* Awaiting Advance Warning */}
      {(project.status === 'Awaiting Advance Payment' || (firstInst && firstInst.status !== 'Paid')) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex items-center gap-2 text-amber-950 text-[11px]">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Awaiting Advance Payment:</strong> Project remains in Awaiting Advance Payment until the First Installment (50% Advance) is confirmed.
          </span>
        </div>
      )}

      {/* Set Total Project Cost & Generate Two 50% Installments */}
      {costFormOpen && (
        <form
          onSubmit={handleConfigurePaymentRequest}
          className="rounded-lg border border-[#90CAF9] bg-white p-3.5 space-y-3"
        >
          <div className="font-semibold text-[#123B5D]">
            Configure Project Payment Request (Automatically splits into 50% Advance + 50% Second Milestone)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                Total Project Cost (₹ INR) *
              </label>
              <input
                type="number"
                min={1}
                required
                placeholder="e.g. 25000"
                value={totalCostInput}
                onChange={(e) => setTotalCostInput(e.target.value)}
                className="w-full rounded border border-[#DCEAF5] px-2.5 py-1.5 font-mono text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                1st Installment Due Date
              </label>
              <input
                type="date"
                value={advanceDueDate}
                onChange={(e) => setAdvanceDueDate(e.target.value)}
                className="w-full rounded border border-[#DCEAF5] px-2.5 py-1.5 font-mono text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                2nd Installment Due Date
              </label>
              <input
                type="date"
                value={finalDueDate}
                onChange={(e) => setFinalDueDate(e.target.value)}
                className="w-full rounded border border-[#DCEAF5] px-2.5 py-1.5 font-mono text-[#123B5D]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#123B5D]/80 mb-1">
                Payment Notes
              </label>
              <input
                placeholder="Milestone remarks..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full rounded border border-[#DCEAF5] px-2.5 py-1.5 text-[#123B5D]"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#263746] cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmailOnSetup}
                onChange={(e) => setSendEmailOnSetup(e.target.checked)}
              />
              Email payment schedule &amp; 50% advance notification to {enquiry?.customerEmail || 'customer'}
            </label>
            <button
              type="submit"
              disabled={savingCost}
              className="px-4 py-1.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {savingCost ? 'Configuring...' : 'Save Payment Request (Split 50% / 50%)'}
            </button>
          </div>
        </form>
      )}

      {/* Two Separate 50% Installment Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {renderInstallmentCard(1, firstInst)}
        {renderInstallmentCard(2, secondInst)}
      </div>

      {/* Automatic Agreement Generation & Preview Quick Bar */}
      <div className="rounded-lg border border-[#DCEAF5] bg-white p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-[#123B5D] flex items-center gap-1.5">
            <FileSignature className="w-4 h-4 text-[#42A5F5]" />
            Project Development Agreement ({agreements.length})
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={previewLoading}
              onClick={handlePreviewAgreement}
              className="px-2.5 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
              {previewLoading ? 'Rendering Preview...' : 'Preview Agreement PDF'}
            </button>
            <button
              type="button"
              disabled={generatingAgreement}
              onClick={handleGenerateAgreement}
              className="px-3 py-1.5 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1 disabled:opacity-60"
            >
              <FileSignature className="w-3.5 h-3.5" />
              {generatingAgreement ? 'Generating PDF...' : 'Generate & Issue Agreement PDF'}
            </button>
          </div>
        </div>

        {agreements.length > 0 && (
          <div className="divide-y divide-[#DCEAF5]">
            {agreements.map((ag: any) => (
              <div key={ag.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#123B5D]">{ag.agreementNumber}</span>
                    <span className="text-[#263746]">{ag.title}</span>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${getPaymentStatusBadge(ag.status)}`}>
                      {ag.status}
                    </span>
                  </div>
                  {ag.acceptedAt ? (
                    <div className="text-[11px] text-emerald-800 font-mono">
                      Accepted by {ag.acceptedByName || ag.signedByCustomer} ({ag.acceptedByEmail}) on{' '}
                      {new Date(ag.acceptedAt).toLocaleString('en-IN')}
                      {ag.acceptanceIp ? ` · IP ${ag.acceptanceIp}` : ''}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#263746]/70">
                      Customer acceptance pending (Company stamp/signature embedded; not marked accepted until customer signs).
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => downloadAgreementBlob(ag.id, ag.fileName || `${ag.agreementNumber}.pdf`)}
                  className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3 text-[#42A5F5]" /> Download PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction History & Payment Reminders Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTransactions(!showTransactions)}
            className="px-2.5 py-1 rounded border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold"
          >
            {showTransactions ? 'Hide' : 'View'} Payment Transactions ({transactions.length})
          </button>
          <button
            type="button"
            onClick={() => setShowReminders(!showReminders)}
            className="px-2.5 py-1 rounded border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold"
          >
            {showReminders ? 'Hide' : 'View'} Payment Reminders ({reminders.length})
          </button>
        </div>

        <label className="px-2.5 py-1 rounded border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold cursor-pointer inline-flex items-center gap-1">
          <Paperclip className="w-3 h-3 text-[#42A5F5]" />
          {uploadingAtt ? 'Uploading...' : 'Add Optional Attachment'}
          <input
            type="file"
            multiple
            disabled={uploadingAtt}
            onChange={(e) => {
              handleUploadAttachments(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </label>
      </div>

      {/* Optional Project Attachments (Rendered ONLY when attachments exist) */}
      {attachments.length > 0 && (
        <div className="rounded-lg border border-[#DCEAF5] bg-white p-3 space-y-2">
          <div className="font-semibold text-[#123B5D]">
            Project Attachments ({attachments.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((att: any) => (
              <div
                key={att.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D]"
              >
                <button
                  type="button"
                  onClick={() =>
                    onDownloadFile?.(att.storagePath, att.fileName, att.storageBucket || 'project-attachments')
                  }
                  className="inline-flex items-center gap-1 hover:underline font-medium"
                >
                  <Download className="w-3 h-3 text-[#42A5F5]" /> {att.fileName}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAttachment(att.id)}
                  className="text-red-600 hover:text-red-800 ml-1"
                  title="Remove attachment"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Transaction History Table */}
      {showTransactions && (
        <div className="rounded-lg border border-[#DCEAF5] bg-white p-3 space-y-2">
          <div className="font-semibold text-[#123B5D]">Payment Transaction History ({transactions.length})</div>
          {transactions.length === 0 ? (
            <div className="text-[#263746]/70">No payment transactions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-[#DCEAF5] text-[#263746]/70 font-mono">
                    <th className="py-1.5 pr-3">Ref</th>
                    <th className="py-1.5 pr-3">Installment</th>
                    <th className="py-1.5 pr-3">Amount</th>
                    <th className="py-1.5 pr-3">Method</th>
                    <th className="py-1.5 pr-3">Status</th>
                    <th className="py-1.5 pr-3">Recorded By</th>
                    <th className="py-1.5">Date &amp; Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCEAF5]">
                  {transactions.map((tx: any) => (
                    <tr key={tx.id}>
                      <td className="py-1.5 pr-3 font-mono font-semibold text-[#123B5D]">{tx.transactionRef}</td>
                      <td className="py-1.5 pr-3">#{tx.installmentNumber} (50%)</td>
                      <td className="py-1.5 pr-3 font-mono font-bold">₹{Number(tx.amountInr || 0).toLocaleString('en-IN')}</td>
                      <td className="py-1.5 pr-3">{tx.paymentMethod}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getPaymentStatusBadge(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{tx.recordedBy}</td>
                      <td className="py-1.5 text-[#263746]/80">
                        {new Date(tx.paidAt || tx.createdAt).toLocaleString('en-IN')}
                        {tx.failureReason ? ` · ${tx.failureReason}` : tx.notes ? ` · ${tx.notes}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Reminders Log */}
      {showReminders && (
        <div className="rounded-lg border border-[#DCEAF5] bg-white p-3 space-y-2">
          <div className="font-semibold text-[#123B5D]">Sent Payment Reminders ({reminders.length})</div>
          {reminders.length === 0 ? (
            <div className="text-[#263746]/70">No reminders dispatched yet.</div>
          ) : (
            <div className="divide-y divide-[#DCEAF5] max-h-40 overflow-y-auto text-[11px] font-mono">
              {reminders.map((rem: any) => (
                <div key={rem.id} className="py-1.5 flex flex-wrap justify-between gap-2">
                  <span>
                    Inst #{rem.installmentNumber} · ₹{Number(rem.amountInr || 0).toLocaleString('en-IN')} · {rem.recipientEmail} ({rem.reminderType})
                  </span>
                  <span className="text-[#263746]/70">
                    {rem.deliveryStatus} · {new Date(rem.sentAt).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PDF Agreement Preview Modal */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123B5D]/50 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-4xl h-[85vh] bg-white rounded-xl border border-[#DCEAF5] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#DCEAF5] bg-[#F0F8FF]">
              <div className="font-display font-bold text-sm text-[#123B5D] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#42A5F5]" />
                Agreement PDF Preview — {project.projectCode}
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
            <iframe
              title="Project Agreement Preview"
              src={previewPdfUrl}
              className="w-full flex-1 border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};
