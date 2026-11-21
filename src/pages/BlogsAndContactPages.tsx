import React, { useEffect, useState } from 'react';
import { MapPin, Mail, Clock, Search, CheckCircle2 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { BlogPost } from '../types/platform';

export const BlogsListPage: React.FC = () => {
  const { blogs, navigate } = usePlatform();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-10">
      <div className="space-y-2 border-b border-[#DCEAF5] pb-6">
        <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">Knowledge Base</div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#123B5D]">
          Engineering Articles &amp; Technical Guides
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {blogs.map((post) => (
          <button
            key={post.id}
            onClick={() => navigate(`/blogs/${post.slug}`)}
            className="text-left rounded-xl border border-[#DCEAF5] bg-white overflow-hidden hover:border-[#64B5F6] transition-colors flex flex-col shadow-sm"
          >
            <div className="aspect-[16/10] bg-[#F0F8FF]">
              <img
                src={post.coverImageUrl}
                alt={post.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 space-y-2 flex-1">
              <div className="text-xs text-[#263746]/70">
                {post.category} · {new Date(post.publishedAt).toLocaleDateString('en-IN')}
              </div>
              <h2 className="font-display text-lg font-bold text-[#123B5D]">{post.title}</h2>
              <p className="text-sm text-[#263746] line-clamp-3">{post.excerpt}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export const BlogDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const { apiFetch, navigate } = usePlatform();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ blog: BlogPost }>(`/api/blogs/${slug}`)
      .then((d) => setPost(d.blog))
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [slug, apiFetch]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-14 text-sm text-[#263746]/70">Loading article...</div>;
  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#123B5D]">Article Not Found</h1>
        <button onClick={() => navigate('/blogs')} className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-sm font-semibold transition-colors">
          Back to Blogs
        </button>
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
      <div className="text-xs text-[#263746]/70">
        {post.category} · {new Date(post.publishedAt).toLocaleDateString('en-IN')}
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#123B5D]">{post.title}</h1>
      <div className="aspect-[16/9] rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF]">
        <img src={post.coverImageUrl} alt={post.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      </div>
      <div className="text-[#263746] leading-relaxed whitespace-pre-line text-base">{post.content}</div>
    </article>
  );
};

export const ContactPage: React.FC = () => {
  const { settings, dbUser, apiFetch, notify } = usePlatform();
  const company = settings.companyInfo;
  const cf = settings.cmsContent?.contactFooter;
  const socials = company?.socialLinks;
  const customerCareEmail = company?.customerCareEmail || 'info@nexustekfusion.in';
  const [form, setForm] = useState({
    name: dbUser?.fullName || '',
    email: dbUser?.email || '',
    mobile: dbUser?.mobile || '',
    subject: '',
    serviceCategory: 'Product enquiry',
    message: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketNo, setTicketNo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (attachment) fd.append('attachment', attachment);
      const res = await apiFetch<{ ticket: { ticketNumber: string } }>('/api/contact', {
        method: 'POST',
        body: fd,
      });
      setTicketNo(res.ticket.ticketNumber);
      notify(`Support ticket ${res.ticket.ticketNumber} created.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to send message.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 space-y-10">
      <div className="space-y-2 border-b border-[#DCEAF5] pb-6">
        <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">
          {cf?.contactHeroKicker || 'Contact & Support'}
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#123B5D]">
          {cf?.contactHeroTitle || 'Get in Touch'}
        </h1>
        {cf?.contactHeroSubtitle && (
          <p className="text-sm sm:text-base text-[#263746] max-w-2xl">{cf.contactHeroSubtitle}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-6 space-y-3 text-sm">
            <div className="text-xs font-semibold text-[#123B5D] uppercase tracking-wider">
              {cf?.supportHeadline || 'Customer Care Desk'}
            </div>
            <div className="font-display font-bold text-lg text-[#123B5D] flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#64B5F6] shrink-0" />
              <span className="font-mono break-all">{customerCareEmail}</span>
            </div>
            <p className="text-xs text-[#263746] leading-relaxed">
              {cf?.supportDescription ||
                'For order status, returns, GST billing, drone spare parts, or hardware assistance, email our dedicated Customer Care team directly.'}
            </p>
            <a
              href={`mailto:${customerCareEmail}?subject=${encodeURIComponent('Customer Care Support Request — NexusTekFusion')}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Contact Customer Support
            </a>
          </div>

          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 text-sm shadow-sm">
            <h2 className="font-display font-bold text-lg text-[#123B5D]">
              {company?.legalName || 'NEXUSTEKFUSION PRIVATE LIMITED'}
            </h2>
            <div className="flex items-start gap-3 text-[#263746]">
              <MapPin className="w-4 h-4 text-[#64B5F6] shrink-0 mt-1" />
              <span>{company?.address}</span>
            </div>
            <div className="flex items-center gap-3 text-[#263746]">
              <Mail className="w-4 h-4 text-[#64B5F6] shrink-0" />
              <a href={`mailto:${company?.email || 'info@nexustekfusion.in'}`} className="hover:text-[#42A5F5]">
                {company?.email || 'info@nexustekfusion.in'}
              </a>
            </div>
            <div className="flex items-center gap-3 text-[#263746]">
              <Clock className="w-4 h-4 text-[#64B5F6] shrink-0" />
              <span>{company?.businessHours}</span>
            </div>
            {company?.contactPhone && (
              <div className="text-[#123B5D] font-mono">Phone: {company.contactPhone}</div>
            )}
            <a
              href={
                cf?.googleMapsUrl ||
                'https://www.google.com/maps/search/?api=1&query=Ganjipeth+Nagpur+440018+Maharashtra+India'
              }
              target="_blank"
              rel="noreferrer"
              className="block text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline pt-2"
            >
              Open Nagpur Location in Google Maps →
            </a>
            {(socials?.linkedin || socials?.youtube || socials?.instagram || socials?.github || socials?.twitter) && (
              <div className="pt-3 border-t border-[#DCEAF5] flex flex-wrap gap-3 text-xs font-semibold text-[#123B5D]">
                {socials.linkedin && (
                  <a href={socials.linkedin} target="_blank" rel="noreferrer" className="hover:text-[#42A5F5]">
                    LinkedIn
                  </a>
                )}
                {socials.youtube && (
                  <a href={socials.youtube} target="_blank" rel="noreferrer" className="hover:text-[#42A5F5]">
                    YouTube
                  </a>
                )}
                {socials.instagram && (
                  <a href={socials.instagram} target="_blank" rel="noreferrer" className="hover:text-[#42A5F5]">
                    Instagram
                  </a>
                )}
                {socials.github && (
                  <a href={socials.github} target="_blank" rel="noreferrer" className="hover:text-[#42A5F5]">
                    GitHub
                  </a>
                )}
                {socials.twitter && (
                  <a href={socials.twitter} target="_blank" rel="noreferrer" className="hover:text-[#42A5F5]">
                    X / Twitter
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          {ticketNo ? (
            <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-8 space-y-3">
              <div className="flex items-center gap-2 font-display text-xl font-bold text-[#123B5D]">
                <CheckCircle2 className="w-6 h-6 text-[#64B5F6]" /> Enquiry Received — {ticketNo}
              </div>
              <p className="text-sm text-[#263746]">
                Your enquiry has been logged in our support system. Our team will respond via email and your customer dashboard.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-4 shadow-sm">
              <h2 className="font-display font-bold text-lg text-[#123B5D]">Send an Enquiry</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  required
                  placeholder="Full Name *"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
                <input
                  required
                  type="email"
                  placeholder="Email *"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
                <input
                  placeholder="Mobile Number"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
                <select
                  value={form.serviceCategory}
                  onChange={(e) => setForm({ ...form, serviceCategory: e.target.value })}
                  className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                >
                  {[
                    'Product enquiry',
                    'Order-related enquiry',
                    'Technical support',
                    'Complaint and feedback',
                    'General Engineering',
                    'AI & Machine Learning',
                    'Drone Development',
                    'Robotics & Automation',
                    'PCB Design',
                    '3D Printing',
                  ].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <input
                required
                placeholder="Subject *"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
              />
              <textarea
                required
                rows={4}
                placeholder="How can our engineering team help? *"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
              />
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="text-xs text-[#263746]"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Sending...' : 'Submit Enquiry'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const TrackOrderPage: React.FC = () => {
  const { apiFetch, settings } = usePlatform();
  const customerCareEmail = settings.companyInfo?.customerCareEmail || 'info@nexustekfusion.in';
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch(`/api/track-order?code=${encodeURIComponent(code.trim())}`);
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Order not found.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-8">
      <div className="space-y-2 border-b border-[#DCEAF5] pb-6">
        <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">Order &amp; Shipment Tracking</div>
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">Track Order or Project</h1>
        <p className="text-sm text-[#263746]">
          Enter your Store Order (`NTF-ORD-...`), 3D Print Order (`NTF-3DP-...`), Project Code (`NTF-PRJ-...`), or Enquiry Number (`NTF-ENQ-...`).
        </p>
      </div>

      <form onSubmit={handleTrack} className="flex gap-2">
        <input
          required
          placeholder="Enter reference code (e.g. NTF-ORD-261118-XXXX)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-4 py-3 text-sm font-mono uppercase focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Checking...' : 'Track'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      {result && (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
            <span className="font-mono font-bold text-lg text-[#123B5D]">{result.code}</span>
            <span className="text-xs font-semibold text-[#42A5F5]">{result.status}</span>
          </div>
          <div className="text-sm text-[#263746] space-y-1.5">
            {result.title && <div><span className="font-semibold text-[#123B5D]">Title:</span> {result.title}</div>}
            {result.paymentStatus && <div><span className="font-semibold text-[#123B5D]">Payment:</span> {result.paymentStatus}</div>}
            {result.slicingStatus && <div><span className="font-semibold text-[#123B5D]">Slicing:</span> {result.slicingStatus}</div>}
            {result.trackingCourier && (
              <div><span className="font-semibold text-[#123B5D]">Courier:</span> {result.trackingCourier} ({result.trackingId})</div>
            )}
            {result.trackingUrl && (
              <a href={result.trackingUrl} target="_blank" rel="noreferrer" className="text-[#42A5F5] hover:text-[#123B5D] underline text-xs block">
                Open Courier Tracking Link →
              </a>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#263746]">
        <span className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#64B5F6] shrink-0" />
          Need help tracking your shipment or updating a delivery address?
        </span>
        <a
          href={`mailto:${customerCareEmail}?subject=${encodeURIComponent(`Order Tracking Support${code ? ` (${code})` : ''}`)}`}
          className="px-3.5 py-2 bg-white border border-[#90CAF9] hover:border-[#42A5F5] hover:bg-[#F0F8FF] rounded-lg font-mono font-semibold text-[#123B5D] transition-colors"
        >
          Email Customer Care: {customerCareEmail}
        </a>
      </div>
    </div>
  );
};
