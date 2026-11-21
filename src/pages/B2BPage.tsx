import React, { useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

export const B2BPortalPage: React.FC = () => {
  const { isSignedIn, dbUser, openAuthModal, apiFetch, notify, navigate } = usePlatform();
  const [form, setForm] = useState({
    companyName: '',
    contactPerson: dbUser?.fullName || '',
    email: dbUser?.email || '',
    mobile: dbUser?.mobile || '',
    gstin: '',
    requirementCategory: 'Bulk Drone Components',
    quantity: 25,
    technicalSpecs: '',
    expectedDeliveryDate: '',
    shippingLocation: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      openAuthModal('login');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      files.forEach((f) => fd.append('attachments', f));
      const res = await apiFetch<{ enquiry: { enquiryNumber: string } }>('/api/b2b-enquiries', {
        method: 'POST',
        body: fd,
      });
      setSubmittedCode(res.enquiry.enquiryNumber);
      notify(`B2B enquiry ${res.enquiry.enquiryNumber} submitted.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to submit B2B enquiry.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2 border-b border-[#DCEAF5] pb-6">
        <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">Enterprise &amp; Institutional Procurement</div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D]">
          B2B &amp; Bulk Manufacturing Orders
        </h1>
        <p className="text-[#263746] text-sm sm:text-base max-w-3xl">
          Volume hardware procurement, agricultural drone fleet components, batch 3D printing, OEM fabrication, and institutional R&amp;D lab supply contracts.
        </p>
      </div>

      {submittedCode ? (
        <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-8 space-y-3">
          <div className="flex items-center gap-2 font-display text-xl font-bold text-[#123B5D]">
            <CheckCircle2 className="w-6 h-6 text-[#64B5F6]" /> B2B Enquiry Received: {submittedCode}
          </div>
          <p className="text-sm text-[#263746]">
            Our commercial engineering team will prepare custom volume pricing and send a payment link directly in your dashboard.
          </p>
          <button
            onClick={() => navigate('/my-account')}
            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Track in My Account
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-4">
            <h2 className="font-display text-lg font-bold text-[#123B5D]">Submit Bulk / OEM Requirement</h2>
            {!isSignedIn && (
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Sign In via Email OTP
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              required
              placeholder="Company / Institution Name *"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
            <input
              required
              placeholder="Contact Person *"
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
            <input
              required
              type="email"
              placeholder="Official Email *"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
            <input
              required
              placeholder="Mobile Number *"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
            <input
              placeholder="GSTIN (Optional)"
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm font-mono uppercase focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
            <select
              value={form.requirementCategory}
              onChange={(e) => setForm({ ...form, requirementCategory: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            >
              {[
                'Bulk Electronics Orders',
                'Bulk Drone Components',
                'Robotics Components',
                '3D Printing Bulk Production',
                'OEM / Private-Label Hardware',
                'Engineering Development Contract',
              ].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              required
              placeholder="Estimated Quantity *"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm font-mono focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
            <input
              type="date"
              placeholder="Expected Delivery Date"
              value={form.expectedDeliveryDate}
              onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })}
              className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
            />
          </div>

          <input
            required
            placeholder="Shipping City / State / Delivery Location *"
            value={form.shippingLocation}
            onChange={(e) => setForm({ ...form, shippingLocation: e.target.value })}
            className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
          />

          <textarea
            required
            rows={4}
            placeholder="Technical specifications, SKU list, target tolerances, or contract requirements *"
            value={form.technicalSpecs}
            onChange={(e) => setForm({ ...form, technicalSpecs: e.target.value })}
            className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
          />

          <label className="flex items-center justify-center gap-2 border border-dashed border-[#90CAF9] bg-[#F0F8FF]/50 rounded-lg p-4 cursor-pointer hover:bg-[#F0F8FF] text-sm text-[#263746] transition-colors">
            <Upload className="w-4 h-4 text-[#64B5F6]" />
            <span>{files.length > 0 ? `${files.length} file(s) attached` : 'Attach BOM, RFQ PDF, or Drawings (optional)'}</span>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xlsx,.csv,.zip,.png,.jpg,.jpeg"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="hidden"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting...' : isSignedIn ? 'Submit B2B Enquiry' : 'Sign In & Submit B2B Enquiry'}
          </button>
        </form>
      )}
    </div>
  );
};
