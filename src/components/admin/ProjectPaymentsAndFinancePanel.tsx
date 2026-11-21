import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  CreditCard,
  Download,
  FileCheck2,
  Mail,
  Send,
  ShieldAlert,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import {
  downloadClearanceCertificatePdf,
  downloadCompletionCertificatePdf,
  downloadPaymentReceiptPdf,
  downloadProjectFinanceReportPdf,
  downloadWorkOrderPdf,
} from '../../lib/pdf';
import {
  EmailTemplateDef,
  PaymentClearanceCertificate,
  PaymentReceiptRecord,
  ProjectDeliveryRecord,
  ProjectHandoverDocument,
  ProjectPaymentMilestone,
  ProjectPaymentSettings,
  ProjectWorkOrder,
} from '../../types/platform';

async function downloadAuthenticatedFile(url: string, filename: string, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { headers, credentials: 'same-origin' });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Download failed.' }));
    throw new Error(err.error || 'Download failed.');
  }
  const blob = await resp.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

// ============================================================================
// 1. PROJECT PAYMENT SETTINGS & EMAIL TEMPLATES PANEL
// ============================================================================
export const ProjectPaymentSettingsPanel: React.FC<{
  isSuperAdmin: boolean;
  emailLogs?: Array<{
    id: number;
    recipientEmail: string;
    eventType: string;
    subject: string;
    provider: string;
    status: string;
    errorMessage?: string;
    createdAt: string;
  }>;
}> = ({ isSuperAdmin, emailLogs = [] }) => {
  const { apiFetch, notify, refreshBootstrap } = usePlatform();
  const [cfg, setCfg] = useState<ProjectPaymentSettings>({
    defaultPlanType: '50_50_split',
    advancePercent: 50,
    finalPercent: 50,
    allowFullPayment: true,
    enableGstTax: false,
    gstPercent: 18,
    quotationValidityDays: 15,
    quotationPrefix: 'NTF-QTN',
    projectPrefix: 'NTF-PRJ',
    paymentPrefix: 'NTF-PAY',
    invoicePrefix: 'NTF-INV',
    receiptPrefix: 'NTF-RCP',
    clearancePrefix: 'NTF-CLR',
    workOrderPrefix: 'NTF-WRK',
    handoverDownloadExpiryDays: 30,
    reminderIntervalsDays: [3, 7, 14],
    allowHandoverExceptionBySuperAdmin: true,
    cancellationRefundPolicy: '',
  });
  const [templates, setTemplates] = useState<EmailTemplateDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        apiFetch<{ settings: Partial<ProjectPaymentSettings> }>('/api/admin/settings/project-payments'),
        apiFetch<{ templates: EmailTemplateDef[] }>('/api/admin/settings/project-email-templates'),
      ]);
      if (sRes.settings && Object.keys(sRes.settings).length > 0) {
        setCfg((prev) => ({ ...prev, ...sRes.settings }));
      }
      setTemplates(tRes.templates || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load project payment settings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      notify('Only Super Admin can update payment plan policies.', 'error');
      return;
    }
    setSavingCfg(true);
    try {
      const res = await apiFetch<{ settings: ProjectPaymentSettings }>('/api/admin/settings/project-payments', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      });
      setCfg(res.settings);
      await refreshBootstrap();
      notify('Project payment & split rules updated.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to save settings.', 'error');
    } finally {
      setSavingCfg(false);
    }
  };

  const saveTemplates = async () => {
    if (!isSuperAdmin) {
      notify('Only Super Admin can update email templates.', 'error');
      return;
    }
    setSavingTpl(true);
    try {
      const res = await apiFetch<{ templates: EmailTemplateDef[] }>('/api/admin/settings/project-email-templates', {
        method: 'PUT',
        body: JSON.stringify({ templates }),
      });
      setTemplates(res.templates);
      notify('Lifecycle email templates saved.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to save templates.', 'error');
    } finally {
      setSavingTpl(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-xs text-[#263746]/70">Loading project payment settings...</div>;
  }

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5]/60 pb-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#123B5D]">
              Project Payment Split, Tax &amp; Numbering Rules
            </h2>
            <p className="text-[#263746]/80 mt-0.5">
              Enforce default 50% advance / 50% final payment gating before deliverable handover. Super Admin only.
            </p>
          </div>
          {!isSuperAdmin && (
            <span className="font-mono text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
              Read-Only (Super Admin required to save)
            </span>
          )}
        </div>

        <form onSubmit={saveConfig} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">Default Advance (%)</label>
              <input
                type="number"
                min={10}
                max={100}
                value={cfg.advancePercent}
                onChange={(e) => {
                  const adv = Math.min(100, Math.max(10, Number(e.target.value) || 50));
                  setCfg({ ...cfg, advancePercent: adv, finalPercent: 100 - adv });
                }}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">Default Final Balance (%)</label>
              <input
                type="number"
                readOnly
                value={cfg.finalPercent}
                className="w-full rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] px-3 py-2 font-mono text-[#263746]/80"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">Quotation Validity (Days)</label>
              <input
                type="number"
                min={1}
                max={180}
                value={cfg.quotationValidityDays}
                onChange={(e) => setCfg({ ...cfg, quotationValidityDays: Number(e.target.value) || 15 })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">Handover Token Expiry (Days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={cfg.handoverDownloadExpiryDays}
                onChange={(e) => setCfg({ ...cfg, handoverDownloadExpiryDays: Number(e.target.value) || 30 })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              ['quotationPrefix', 'Quotation Prefix'],
              ['projectPrefix', 'Project Prefix'],
              ['paymentPrefix', 'Payment Prefix'],
              ['invoicePrefix', 'Invoice Prefix'],
              ['receiptPrefix', 'Receipt Prefix'],
              ['clearancePrefix', 'Clearance Prefix'],
              ['workOrderPrefix', 'Work Order Prefix'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="block font-semibold text-[#123B5D] mb-1">{label}</label>
                <input
                  value={(cfg as any)[k] || ''}
                  onChange={(e) => setCfg({ ...cfg, [k]: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-mono uppercase text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <label className="flex items-center gap-2 font-medium text-[#263746]">
              <input
                type="checkbox"
                checked={cfg.allowFullPayment}
                onChange={(e) => setCfg({ ...cfg, allowFullPayment: e.target.checked })}
                className="accent-[#64B5F6]"
              />
              Allow customer 100% full upfront option
            </label>
            <label className="flex items-center gap-2 font-medium text-[#263746]">
              <input
                type="checkbox"
                checked={cfg.allowHandoverExceptionBySuperAdmin}
                onChange={(e) => setCfg({ ...cfg, allowHandoverExceptionBySuperAdmin: e.target.checked })}
                className="accent-[#64B5F6]"
              />
              Allow Super Admin audited handover exception
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 font-medium text-[#263746]">
                <input
                  type="checkbox"
                  checked={cfg.enableGstTax}
                  onChange={(e) => setCfg({ ...cfg, enableGstTax: e.target.checked })}
                  className="accent-[#64B5F6]"
                />
                Apply GST (%)
              </label>
              <input
                type="number"
                min={0}
                max={28}
                disabled={!cfg.enableGstTax}
                value={cfg.gstPercent}
                onChange={(e) => setCfg({ ...cfg, gstPercent: Number(e.target.value) || 0 })}
                className="w-20 rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] disabled:bg-[#F0F8FF] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">
                Final Payment Reminder Schedule (Days comma-separated)
              </label>
              <input
                value={(cfg.reminderIntervalsDays || []).join(', ')}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    reminderIntervalsDays: e.target.value
                      .split(',')
                      .map((x) => Number(x.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0),
                  })
                }
                placeholder="3, 7, 14"
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">Cancellation &amp; Refund Policy Note</label>
              <input
                value={cfg.cancellationRefundPolicy}
                onChange={(e) => setCfg({ ...cfg, cancellationRefundPolicy: e.target.value })}
                placeholder="Advance covers procured components and engineering allocation..."
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
          </div>

          {isSuperAdmin && (
            <button
              type="submit"
              disabled={savingCfg}
              className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingCfg ? 'Saving Configuration...' : 'Save Payment Split Configuration'}
            </button>
          )}
        </form>
      </div>

      {/* Email Templates */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5]/60 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#123B5D] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#42A5F5]" />
              Automated Project Email Notification Templates ({templates.length})
            </h3>
            <p className="text-[#263746]/70 mt-0.5">
              Variables supported: {'{{customerName}}'}, {'{{enquiryNumber}}'}, {'{{projectCode}}'}, {'{{amountInr}}'}, {'{{balanceAmountInr}}'}, {'{{trackingNumber}}'}.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              disabled={savingTpl}
              onClick={saveTemplates}
              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingTpl ? 'Saving...' : 'Save All Templates'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[460px] overflow-y-auto pr-1">
          {templates.map((tpl, idx) => (
            <div key={tpl.eventType} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-[#123B5D]">{tpl.label}</div>
                  <div className="font-mono text-[10px] text-[#263746]/70">{tpl.eventType}</div>
                </div>
                <label className="flex items-center gap-1.5 font-medium text-[#263746]">
                  <input
                    type="checkbox"
                    checked={tpl.enabled}
                    onChange={(e) =>
                      setTemplates(templates.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)))
                    }
                    className="accent-[#64B5F6]"
                  />
                  Enabled
                </label>
              </div>
              <input
                value={tpl.subject}
                onChange={(e) =>
                  setTemplates(templates.map((x, i) => (i === idx ? { ...x, subject: e.target.value } : x)))
                }
                placeholder="Email subject"
                className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <textarea
                rows={2}
                value={tpl.body}
                onChange={(e) =>
                  setTemplates(templates.map((x, i) => (i === idx ? { ...x, body: e.target.value } : x)))
                }
                className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Email Delivery Audit Log */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3">
        <h3 className="font-display text-base font-bold text-[#123B5D]">
          Email Notification Audit Trail ({emailLogs.length})
        </h3>
        <p className="text-[#263746]/70">
          Every order, quotation, and milestone notification is recorded here. Customers can also reach Customer Care directly at <span className="font-mono text-[#123B5D]">info@nexustekfusion.in</span>.
        </p>
        {emailLogs.length === 0 ? (
          <div className="text-[#263746]/70 py-4">No email notifications recorded yet.</div>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-[#DCEAF5] rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[11px] text-[#123B5D]">
                <tr>
                  <th className="py-2 px-3">Recipient</th>
                  <th className="py-2 px-3">Event</th>
                  <th className="py-2 px-3">Subject</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCEAF5]/60">
                {emailLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 px-3 font-mono">{log.recipientEmail}</td>
                    <td className="py-2 px-3 font-mono text-[#263746]/70">{log.eventType}</td>
                    <td className="py-2 px-3">{log.subject}</td>
                    <td className="py-2 px-3 font-mono">
                      <span
                        className={
                          log.status === 'sent'
                            ? 'text-[#42A5F5] font-semibold'
                            : log.status === 'not_configured'
                            ? 'text-amber-700 font-semibold'
                            : 'text-red-700 font-semibold'
                        }
                      >
                        {log.status} ({log.provider})
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[#263746]/70">
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. ADMIN PROJECT FINANCIAL DASHBOARD PANEL (/admin/project-finance)
// ============================================================================
export const ProjectFinanceDashboardPanel: React.FC = () => {
  const { apiFetch, getIdToken, notify } = usePlatform();
  const [filters, setFilters] = useState({
    search: '',
    startDate: '',
    endDate: '',
    status: '',
    paymentStatus: '',
    engineer: '',
  });
  const [loading, setLoading] = useState(true);
  const [financeData, setFinanceData] = useState<{
    summary: {
      projectCount: number;
      totalQuotedInr: number;
      totalCollectedInr: number;
      totalOutstandingInr: number;
      clearedProjectsCount: number;
      awaitingFinalCount: number;
    };
    projects: any[];
    receipts: PaymentReceiptRecord[];
  } | null>(null);

  const loadFinance = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) qs.set(k, v);
      });
      const res = await apiFetch<any>(`/api/admin/project-finance?${qs.toString()}`);
      setFinanceData(res);
    } catch (err: any) {
      notify(err?.message || 'Failed to load project finance report.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, []);

  const summary = financeData?.summary || {
    projectCount: 0,
    totalQuotedInr: 0,
    totalCollectedInr: 0,
    totalOutstandingInr: 0,
    clearedProjectsCount: 0,
    awaitingFinalCount: 0,
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#123B5D]">
            Project Payments, Balance Dues &amp; Clearance Ledger
          </h2>
          <p className="text-[#263746]/80 mt-0.5">
            Track 50% advance collections, pending final balances, clearance certificates, and official receipts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              financeData &&
              downloadProjectFinanceReportPdf({
                summary,
                projects: financeData.projects,
              })
            }
            disabled={!financeData}
            className="px-3.5 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export PDF Report
          </button>
          <button
            type="button"
            onClick={() =>
              downloadAuthenticatedFile(
                '/api/admin/export/project-finance',
                'nexustekfusion-project-finance.csv',
                getIdToken
              ).catch((e) => notify(e.message, 'error'))
            }
            className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          ['Projects in Filter', String(summary.projectCount)],
          ['Total Quoted Value', `₹${summary.totalQuotedInr.toLocaleString('en-IN')}`],
          ['Verified Collected', `₹${summary.totalCollectedInr.toLocaleString('en-IN')}`],
          ['Outstanding Balance', `₹${summary.totalOutstandingInr.toLocaleString('en-IN')}`],
          ['Cleared / Awaiting Final', `${summary.clearedProjectsCount} / ${summary.awaitingFinalCount}`],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-1">
            <div className="text-[11px] text-[#263746]/70">{label}</div>
            <div className="font-mono text-lg font-bold text-[#123B5D] tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Search</label>
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Code, title, client..."
            className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">From Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">To Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Clearance Status</label>
          <select
            value={filters.paymentStatus}
            onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
            className="w-full rounded border border-[#DCEAF5] px-2.5 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          >
            <option value="">All</option>
            <option value="Advance Paid">Advance Paid</option>
            <option value="Cleared">Cleared</option>
            <option value="Override Authorized">Override Authorized</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Assigned Engineer</label>
          <input
            value={filters.engineer}
            onChange={(e) => setFilters({ ...filters, engineer: e.target.value })}
            placeholder="Engineer name/email"
            className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          />
        </div>
        <button
          type="button"
          onClick={loadFinance}
          className="px-4 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg h-[34px] transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white overflow-x-auto">
        {loading ? (
          <div className="p-6 text-[#263746]/70">Loading project finance ledger...</div>
        ) : (financeData?.projects || []).length === 0 ? (
          <div className="p-6 text-[#263746]/70">No projects match the current filters.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[11px] text-[#123B5D]">
              <tr>
                <th className="py-2.5 px-3">Project / Quotation</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3 text-right">Paid</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
                <th className="py-2.5 px-3">Clearance / Handover</th>
                <th className="py-2.5 px-3">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCEAF5]/60">
              {financeData!.projects.map((p: any) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-3">
                    <div className="font-mono font-bold text-[#123B5D]">{p.projectCode}</div>
                    <div className="text-[#263746] truncate max-w-[200px]">{p.title}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[#123B5D]">{p.customerName || '—'}</div>
                    <div className="font-mono text-[11px] text-[#263746]/70">{p.customerEmail}</div>
                  </td>
                  <td className="py-2.5 px-3">{p.status}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                    ₹{Number(p.totalAmountInr || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#42A5F5] font-semibold">
                    ₹{Number(p.paidAmountInr || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                    ₹{Number(p.balanceAmountInr || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[#123B5D]">{p.paymentClearanceStatus}</div>
                    <div className="text-[11px] text-[#263746]/70">
                      {p.handoverUnlocked ? 'Handover Unlocked' : 'Handover Locked'}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1.5">
                      {p.clearanceCertificate && (
                        <button
                          type="button"
                          onClick={() =>
                            downloadClearanceCertificatePdf({
                              certificateNumber: p.clearanceCertificate.certificateNumber,
                              projectCode: p.projectCode,
                              projectTitle: p.title,
                              totalAmountInr: p.clearanceCertificate.totalAmountInr,
                              advancePaidInr: p.clearanceCertificate.advancePaidInr,
                              finalPaidInr: p.clearanceCertificate.finalPaidInr,
                              balanceInr: p.clearanceCertificate.balanceInr,
                              paymentRefs: p.clearanceCertificate.paymentRefs || [],
                              issuedAt: p.clearanceCertificate.issuedAt,
                              issuedBy: p.clearanceCertificate.issuedBy,
                              customerEmail: p.customerEmail,
                            })
                          }
                          className="px-2 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <Award className="w-3 h-3 text-[#42A5F5]" /> Clearance PDF
                        </button>
                      )}
                      {p.completionCertificateNumber && (
                        <button
                          type="button"
                          onClick={() =>
                            downloadCompletionCertificatePdf({
                              certificateNumber: p.completionCertificateNumber,
                              projectCode: p.projectCode,
                              projectTitle: p.title,
                              acknowledgedBy: p.customerAcknowledgedBy || p.customerEmail,
                              acknowledgedAt: p.customerAcknowledgedAt || new Date().toISOString(),
                              assignedEngineer: p.assignedEngineer || 'NexusTekFusion Engineering',
                            })
                          }
                          className="px-2 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <FileCheck2 className="w-3 h-3 text-[#42A5F5]" /> Completion PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Receipts */}
      {(financeData?.receipts || []).length > 0 && (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-[#123B5D]">
            Verified Project Payment Receipts ({financeData!.receipts.length})
          </h3>
          <div className="divide-y divide-[#DCEAF5]/60 max-h-60 overflow-y-auto">
            {financeData!.receipts.map((rcp) => (
              <div key={rcp.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-[#123B5D]">{rcp.receiptNumber}</span> ·{' '}
                  <span className="font-mono text-[#263746]/70">{rcp.paymentRef}</span> ·{' '}
                  <span className="uppercase">{rcp.paymentStage}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold tabular-nums text-[#123B5D]">
                    ₹{rcp.amountInr.toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadPaymentReceiptPdf({
                        receiptNumber: rcp.receiptNumber,
                        paymentRef: rcp.paymentRef,
                        razorpayPaymentId: rcp.razorpayPaymentId,
                        paymentStage: rcp.paymentStage,
                        amountInr: rcp.amountInr,
                        issuedAt: rcp.issuedAt,
                        customerEmail: String((rcp.payload as any)?.customerEmail || ''),
                        referenceCode: String((rcp.payload as any)?.projectCode || ''),
                      })
                    }
                    className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3 h-3" /> Receipt PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. PER-PROJECT HANDOVER, FINAL PAYMENT & EXCEPTION CONTROLS
// ============================================================================
export const ProjectHandoverControlsPanel: React.FC<{
  project: any;
  customerEmail?: string;
  quotation?: any;
  milestones?: ProjectPaymentMilestone[];
  receipts?: PaymentReceiptRecord[];
  clearanceCert?: PaymentClearanceCertificate | null;
  workOrder?: ProjectWorkOrder | null;
  handoverDocs?: ProjectHandoverDocument[];
  deliveryRecords?: ProjectDeliveryRecord[];
  isSuperAdmin: boolean;
  onRefresh: () => void;
}> = ({
  project,
  customerEmail = '',
  quotation,
  milestones = [],
  receipts = [],
  clearanceCert,
  workOrder,
  handoverDocs = [],
  deliveryRecords = [],
  isSuperAdmin,
  onRefresh,
}) => {
  const { apiFetch, getIdToken, notify } = usePlatform();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Payment plan override form
  const [overrideAdvPct, setOverrideAdvPct] = useState<number>(quotation?.advancePercent ?? 50);
  const [overrideReason, setOverrideReason] = useState('');

  // Super Admin Handover Exception
  const [exceptionReason, setExceptionReason] = useState('');

  // Handover document upload
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'source_code',
    versionLabel: 'v1.0',
    notes: '',
  });
  const [docFile, setDocFile] = useState<File | null>(null);

  // Courier dispatch form
  const [courierForm, setCourierForm] = useState({
    courierName: project.trackingCourier || '',
    trackingNumber: project.trackingId || '',
    trackingUrl: project.trackingUrl || '',
    dispatchDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    actualDeliveryDate: '',
    dispatchNotes: '',
  });

  const requestFinalPayment = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/request-final-payment`, { method: 'POST' });
      notify(`Project ${project.projectCode} marked Awaiting Final Payment & customer notified.`, 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to update project status.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendReminder = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/send-payment-reminder`, { method: 'POST' });
      notify(`Final payment reminder sent for ${project.projectCode}.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to send reminder.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitPlanOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      notify('Mandatory reason is required to override payment plan.', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/override-payment-plan`, {
        method: 'POST',
        body: JSON.stringify({
          advancePercent: overrideAdvPct,
          reason: overrideReason.trim(),
        }),
      });
      setOverrideReason('');
      notify('Payment plan overridden and audited.', 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to override payment plan.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const authorizeException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionReason.trim()) {
      notify('Audit reason is mandatory to authorize a handover exception.', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/authorize-handover-exception`, {
        method: 'POST',
        body: JSON.stringify({ reason: exceptionReason.trim() }),
      });
      setExceptionReason('');
      notify('Super Admin handover exception authorized & logged.', 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to authorize exception.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadHandoverDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile) {
      notify('Select a deliverable file to upload.', 'error');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('title', docForm.title || docFile.name);
      fd.append('category', docForm.category);
      fd.append('versionLabel', docForm.versionLabel);
      fd.append('notes', docForm.notes);
      await apiFetch(`/api/admin/projects/${project.id}/handover-documents`, {
        method: 'POST',
        body: fd,
      });
      setDocFile(null);
      setDocForm({ title: '', category: 'source_code', versionLabel: 'v1.0', notes: '' });
      notify('Private deliverable uploaded to project handover vault.', 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Upload failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteHandoverDoc = async (docId: number) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/handover-documents/${docId}`, { method: 'DELETE' });
      notify('Deliverable removed.', 'info');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to delete document.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const logDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/admin/projects/${project.id}/delivery`, {
        method: 'POST',
        body: JSON.stringify(courierForm),
      });
      notify('Project dispatch / courier record logged.', 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to save dispatch details.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const totalInr = Number(project.totalAmountInr || quotation?.totalAmountInr || 0);
  const paidInr = Number(project.paidAmountInr || 0);
  const balanceInr = Number(project.balanceAmountInr ?? Math.max(0, totalInr - paidInr));

  return (
    <div className="pt-3 border-t border-[#DCEAF5]/60 space-y-3 text-xs">
      {/* Compact Financial & Handover Summary Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#263746] tabular-nums">
          <span>Total: ₹{totalInr.toLocaleString('en-IN')}</span>
          <span>·</span>
          <span className="text-[#42A5F5] font-semibold">Paid: ₹{paidInr.toLocaleString('en-IN')}</span>
          <span>·</span>
          <span className={balanceInr > 0 ? 'text-amber-700 font-semibold' : 'text-[#42A5F5] font-semibold'}>
            Balance: ₹{balanceInr.toLocaleString('en-IN')}
          </span>
          <span>·</span>
          <span>Clearance: {project.paymentClearanceStatus || 'Advance Paid'}</span>
          <span>·</span>
          <span className={project.handoverUnlocked ? 'text-[#42A5F5] font-semibold' : 'text-[#263746]/70'}>
            {project.handoverUnlocked ? 'Handover Unlocked' : 'Handover Locked'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {balanceInr > 0 && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={requestFinalPayment}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold inline-flex items-center gap-1"
              >
                <CreditCard className="w-3 h-3" /> Request Final Payment
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={sendReminder}
                className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <Send className="w-3 h-3" /> Send Reminder
              </button>
            </>
          )}
          {workOrder && (
            <button
              type="button"
              onClick={() =>
                downloadWorkOrderPdf({
                  workOrderNumber: workOrder.workOrderNumber,
                  projectCode: project.projectCode,
                  projectTitle: project.title,
                  assignedEngineer: workOrder.assignedEngineer || project.assignedEngineer,
                  estimatedCompletionDate: workOrder.estimatedCompletionDate,
                  scopeSummary: workOrder.scopeSummary,
                  issuedAt: workOrder.issuedAt,
                  customerEmail,
                })
              }
              className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1 transition-colors"
            >
              <Download className="w-3 h-3" /> Work Order
            </button>
          )}
          {clearanceCert && (
            <button
              type="button"
              onClick={() =>
                downloadClearanceCertificatePdf({
                  certificateNumber: clearanceCert.certificateNumber,
                  projectCode: project.projectCode,
                  projectTitle: project.title,
                  totalAmountInr: clearanceCert.totalAmountInr,
                  advancePaidInr: clearanceCert.advancePaidInr,
                  finalPaidInr: clearanceCert.finalPaidInr,
                  balanceInr: clearanceCert.balanceInr,
                  paymentRefs: clearanceCert.paymentRefs || [],
                  issuedAt: clearanceCert.issuedAt,
                  issuedBy: clearanceCert.issuedBy,
                  customerEmail,
                })
              }
              className="px-2.5 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
            >
              <Award className="w-3 h-3 text-[#42A5F5]" /> Clearance Cert
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
          >
            {expanded ? 'Hide Handover & Controls' : `Handover Vault (${handoverDocs.length}) & Controls`}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-5">
          {/* Milestones & Receipts */}
          {(milestones.length > 0 || receipts.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {milestones.length > 0 && (
                <div className="rounded-lg border border-[#DCEAF5] bg-white p-3 space-y-2">
                  <div className="font-semibold text-[#123B5D]">Payment Milestones</div>
                  {milestones.map((m) => (
                    <div key={m.id} className="flex justify-between items-center text-[11px] border-b border-[#DCEAF5]/60 pb-1 last:border-0">
                      <span>
                        {m.stageName} ({m.percent}%)
                      </span>
                      <span className="font-mono font-semibold">
                        ₹{m.amountInr.toLocaleString('en-IN')} ·{' '}
                        <span className={m.status === 'paid' ? 'text-[#42A5F5]' : 'text-amber-700'}>{m.status}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {receipts.length > 0 && (
                <div className="rounded-lg border border-[#DCEAF5] bg-white p-3 space-y-2">
                  <div className="font-semibold text-[#123B5D]">Payment Receipts</div>
                  {receipts.map((rcp) => (
                    <div key={rcp.id} className="flex justify-between items-center text-[11px] border-b border-[#DCEAF5]/60 pb-1 last:border-0">
                      <span className="font-mono">
                        {rcp.receiptNumber} ({rcp.paymentStage})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          downloadPaymentReceiptPdf({
                            receiptNumber: rcp.receiptNumber,
                            paymentRef: rcp.paymentRef,
                            razorpayPaymentId: rcp.razorpayPaymentId,
                            paymentStage: rcp.paymentStage,
                            amountInr: rcp.amountInr,
                            issuedAt: rcp.issuedAt,
                            customerEmail,
                            referenceCode: project.projectCode,
                          })
                        }
                        className="text-[#42A5F5] font-semibold hover:text-[#123B5D] hover:underline"
                      >
                        ₹{rcp.amountInr.toLocaleString('en-IN')} PDF
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload Private Handover Deliverable */}
          <div className="rounded-lg border border-[#DCEAF5] bg-white p-4 space-y-3">
            <div className="font-semibold text-[#123B5D] flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-[#42A5F5]" />
              Upload Private Handover Deliverables (Gated by Balance Clearance)
            </div>
            <form onSubmit={uploadHandoverDoc} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
              <input
                required
                placeholder="Deliverable Title *"
                value={docForm.title}
                onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <select
                value={docForm.category}
                onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                className="rounded border border-[#DCEAF5] px-2.5 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              >
                <option value="source_code">Source Code / Firmware</option>
                <option value="cad_pcb">CAD / Gerber / STL</option>
                <option value="documentation">Report / PPT / Manual</option>
                <option value="demo_media">Demo Video / Logs</option>
              </select>
              <input
                placeholder="Version (v1.0)"
                value={docForm.versionLabel}
                onChange={(e) => setDocForm({ ...docForm, versionLabel: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <input
                type="file"
                required
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                className="text-[11px]"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
              >
                Upload Deliverable
              </button>
            </form>

            {handoverDocs.length > 0 && (
              <div className="divide-y divide-[#DCEAF5]/60 pt-2">
                {handoverDocs.map((doc) => (
                  <div key={doc.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div>
                      <span className="font-semibold text-[#123B5D]">{doc.title}</span> ·{' '}
                      <span className="font-mono text-[#263746]/70">
                        {doc.fileName} ({doc.versionLabel}) · Downloads: {doc.downloadCount} · Expires{' '}
                        {new Date(doc.tokenExpiresAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.downloadToken && (
                        <button
                          type="button"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/projects/${project.id}/handover-documents/${doc.id}/download?token=${encodeURIComponent(doc.downloadToken || '')}`,
                              doc.fileName,
                              getIdToken
                            ).catch((e) => notify(e.message, 'error'))
                          }
                          className="text-[#42A5F5] font-semibold hover:text-[#123B5D] hover:underline"
                        >
                          Test Download
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteHandoverDoc(doc.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        aria-label="Delete deliverable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Courier / Physical Prototype Dispatch */}
          <div className="rounded-lg border border-[#DCEAF5] bg-white p-4 space-y-3">
            <div className="font-semibold text-[#123B5D] flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-[#42A5F5]" />
              Physical Hardware / Prototype Courier Dispatch
            </div>
            <form onSubmit={logDelivery} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <input
                required
                placeholder="Courier Name *"
                value={courierForm.courierName}
                onChange={(e) => setCourierForm({ ...courierForm, courierName: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <input
                required
                placeholder="Tracking / AWB No *"
                value={courierForm.trackingNumber}
                onChange={(e) => setCourierForm({ ...courierForm, trackingNumber: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <input
                placeholder="Tracking URL"
                value={courierForm.trackingUrl}
                onChange={(e) => setCourierForm({ ...courierForm, trackingUrl: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <input
                type="date"
                value={courierForm.dispatchDate}
                onChange={(e) => setCourierForm({ ...courierForm, dispatchDate: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <input
                type="date"
                title="Actual Delivery Date (optional)"
                value={courierForm.actualDeliveryDate}
                onChange={(e) => setCourierForm({ ...courierForm, actualDeliveryDate: e.target.value })}
                className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
              >
                Save Dispatch
              </button>
            </form>
            {deliveryRecords.length > 0 && (
              <div className="space-y-1 text-[11px] text-[#263746]/80 font-mono">
                {deliveryRecords.map((dr) => (
                  <div key={dr.id}>
                    {dr.courierName} · AWB {dr.trackingNumber} · Dispatched {dr.dispatchDate}
                    {dr.actualDeliveryDate ? ` · Delivered ${dr.actualDeliveryDate}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Super Admin Governance: Plan Override & Handover Exception */}
          {isSuperAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form onSubmit={submitPlanOverride} className="rounded-lg border border-[#DCEAF5] bg-white p-4 space-y-2.5">
                <div className="font-semibold text-[#123B5D]">Super Admin: Override Payment Split</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={overrideAdvPct}
                    onChange={(e) => setOverrideAdvPct(Number(e.target.value))}
                    className="w-24 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    placeholder="Mandatory audit reason for split override *"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <button type="submit" disabled={busy} className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors">
                    Override
                  </button>
                </div>
              </form>

              <form onSubmit={authorizeException} className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2.5">
                <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                  Super Admin: Authorize Handover Exception
                </div>
                {project.handoverExceptionAuthorized ? (
                  <div className="text-[11px] text-amber-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#42A5F5]" />
                    Authorized by {project.handoverExceptionBy}: {project.handoverExceptionReason}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      required
                      placeholder="Mandatory audit reason (e.g., PO net-30 institutional credit) *"
                      value={exceptionReason}
                      onChange={(e) => setExceptionReason(e.target.value)}
                      className="flex-1 rounded border border-amber-300 bg-white px-2.5 py-1.5"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded font-semibold"
                    >
                      Unlock
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {project.customerAcknowledgedAt && (
            <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3 flex items-center justify-between text-[#123B5D]">
              <span>
                Customer acknowledged receipt at {new Date(project.customerAcknowledgedAt).toLocaleString('en-IN')} · Certificate{' '}
                <strong className="font-mono">{project.completionCertificateNumber}</strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadCompletionCertificatePdf({
                    certificateNumber: project.completionCertificateNumber,
                    projectCode: project.projectCode,
                    projectTitle: project.title,
                    acknowledgedBy: project.customerAcknowledgedBy || customerEmail,
                    acknowledgedAt: project.customerAcknowledgedAt,
                    assignedEngineer: project.assignedEngineer || 'NexusTekFusion Engineering',
                  })
                }
                className="px-2.5 py-1 bg-white border border-[#90CAF9] hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold transition-colors"
              >
                Completion Certificate PDF
              </button>
            </div>
          )}

          {!isSuperAdmin && balanceInr > 0 && !project.handoverUnlocked && (
            <div className="flex items-center gap-2 text-[11px] text-[#263746]/80">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Final deliverable downloads stay locked for customers until remaining ₹{balanceInr.toLocaleString('en-IN')} is cleared or a Super Admin authorizes an audited exception.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
