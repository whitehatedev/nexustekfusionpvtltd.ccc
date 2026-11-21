import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Film,
  FolderOpen,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import {
  MediaAssetRecord,
  SeoRouteEntry,
  SiteSettings,
  WebsiteBannerItem,
  WebsiteCmsSectionsBundle,
} from '../../types/platform';
import { MediaPickerModal } from './MediaLibraryPanel';

export type CmsStudioSubSection =
  | 'about_us'
  | 'banners'
  | 'services'
  | 'project_gallery'
  | 'store_content'
  | 'contact_footer'
  | 'seo'
  | 'revisions';

const BANNER_PLACEMENTS = [
  { id: 'homepage_promo', label: 'Homepage Promotional Showcase' },
  { id: 'homepage_hero', label: 'Homepage Hero Accent Banner' },
  { id: 'krashivantri', label: 'KRASHIVANTRI Drones Page' },
  { id: 'services', label: 'Services Page Banner' },
  { id: 'store', label: 'Hardware Store Promotional Banner' },
];

const EMPTY_BANNER: WebsiteBannerItem = {
  bannerKey: '',
  title: '',
  subtitle: '',
  placement: 'homepage_promo',
  imageUrl: '',
  videoUrl: '',
  ctaLabel: 'Explore More',
  ctaLink: '/krashivantri',
  sortOrder: 1,
  isActive: true,
  status: 'published',
};

export const MasterCmsStudioPanel: React.FC<{
  initialSection?: CmsStudioSubSection;
}> = ({ initialSection = 'banners' }) => {
  const { apiFetch, notify, refreshBootstrap, navigate } = usePlatform();
  const [section, setSection] = useState<CmsStudioSubSection>(
    initialSection === 'about_us' ? 'banners' : initialSection
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bundle, setBundle] = useState<WebsiteCmsSectionsBundle | null>(null);
  const [seoConfig, setSeoConfig] = useState<NonNullable<SiteSettings['seoConfig']>>({
    defaultTitle: '',
    defaultDescription: '',
    defaultKeywords: '',
    defaultOgImageUrl: '',
    defaultSocialDescription: '',
    ga4MeasurementId: '',
    routes: [],
  });
  const [companyInfo, setCompanyInfo] = useState<NonNullable<SiteSettings['companyInfo']>>({
    legalName: 'NEXUSTEKFUSION PRIVATE LIMITED',
    brandName: 'NexusTekFusion',
    established: '2026',
    founderCeo: 'Sahil Prakash Bhagat',
    email: 'info@nexustekfusion.in',
    customerCareEmail: 'info@nexustekfusion.in',
    website: 'https://nexustekfusion.in',
    address: '',
    cin: 'U30305ME2026PTC474052',
    gstin: '',
    contactPhone: '',
    businessHours: '',
    primaryTagline: '',
    secondaryTagline: '',
    socialLinks: { linkedin: '', instagram: '', youtube: '', github: '', twitter: '' },
  });
  const [announcementBar, setAnnouncementBar] = useState<NonNullable<SiteSettings['announcementBar']>>({
    enabled: true,
    text: '',
    link: '/krashivantri',
    ctaLabel: 'Explore',
  });
  const [banners, setBanners] = useState<WebsiteBannerItem[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [bannerForm, setBannerForm] = useState<WebsiteBannerItem>(EMPTY_BANNER);
  const [editingBannerOpen, setEditingBannerOpen] = useState(false);

  // Media Picker target
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    title: string;
    filterKind: 'all' | 'image' | 'video';
    category: string;
    onSelect: (asset: MediaAssetRecord) => void;
  } | null>(null);

  useEffect(() => {
    setSection(initialSection === 'about_us' ? 'banners' : initialSection);
  }, [initialSection]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        settings: SiteSettings;
        banners: WebsiteBannerItem[];
        revisions: any[];
      }>('/api/admin/cms/workspace');

      const s = res.settings || {};
      const ws = s.cmsWorkspace?.draft || s.cmsWorkspace?.published || s.cmsContent;
      if (ws) {
        setBundle(JSON.parse(JSON.stringify(ws)));
      }
      if (s.seoConfig) {
        setSeoConfig({
          defaultTitle: s.seoConfig.defaultTitle || '',
          defaultDescription: s.seoConfig.defaultDescription || '',
          defaultKeywords: s.seoConfig.defaultKeywords || '',
          defaultOgImageUrl: s.seoConfig.defaultOgImageUrl || '',
          defaultSocialDescription: s.seoConfig.defaultSocialDescription || '',
          ga4MeasurementId: s.seoConfig.ga4MeasurementId || '',
          routes: Array.isArray(s.seoConfig.routes) ? s.seoConfig.routes : [],
        });
      }
      if (s.companyInfo) {
        setCompanyInfo((prev) => ({
          ...prev,
          ...s.companyInfo,
          socialLinks: { ...prev.socialLinks, ...(s.companyInfo?.socialLinks || {}) },
        }));
      }
      if (s.announcementBar) {
        setAnnouncementBar(s.announcementBar);
      }
      setBanners(res.banners || []);
      setRevisions(res.revisions || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load Centralized CMS Studio.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const openPicker = (
    title: string,
    filterKind: 'all' | 'image' | 'video',
    category: string,
    onSelect: (asset: MediaAssetRecord) => void
  ) => {
    setPickerState({ open: true, title, filterKind, category, onSelect });
  };

  const handleSaveDraft = async () => {
    if (!bundle) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/cms/draft', {
        method: 'PUT',
        body: JSON.stringify({ draftBundle: bundle }),
      });
      notify('CMS Draft saved. Use "Preview Website (Draft)" to inspect changes before publishing.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to save CMS draft.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishLive = async () => {
    if (!bundle) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/cms/publish', {
        method: 'POST',
        body: JSON.stringify({
          draftBundle: bundle,
          seoConfig,
          companyInfo,
          announcementBar,
          label: `CMS Studio Publish · ${new Date().toLocaleString('en-IN')}`,
        }),
      });
      await refreshBootstrap();
      await loadWorkspace();
      notify('All CMS changes, SEO settings, and company details published live!', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to publish CMS changes.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardDraft = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/cms/discard', { method: 'POST' });
      await loadWorkspace();
      notify('Draft reverted to the last published version.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Failed to discard draft.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (revisionId: number, publishImmediately: boolean) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/cms/rollback/${revisionId}`, {
        method: 'POST',
        body: JSON.stringify({ publishImmediately }),
      });
      await loadWorkspace();
      if (publishImmediately) await refreshBootstrap();
      notify(
        publishImmediately
          ? 'Revision restored and published live!'
          : 'Revision loaded into Draft. Review and click Publish Live when ready.',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Rollback failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.title.trim()) {
      notify('Banner title is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (bannerForm.id) {
        await apiFetch(`/api/admin/banners/${bannerForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(bannerForm),
        });
        notify('Website banner updated.', 'success');
      } else {
        await apiFetch('/api/admin/banners', {
          method: 'POST',
          body: JSON.stringify(bannerForm),
        });
        notify('Website banner created.', 'success');
      }
      setEditingBannerOpen(false);
      setBannerForm(EMPTY_BANNER);
      await loadWorkspace();
      await refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to save banner.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBanner = async (id: number) => {
    try {
      await apiFetch(`/api/admin/banners/${id}`, { method: 'DELETE' });
      notify('Banner deleted.', 'info');
      await loadWorkspace();
      await refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to delete banner.', 'error');
    }
  };

  if (loading || !bundle) {
    return (
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center text-xs text-[#263746]/70">
        Loading Centralized CMS Workspace...
      </div>
    );
  }

  const SUB_TABS: Array<{ id: CmsStudioSubSection; label: string; icon: React.ReactNode }> = [
    { id: 'banners', label: 'Banners & Promos', icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'services', label: 'Services Content', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'project_gallery', label: 'Project Categories & Video', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'store_content', label: 'Store Marketing Copy', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
    { id: 'contact_footer', label: 'Contact, Social & Footer', icon: <Mail className="w-3.5 h-3.5" /> },
    { id: 'seo', label: 'SEO Management', icon: <Search className="w-3.5 h-3.5" /> },
    { id: 'revisions', label: 'Revision History', icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6 text-xs">
      {/* Top Draft / Preview / Publish Workflow Bar */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-bold text-[#123B5D]">
            <Sparkles className="w-5 h-5 text-[#42A5F5]" /> Centralized Website Content Studio
          </div>
          <p className="text-xs text-[#263746]/80 mt-0.5">
            Save drafts safely, preview before going live, publish across all pages, or restore previous snapshots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/website-editor')}
            className="px-3.5 py-2 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[#42A5F5]" /> Visual Page Builder
          </button>
          <a
            href="/?previewDraft=true"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#42A5F5]" /> Preview Draft
          </a>
          <button
            type="button"
            disabled={saving}
            onClick={handleDiscardDraft}
            className="px-3 py-2 border border-[#DCEAF5] text-[#263746] hover:bg-[#F0F8FF] rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" /> Discard Draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveDraft}
            className="px-4 py-2 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Save Draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handlePublishLive}
            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> {saving ? 'Publishing...' : 'Publish Live'}
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl border border-[#DCEAF5] bg-white">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSection(t.id)}
            className={`px-3 py-2 rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              section === t.id
                ? 'bg-[#64B5F6] text-white'
                : 'text-[#263746] hover:bg-[#F0F8FF] hover:text-[#123B5D]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ==================== 1. ABOUT US & COMPANY MEDIA GALLERY ==================== */}
      {section === 'about_us' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <h3 className="font-display text-base font-bold text-[#123B5D]">About Us Hero &amp; Company Overview</h3>
              <button
                type="button"
                onClick={() => navigate('/about')}
                className="text-[#42A5F5] font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View /about
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Hero Eyebrow / Location Line</label>
                <input
                  value={bundle.aboutUs.heroKicker}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, heroKicker: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Hero Headline / Tagline</label>
                <input
                  value={bundle.aboutUs.heroTitle}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, heroTitle: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-[#123B5D]">Hero Introduction Paragraph</label>
                <textarea
                  rows={2}
                  value={bundle.aboutUs.heroDescription}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, heroDescription: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Hero Photograph URL</label>
                <div className="flex gap-2">
                  <input
                    value={bundle.aboutUs.heroImageUrl}
                    onChange={(e) =>
                      setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, heroImageUrl: e.target.value } })
                    }
                    className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openPicker('Select About Us Hero Photo', 'image', 'Company Branding', (asset) =>
                        setBundle((b) => (b ? { ...b, aboutUs: { ...b.aboutUs, heroImageUrl: asset.url } } : b))
                      )
                    }
                    className="px-3 py-2 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#42A5F5]" /> Library
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#263746]">Hero Company Video URL (Optional)</label>
                <div className="flex gap-2">
                  <input
                    value={bundle.aboutUs.heroVideoUrl || ''}
                    onChange={(e) =>
                      setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, heroVideoUrl: e.target.value } })
                    }
                    placeholder="Upload MP4/WebM via Library or paste video URL"
                    className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openPicker('Select About Us Showcase Video', 'video', 'Promotional Videos', (asset) =>
                        setBundle((b) => (b ? { ...b, aboutUs: { ...b.aboutUs, heroVideoUrl: asset.url } } : b))
                      )
                    }
                    className="px-3 py-2 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    <Film className="w-3.5 h-3.5 text-[#42A5F5]" /> Video
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Overview Paragraphs, History, Vision & Mission */}
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#123B5D]">Company Profile, History, Vision &amp; Mission</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Company Overview Title</label>
                <input
                  value={bundle.aboutUs.overviewTitle}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, overviewTitle: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Company History Title</label>
                <input
                  value={bundle.aboutUs.historyTitle}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, historyTitle: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-[#123B5D]">Company Overview Paragraphs (blank line separates paragraphs)</label>
                <textarea
                  rows={4}
                  value={(bundle.aboutUs.overviewParagraphs || []).join('\n\n')}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      aboutUs: {
                        ...bundle.aboutUs,
                        overviewParagraphs: e.target.value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
                      },
                    })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-[#123B5D]">Company History Narrative</label>
                <textarea
                  rows={2}
                  value={bundle.aboutUs.historyDescription}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, historyDescription: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Vision Title</label>
                <input
                  value={bundle.aboutUs.visionTitle}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, visionTitle: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Mission Title</label>
                <input
                  value={bundle.aboutUs.missionTitle}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, missionTitle: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Vision Statement</label>
                <textarea
                  rows={3}
                  value={bundle.aboutUs.visionDescription}
                  onChange={(e) =>
                    setBundle({ ...bundle, aboutUs: { ...bundle.aboutUs, visionDescription: e.target.value } })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#123B5D]">Mission Focus Points (one per line)</label>
                <textarea
                  rows={4}
                  value={(bundle.aboutUs.missionPoints || []).join('\n')}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      aboutUs: {
                        ...bundle.aboutUs,
                        missionPoints: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
                      },
                    })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Core Verticals */}
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#123B5D]">Core Business Verticals ({bundle.aboutUs.verticals.length})</h3>
              <button
                type="button"
                onClick={() =>
                  setBundle({
                    ...bundle,
                    aboutUs: {
                      ...bundle.aboutUs,
                      verticals: [
                        ...bundle.aboutUs.verticals,
                        {
                          num: String(bundle.aboutUs.verticals.length + 1).padStart(2, '0'),
                          title: 'New Business Vertical',
                          description: '',
                          imageUrl: '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
                          groupLabel: 'Capabilities',
                          items: [],
                        },
                      ],
                    },
                  })
                }
                className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Vertical
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {bundle.aboutUs.verticals.map((vert, idx) => (
                <div key={idx} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[#42A5F5]">Vertical #{vert.num}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBundle({
                          ...bundle,
                          aboutUs: {
                            ...bundle.aboutUs,
                            verticals: bundle.aboutUs.verticals.filter((_, i) => i !== idx),
                          },
                        })
                      }
                      className="text-red-600 p-1 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={vert.title}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        aboutUs: {
                          ...bundle.aboutUs,
                          verticals: bundle.aboutUs.verticals.map((v, i) =>
                            i === idx ? { ...v, title: e.target.value } : v
                          ),
                        },
                      })
                    }
                    placeholder="Vertical Title"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-semibold"
                  />
                  <textarea
                    rows={2}
                    value={vert.description}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        aboutUs: {
                          ...bundle.aboutUs,
                          verticals: bundle.aboutUs.verticals.map((v, i) =>
                            i === idx ? { ...v, description: e.target.value } : v
                          ),
                        },
                      })
                    }
                    placeholder="Description"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <div className="flex gap-2">
                    <input
                      value={vert.imageUrl}
                      onChange={(e) =>
                        setBundle({
                          ...bundle,
                          aboutUs: {
                            ...bundle.aboutUs,
                            verticals: bundle.aboutUs.verticals.map((v, i) =>
                              i === idx ? { ...v, imageUrl: e.target.value } : v
                            ),
                          },
                        })
                      }
                      placeholder="Image URL"
                      className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openPicker(`Image for ${vert.title}`, 'image', 'Manufacturing', (asset) =>
                          setBundle((b) =>
                            b
                              ? {
                                  ...b,
                                  aboutUs: {
                                    ...b.aboutUs,
                                    verticals: b.aboutUs.verticals.map((v, i) =>
                                      i === idx ? { ...v, imageUrl: asset.url } : v
                                    ),
                                  },
                                }
                              : b
                          )
                        )
                      }
                      className="px-2.5 py-1.5 border border-[#DCEAF5] bg-white rounded font-semibold"
                    >
                      Pick
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={(vert.items || []).join('\n')}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        aboutUs: {
                          ...bundle.aboutUs,
                          verticals: bundle.aboutUs.verticals.map((v, i) =>
                            i === idx
                              ? { ...v, items: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }
                              : v
                          ),
                        },
                      })
                    }
                    placeholder="Bullet items (one per line)"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Company Media Gallery (Photos & Videos) */}
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-[#123B5D]">
                  Company Photographs &amp; Videos Gallery ({(bundle.aboutUs.companyMediaGallery || []).length})
                </h3>
                <p className="text-[11px] text-[#263746]/70">
                  Displayed on the About Us page to showcase manufacturing, field drone trials, and R&amp;D events.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Add Photo or Video to Company Gallery', 'all', 'Company Events', (asset) => {
                      const isVid =
                        asset.mediaKind === 'video' ||
                        String(asset.mimeType || '').startsWith('video/') ||
                        /\.(mp4|webm|mov|m4v)(\?|$)/i.test(asset.url);
                      setBundle((b) =>
                        b
                          ? {
                              ...b,
                              aboutUs: {
                                ...b.aboutUs,
                                companyMediaGallery: [
                                  ...(b.aboutUs.companyMediaGallery || []),
                                  {
                                    id: `gal-${Date.now()}`,
                                    title: asset.title || asset.fileName,
                                    caption: asset.description || asset.altText || '',
                                    mediaType: isVid ? 'video' : 'image',
                                    url: asset.url,
                                    thumbnailUrl: asset.thumbnailUrl || '',
                                  },
                                ],
                              },
                            }
                          : b
                      );
                    })
                  }
                  className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add from Media Library
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(bundle.aboutUs.companyMediaGallery || []).map((item, idx) => (
                <div key={item.id || idx} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-3 space-y-2">
                  <div className="aspect-[16/9] rounded-lg overflow-hidden bg-[#123B5D]">
                    {item.mediaType === 'video' ? (
                      <video src={item.url} controls playsInline preload="metadata" className="w-full h-full object-cover" />
                    ) : (
                      <img src={item.url} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <input
                    value={item.title}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        aboutUs: {
                          ...bundle.aboutUs,
                          companyMediaGallery: bundle.aboutUs.companyMediaGallery.map((g, i) =>
                            i === idx ? { ...g, title: e.target.value } : g
                          ),
                        },
                      })
                    }
                    placeholder="Title"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-semibold"
                  />
                  <input
                    value={item.caption}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        aboutUs: {
                          ...bundle.aboutUs,
                          companyMediaGallery: bundle.aboutUs.companyMediaGallery.map((g, i) =>
                            i === idx ? { ...g, caption: e.target.value } : g
                          ),
                        },
                      })
                    }
                    placeholder="Caption"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-[10px] text-[#263746]/70 uppercase">{item.mediaType}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBundle({
                          ...bundle,
                          aboutUs: {
                            ...bundle.aboutUs,
                            companyMediaGallery: bundle.aboutUs.companyMediaGallery.filter((_, i) => i !== idx),
                          },
                        })
                      }
                      className="text-red-600 text-[11px] font-semibold inline-flex items-center gap-1 hover:underline"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. WEBSITE BANNERS & PROMOTIONS ==================== */}
      {section === 'banners' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-bold text-[#123B5D]">
                Promotional Banners &amp; Video Hero Slots ({banners.length})
              </h3>
              <p className="text-[11px] text-[#263746]/70">
                Create, edit, publish, unpublish, or reorder promotional image &amp; video banners across Homepage, KRASHIVANTRI, Services, Store, and About Us.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBannerForm({ ...EMPTY_BANNER, sortOrder: banners.length + 1 });
                setEditingBannerOpen(true);
              }}
              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Banner
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {banners.map((ban) => (
              <div key={ban.id} className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="aspect-[16/7] bg-[#123B5D] overflow-hidden relative">
                    {ban.videoUrl ? (
                      <video src={ban.videoUrl} poster={ban.imageUrl || undefined} controls playsInline className="w-full h-full object-cover" />
                    ) : ban.imageUrl ? (
                      <img src={ban.imageUrl} alt={ban.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : null}
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded bg-[#123B5D]/85 text-white font-mono text-[10px]">
                      {BANNER_PLACEMENTS.find((p) => p.id === ban.placement)?.label || ban.placement}
                    </div>
                  </div>
                  <div className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[#263746]/70">Order #{ban.sortOrder}</span>
                      <span className={ban.isActive && ban.status === 'published' ? 'text-[#42A5F5] font-semibold' : 'text-amber-700 font-semibold'}>
                        {ban.isActive && ban.status === 'published' ? 'Published Active' : 'Draft / Inactive'}
                      </span>
                    </div>
                    <h4 className="font-display font-bold text-base text-[#123B5D]">{ban.title}</h4>
                    <p className="text-[#263746]/80 line-clamp-2">{ban.subtitle}</p>
                    <div className="font-mono text-[11px] text-[#263746]/70 pt-1">
                      CTA: &ldquo;{ban.ctaLabel}&rdquo; → {ban.ctaLink}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[#DCEAF5] bg-[#F0F8FF] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBannerForm(ban);
                      setEditingBannerOpen(true);
                    }}
                    className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold hover:bg-[#F0F8FF]"
                  >
                    Edit Banner
                  </button>
                  <button
                    type="button"
                    onClick={() => ban.id && handleDeleteBanner(ban.id)}
                    className="px-3 py-1.5 border border-red-200 text-red-700 bg-white rounded-lg font-semibold hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {editingBannerOpen && (
            <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
              <form
                onSubmit={handleSaveBanner}
                className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5]"
              >
                <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
                  <h3 className="font-display text-base font-bold text-[#123B5D]">
                    {bannerForm.id ? 'Edit Website Banner' : 'Create Website Banner'}
                  </h3>
                  <button type="button" onClick={() => setEditingBannerOpen(false)} className="p-1 text-[#263746]/70">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">Banner Title *</label>
                    <input
                      required
                      value={bannerForm.title}
                      onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">Subtitle / Description</label>
                    <textarea
                      rows={2}
                      value={bannerForm.subtitle}
                      onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">Website Placement Slot</label>
                    <select
                      value={bannerForm.placement}
                      onChange={(e) => setBannerForm({ ...bannerForm, placement: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2"
                    >
                      {BANNER_PLACEMENTS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">Publishing Status</label>
                    <select
                      value={bannerForm.status}
                      onChange={(e) =>
                        setBannerForm({
                          ...bannerForm,
                          status: e.target.value,
                          isActive: e.target.value === 'published',
                        })
                      }
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2"
                    >
                      <option value="published">Published Active</option>
                      <option value="draft">Draft (Inactive)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">Banner Image URL</label>
                    <div className="flex gap-2">
                      <input
                        value={bannerForm.imageUrl}
                        onChange={(e) => setBannerForm({ ...bannerForm, imageUrl: e.target.value })}
                        className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          openPicker('Select Banner Image', 'image', 'Banners', (asset) =>
                            setBannerForm((prev) => ({ ...prev, imageUrl: asset.url }))
                          )
                        }
                        className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                      >
                        Library
                      </button>
                    </div>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">Optional Video URL</label>
                    <div className="flex gap-2">
                      <input
                        value={bannerForm.videoUrl || ''}
                        onChange={(e) => setBannerForm({ ...bannerForm, videoUrl: e.target.value })}
                        className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          openPicker('Select Banner Video', 'video', 'Promotional Videos', (asset) =>
                            setBannerForm((prev) => ({ ...prev, videoUrl: asset.url }))
                          )
                        }
                        className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                      >
                        Video
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">CTA Button Label</label>
                    <input
                      value={bannerForm.ctaLabel}
                      onChange={(e) => setBannerForm({ ...bannerForm, ctaLabel: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">CTA Target Path</label>
                    <input
                      value={bannerForm.ctaLink}
                      onChange={(e) => setBannerForm({ ...bannerForm, ctaLink: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#DCEAF5]">
                  <button
                    type="button"
                    onClick={() => setEditingBannerOpen(false)}
                    className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Banner'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ==================== 3. SERVICES CONTENT CMS ==================== */}
      {section === 'services' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <h3 className="font-display text-base font-bold text-[#123B5D]">Services Page Hero &amp; Banner Media</h3>
              <button
                type="button"
                onClick={() => navigate('/services')}
                className="text-[#42A5F5] font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View /services
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={bundle.services.heroKicker}
                onChange={(e) =>
                  setBundle({ ...bundle, services: { ...bundle.services, heroKicker: e.target.value } })
                }
                placeholder="Services Kicker"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.services.heroTitle}
                onChange={(e) =>
                  setBundle({ ...bundle, services: { ...bundle.services, heroTitle: e.target.value } })
                }
                placeholder="Services Hero Title"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <textarea
                rows={2}
                value={bundle.services.heroDescription}
                onChange={(e) =>
                  setBundle({ ...bundle, services: { ...bundle.services, heroDescription: e.target.value } })
                }
                placeholder="Services Hero Description"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <div className="flex gap-2">
                <input
                  value={bundle.services.bannerImageUrl || ''}
                  onChange={(e) =>
                    setBundle({ ...bundle, services: { ...bundle.services, bannerImageUrl: e.target.value } })
                  }
                  placeholder="Services Banner Image URL"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Select Services Banner Image', 'image', 'Services', (asset) =>
                      setBundle((b) => (b ? { ...b, services: { ...b.services, bannerImageUrl: asset.url } } : b))
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Library
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={bundle.services.bannerVideoUrl || ''}
                  onChange={(e) =>
                    setBundle({ ...bundle, services: { ...bundle.services, bannerVideoUrl: e.target.value } })
                  }
                  placeholder="Services Demo Video URL (optional)"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Select Services Demo Video', 'video', 'Promotional Videos', (asset) =>
                      setBundle((b) => (b ? { ...b, services: { ...b.services, bannerVideoUrl: asset.url } } : b))
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Video
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {bundle.services.services.map((svc, idx) => (
              <div key={svc.slug || idx} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3">
                <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-2">
                  <span className="font-mono font-bold text-[#42A5F5]">/{svc.slug}</span>
                  <label className="inline-flex items-center gap-1.5 font-semibold">
                    <input
                      type="checkbox"
                      checked={svc.visible}
                      onChange={(e) =>
                        setBundle({
                          ...bundle,
                          services: {
                            ...bundle.services,
                            services: bundle.services.services.map((s, i) =>
                              i === idx ? { ...s, visible: e.target.checked } : s
                            ),
                          },
                        })
                      }
                    />
                    Visible on Site
                  </label>
                </div>

                <input
                  value={svc.title}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      services: {
                        ...bundle.services,
                        services: bundle.services.services.map((s, i) =>
                          i === idx ? { ...s, title: e.target.value } : s
                        ),
                      },
                    })
                  }
                  placeholder="Service Title"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-semibold"
                />
                <textarea
                  rows={2}
                  value={svc.shortDesc}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      services: {
                        ...bundle.services,
                        services: bundle.services.services.map((s, i) =>
                          i === idx ? { ...s, shortDesc: e.target.value } : s
                        ),
                      },
                    })
                  }
                  placeholder="Short Description"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
                <textarea
                  rows={2}
                  value={svc.fullDesc || ''}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      services: {
                        ...bundle.services,
                        services: bundle.services.services.map((s, i) =>
                          i === idx ? { ...s, fullDesc: e.target.value } : s
                        ),
                      },
                    })
                  }
                  placeholder="Detailed Technical Description"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
                <div className="flex gap-2">
                  <input
                    value={svc.imageUrl || ''}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        services: {
                          ...bundle.services,
                          services: bundle.services.services.map((s, i) =>
                            i === idx ? { ...s, imageUrl: e.target.value } : s
                          ),
                        },
                      })
                    }
                    placeholder="Service Photograph URL"
                    className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openPicker(`Photo for ${svc.title}`, 'image', 'Services', (asset) =>
                        setBundle((b) =>
                          b
                            ? {
                                ...b,
                                services: {
                                  ...b.services,
                                  services: b.services.services.map((s, i) =>
                                    i === idx ? { ...s, imageUrl: asset.url } : s
                                  ),
                                },
                              }
                            : b
                        )
                      )
                    }
                    className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                  >
                    Image
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={svc.videoUrl || ''}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        services: {
                          ...bundle.services,
                          services: bundle.services.services.map((s, i) =>
                            i === idx ? { ...s, videoUrl: e.target.value } : s
                          ),
                        },
                      })
                    }
                    placeholder="Service Video URL (optional)"
                    className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openPicker(`Video for ${svc.title}`, 'video', 'Promotional Videos', (asset) =>
                        setBundle((b) =>
                          b
                            ? {
                                ...b,
                                services: {
                                  ...b.services,
                                  services: b.services.services.map((s, i) =>
                                    i === idx ? { ...s, videoUrl: asset.url } : s
                                  ),
                                },
                              }
                            : b
                        )
                      )
                    }
                    className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                  >
                    Video
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={svc.ctaLabel || ''}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        services: {
                          ...bundle.services,
                          services: bundle.services.services.map((s, i) =>
                            i === idx ? { ...s, ctaLabel: e.target.value } : s
                          ),
                        },
                      })
                    }
                    placeholder="CTA Label"
                    className="rounded-lg border border-[#DCEAF5] px-3 py-2"
                  />
                  <input
                    value={svc.ctaLink || ''}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        services: {
                          ...bundle.services,
                          services: bundle.services.services.map((s, i) =>
                            i === idx ? { ...s, ctaLink: e.target.value } : s
                          ),
                        },
                      })
                    }
                    placeholder="CTA Route Link"
                    className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                  />
                </div>
                <textarea
                  rows={3}
                  value={(svc.benefits || []).join('\n')}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      services: {
                        ...bundle.services,
                        services: bundle.services.services.map((s, i) =>
                          i === idx
                            ? { ...s, benefits: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }
                            : s
                        ),
                      },
                    })
                  }
                  placeholder="Key Benefits (one per line)"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
                <textarea
                  rows={3}
                  value={(svc.capabilities || []).join('\n')}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      services: {
                        ...bundle.services,
                        services: bundle.services.services.map((s, i) =>
                          i === idx
                            ? { ...s, capabilities: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }
                            : s
                        ),
                      },
                    })
                  }
                  placeholder="Technical Capabilities (one per line)"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== 4. PROJECT GALLERY & CATEGORIES CMS ==================== */}
      {section === 'project_gallery' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <h3 className="font-display text-base font-bold text-[#123B5D]">
                Project Development Showcase &amp; Demonstration Video
              </h3>
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="text-[#42A5F5] font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View /projects
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={bundle.projectGallery.heroKicker}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    projectGallery: { ...bundle.projectGallery, heroKicker: e.target.value },
                  })
                }
                placeholder="Eyebrow Label"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.projectGallery.heroTitle}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    projectGallery: { ...bundle.projectGallery, heroTitle: e.target.value },
                  })
                }
                placeholder="Gallery Page Heading"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <textarea
                rows={2}
                value={bundle.projectGallery.heroDescription}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    projectGallery: { ...bundle.projectGallery, heroDescription: e.target.value },
                  })
                }
                placeholder="Project Development Description"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <div className="flex gap-2">
                <input
                  value={bundle.projectGallery.bannerImageUrl || ''}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      projectGallery: { ...bundle.projectGallery, bannerImageUrl: e.target.value },
                    })
                  }
                  placeholder="Showcase Banner Photo URL"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Project Showcase Photo', 'image', 'Engineering Projects', (asset) =>
                      setBundle((b) =>
                        b ? { ...b, projectGallery: { ...b.projectGallery, bannerImageUrl: asset.url } } : b
                      )
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Library
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={bundle.projectGallery.featuredVideoUrl || ''}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      projectGallery: { ...bundle.projectGallery, featuredVideoUrl: e.target.value },
                    })
                  }
                  placeholder="Featured Demonstration Video URL"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Project Demonstration Video', 'video', 'Promotional Videos', (asset) =>
                      setBundle((b) =>
                        b ? { ...b, projectGallery: { ...b.projectGallery, featuredVideoUrl: asset.url } } : b
                      )
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Video
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#123B5D]">
                Project Engineering Categories ({bundle.projectGallery.categories.length})
              </h3>
              <button
                type="button"
                onClick={() =>
                  setBundle({
                    ...bundle,
                    projectGallery: {
                      ...bundle.projectGallery,
                      categories: [
                        ...bundle.projectGallery.categories,
                        { id: `pcat-${Date.now()}`, name: 'New Engineering Domain', description: '', imageUrl: '' },
                      ],
                    },
                  })
                }
                className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Category
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bundle.projectGallery.categories.map((cat, idx) => (
                <div key={cat.id} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[11px] text-[#42A5F5]">Category {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBundle({
                          ...bundle,
                          projectGallery: {
                            ...bundle.projectGallery,
                            categories: bundle.projectGallery.categories.filter((_, i) => i !== idx),
                          },
                        })
                      }
                      className="text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={cat.name}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        projectGallery: {
                          ...bundle.projectGallery,
                          categories: bundle.projectGallery.categories.map((c, i) =>
                            i === idx ? { ...c, name: e.target.value } : c
                          ),
                        },
                      })
                    }
                    placeholder="Category Name"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-semibold"
                  />
                  <textarea
                    rows={2}
                    value={cat.description}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        projectGallery: {
                          ...bundle.projectGallery,
                          categories: bundle.projectGallery.categories.map((c, i) =>
                            i === idx ? { ...c, description: e.target.value } : c
                          ),
                        },
                      })
                    }
                    placeholder="Technical overview"
                    className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <div className="flex gap-2">
                    <input
                      value={cat.imageUrl || ''}
                      onChange={(e) =>
                        setBundle({
                          ...bundle,
                          projectGallery: {
                            ...bundle.projectGallery,
                            categories: bundle.projectGallery.categories.map((c, i) =>
                              i === idx ? { ...c, imageUrl: e.target.value } : c
                            ),
                          },
                        })
                      }
                      placeholder="Category Photo URL"
                      className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openPicker(`Photo for ${cat.name}`, 'image', 'Engineering Projects', (asset) =>
                          setBundle((b) =>
                            b
                              ? {
                                  ...b,
                                  projectGallery: {
                                    ...b.projectGallery,
                                    categories: b.projectGallery.categories.map((c, i) =>
                                      i === idx ? { ...c, imageUrl: asset.url } : c
                                    ),
                                  },
                                }
                              : b
                          )
                        )
                      }
                      className="px-2.5 py-1.5 border border-[#DCEAF5] bg-white rounded font-semibold"
                    >
                      Pick
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 5. STORE CONTENT & PROMOTIONAL BANNERS ==================== */}
      {section === 'store_content' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-4 flex items-center gap-3 text-[#123B5D]">
            <CheckCircle2 className="w-5 h-5 text-[#42A5F5] shrink-0" />
            <span>
              <strong>Transactional Safeguard Active:</strong> Editing Store marketing banners and category copy here will never alter product SKU pricing, GST rates, stock quantities, Razorpay checkout, or existing customer orders.
            </span>
          </div>

          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <h3 className="font-display text-base font-bold text-[#123B5D]">Store Promotional Banner</h3>
              <label className="inline-flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={bundle.storeContent.promoBannerEnabled}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      storeContent: { ...bundle.storeContent, promoBannerEnabled: e.target.checked },
                    })
                  }
                />
                Show Promotional Banner on /store
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={bundle.storeContent.promoBannerKicker}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    storeContent: { ...bundle.storeContent, promoBannerKicker: e.target.value },
                  })
                }
                placeholder="Banner Kicker"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.storeContent.promoBannerTitle}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    storeContent: { ...bundle.storeContent, promoBannerTitle: e.target.value },
                  })
                }
                placeholder="Promotional Title"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <textarea
                rows={2}
                value={bundle.storeContent.promoBannerSubtitle}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    storeContent: { ...bundle.storeContent, promoBannerSubtitle: e.target.value },
                  })
                }
                placeholder="Marketing Description"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <div className="flex gap-2">
                <input
                  value={bundle.storeContent.promoBannerImageUrl}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      storeContent: { ...bundle.storeContent, promoBannerImageUrl: e.target.value },
                    })
                  }
                  placeholder="Banner Image URL"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Store Promotional Banner Image', 'image', 'Banners', (asset) =>
                      setBundle((b) =>
                        b ? { ...b, storeContent: { ...b.storeContent, promoBannerImageUrl: asset.url } } : b
                      )
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Library
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={bundle.storeContent.promoBannerVideoUrl || ''}
                  onChange={(e) =>
                    setBundle({
                      ...bundle,
                      storeContent: { ...bundle.storeContent, promoBannerVideoUrl: e.target.value },
                    })
                  }
                  placeholder="Optional Promo Video URL"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Store Promotional Video', 'video', 'Promotional Videos', (asset) =>
                      setBundle((b) =>
                        b ? { ...b, storeContent: { ...b.storeContent, promoBannerVideoUrl: asset.url } } : b
                      )
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Video
                </button>
              </div>
              <input
                value={bundle.storeContent.promoBannerCtaLabel}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    storeContent: { ...bundle.storeContent, promoBannerCtaLabel: e.target.value },
                  })
                }
                placeholder="CTA Button Label"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.storeContent.promoBannerCtaLink}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    storeContent: { ...bundle.storeContent, promoBannerCtaLink: e.target.value },
                  })
                }
                placeholder="CTA Link"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#123B5D]">Category Marketing Descriptions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(bundle.storeContent.categoryDescriptions || {}).map(([slug, desc]) => (
                <div key={slug} className="space-y-1">
                  <label className="font-mono text-[11px] font-semibold text-[#42A5F5]">/store/category/{slug}</label>
                  <textarea
                    rows={2}
                    value={desc}
                    onChange={(e) =>
                      setBundle({
                        ...bundle,
                        storeContent: {
                          ...bundle.storeContent,
                          categoryDescriptions: {
                            ...bundle.storeContent.categoryDescriptions,
                            [slug]: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 6. CONTACT, SOCIAL LINKS, FOOTER & ANNOUNCEMENT BAR ==================== */}
      {section === 'contact_footer' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#123B5D]">Contact Page &amp; Corporate Support Desk</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={bundle.contactFooter.contactHeroKicker}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, contactHeroKicker: e.target.value },
                  })
                }
                placeholder="Contact Hero Kicker"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.contactFooter.contactHeroTitle}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, contactHeroTitle: e.target.value },
                  })
                }
                placeholder="Contact Page Title"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <textarea
                rows={2}
                value={bundle.contactFooter.contactHeroSubtitle}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, contactHeroSubtitle: e.target.value },
                  })
                }
                placeholder="Contact Hero Subtitle"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={companyInfo.email}
                onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                placeholder="Official Company Email"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <input
                value={companyInfo.customerCareEmail || ''}
                onChange={(e) => setCompanyInfo({ ...companyInfo, customerCareEmail: e.target.value })}
                placeholder="Customer Support Email"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <input
                value={companyInfo.contactPhone}
                onChange={(e) => setCompanyInfo({ ...companyInfo, contactPhone: e.target.value })}
                placeholder="Support Phone Number"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <input
                value={companyInfo.businessHours}
                onChange={(e) => setCompanyInfo({ ...companyInfo, businessHours: e.target.value })}
                placeholder="Business Hours"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <textarea
                rows={2}
                value={companyInfo.address}
                onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                placeholder="Registered Office Address"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.contactFooter.googleMapsUrl}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, googleMapsUrl: e.target.value },
                  })
                }
                placeholder="Google Maps Location URL"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#123B5D]">Footer, Newsletter &amp; Social Media Links</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <textarea
                rows={2}
                value={bundle.contactFooter.footerDescription}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, footerDescription: e.target.value },
                  })
                }
                placeholder="Footer Company Summary"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.contactFooter.newsletterTitle}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, newsletterTitle: e.target.value },
                  })
                }
                placeholder="Newsletter Title"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={bundle.contactFooter.copyrightText}
                onChange={(e) =>
                  setBundle({
                    ...bundle,
                    contactFooter: { ...bundle.contactFooter, copyrightText: e.target.value },
                  })
                }
                placeholder="Copyright Notice"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={companyInfo.socialLinks?.linkedin || ''}
                onChange={(e) =>
                  setCompanyInfo({
                    ...companyInfo,
                    socialLinks: { ...companyInfo.socialLinks, linkedin: e.target.value },
                  })
                }
                placeholder="LinkedIn URL"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <input
                value={companyInfo.socialLinks?.youtube || ''}
                onChange={(e) =>
                  setCompanyInfo({
                    ...companyInfo,
                    socialLinks: { ...companyInfo.socialLinks, youtube: e.target.value },
                  })
                }
                placeholder="YouTube URL"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <input
                value={companyInfo.socialLinks?.instagram || ''}
                onChange={(e) =>
                  setCompanyInfo({
                    ...companyInfo,
                    socialLinks: { ...companyInfo.socialLinks, instagram: e.target.value },
                  })
                }
                placeholder="Instagram URL"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <input
                value={companyInfo.socialLinks?.github || ''}
                onChange={(e) =>
                  setCompanyInfo({
                    ...companyInfo,
                    socialLinks: { ...companyInfo.socialLinks, github: e.target.value },
                  })
                }
                placeholder="GitHub URL"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
            </div>

            <div className="border-t border-[#DCEAF5] pt-4 space-y-2.5">
              <label className="inline-flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={announcementBar.enabled}
                  onChange={(e) => setAnnouncementBar({ ...announcementBar, enabled: e.target.checked })}
                />
                Show Top Website Announcement Bar
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={announcementBar.text}
                  onChange={(e) => setAnnouncementBar({ ...announcementBar, text: e.target.value })}
                  placeholder="Announcement text"
                  className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
                <input
                  value={announcementBar.link}
                  onChange={(e) => setAnnouncementBar({ ...announcementBar, link: e.target.value })}
                  placeholder="/krashivantri"
                  className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 7. SEO MANAGEMENT ==================== */}
      {section === 'seo' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-[#123B5D]">Default Global SEO &amp; Social Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={seoConfig.defaultTitle}
                onChange={(e) => setSeoConfig({ ...seoConfig, defaultTitle: e.target.value })}
                placeholder="Default SEO Page Title"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={seoConfig.ga4MeasurementId || ''}
                onChange={(e) => setSeoConfig({ ...seoConfig, ga4MeasurementId: e.target.value })}
                placeholder="GA4 Measurement ID (G-XXXXXXXXXX)"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
              />
              <textarea
                rows={2}
                value={seoConfig.defaultDescription}
                onChange={(e) => setSeoConfig({ ...seoConfig, defaultDescription: e.target.value })}
                placeholder="Default Meta Description"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <input
                value={seoConfig.defaultKeywords || ''}
                onChange={(e) => setSeoConfig({ ...seoConfig, defaultKeywords: e.target.value })}
                placeholder="Default SEO Keywords (comma-separated)"
                className="rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
              <div className="flex gap-2">
                <input
                  value={seoConfig.defaultOgImageUrl || ''}
                  onChange={(e) => setSeoConfig({ ...seoConfig, defaultOgImageUrl: e.target.value })}
                  placeholder="Default Social OG Image URL"
                  className="flex-1 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    openPicker('Select Default OpenGraph Image', 'image', 'Company Branding', (asset) =>
                      setSeoConfig((prev) => ({ ...prev, defaultOgImageUrl: asset.url }))
                    )
                  }
                  className="px-3 py-2 border border-[#DCEAF5] rounded-lg font-semibold"
                >
                  Library
                </button>
              </div>
              <textarea
                rows={2}
                value={seoConfig.defaultSocialDescription || ''}
                onChange={(e) => setSeoConfig({ ...seoConfig, defaultSocialDescription: e.target.value })}
                placeholder="Default Social Sharing Description (OpenGraph)"
                className="md:col-span-2 rounded-lg border border-[#DCEAF5] px-3 py-2"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#123B5D]">
                Per-Page Route SEO Overrides ({(seoConfig.routes || []).length} Routes)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setSeoConfig({
                    ...seoConfig,
                    routes: [
                      ...(seoConfig.routes || []),
                      {
                        route: '/custom-route',
                        label: 'Custom Page',
                        title: '',
                        description: '',
                        keywords: '',
                        ogImageUrl: '',
                        socialDescription: '',
                      },
                    ],
                  })
                }
                className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Route SEO
              </button>
            </div>
            <div className="space-y-4">
              {(seoConfig.routes || []).map((r: SeoRouteEntry, idx: number) => (
                <div key={`${r.route}-${idx}`} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={r.label}
                        onChange={(e) =>
                          setSeoConfig({
                            ...seoConfig,
                            routes: (seoConfig.routes || []).map((x, i) =>
                              i === idx ? { ...x, label: e.target.value } : x
                            ),
                          })
                        }
                        className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1 font-semibold"
                      />
                      <input
                        value={r.route}
                        onChange={(e) =>
                          setSeoConfig({
                            ...seoConfig,
                            routes: (seoConfig.routes || []).map((x, i) =>
                              i === idx ? { ...x, route: e.target.value } : x
                            ),
                          })
                        }
                        className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1 font-mono text-[#42A5F5]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSeoConfig({
                          ...seoConfig,
                          routes: (seoConfig.routes || []).filter((_, i) => i !== idx),
                        })
                      }
                      className="text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <input
                      placeholder="SEO Page Title"
                      value={r.title}
                      onChange={(e) =>
                        setSeoConfig({
                          ...seoConfig,
                          routes: (seoConfig.routes || []).map((x, i) =>
                            i === idx ? { ...x, title: e.target.value } : x
                          ),
                        })
                      }
                      className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                    />
                    <input
                      placeholder="Keywords (comma-separated)"
                      value={r.keywords}
                      onChange={(e) =>
                        setSeoConfig({
                          ...seoConfig,
                          routes: (seoConfig.routes || []).map((x, i) =>
                            i === idx ? { ...x, keywords: e.target.value } : x
                          ),
                        })
                      }
                      className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                    />
                    <textarea
                      rows={2}
                      placeholder="Meta Description"
                      value={r.description}
                      onChange={(e) =>
                        setSeoConfig({
                          ...seoConfig,
                          routes: (seoConfig.routes || []).map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x
                          ),
                        })
                      }
                      className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                    />
                    <textarea
                      rows={2}
                      placeholder="Social OpenGraph Description"
                      value={r.socialDescription}
                      onChange={(e) =>
                        setSeoConfig({
                          ...seoConfig,
                          routes: (seoConfig.routes || []).map((x, i) =>
                            i === idx ? { ...x, socialDescription: e.target.value } : x
                          ),
                        })
                      }
                      className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                    />
                    <div className="flex gap-2">
                      <input
                        placeholder="OG Share Image URL"
                        value={r.ogImageUrl}
                        onChange={(e) =>
                          setSeoConfig({
                            ...seoConfig,
                            routes: (seoConfig.routes || []).map((x, i) =>
                              i === idx ? { ...x, ogImageUrl: e.target.value } : x
                            ),
                          })
                        }
                        className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          openPicker(`OG Image for ${r.route}`, 'image', 'Banners', (asset) =>
                            setSeoConfig((prev) => ({
                              ...prev,
                              routes: (prev.routes || []).map((x, i) =>
                                i === idx ? { ...x, ogImageUrl: asset.url } : x
                              ),
                            }))
                          )
                        }
                        className="px-2.5 py-1 border border-[#DCEAF5] bg-white rounded font-semibold"
                      >
                        Pick
                      </button>
                    </div>
                    <input
                      placeholder="Canonical URL (e.g. https://nexustekfusion.in/...)"
                      value={r.canonicalUrl || ''}
                      onChange={(e) =>
                        setSeoConfig({
                          ...seoConfig,
                          routes: (seoConfig.routes || []).map((x, i) =>
                            i === idx ? { ...x, canonicalUrl: e.target.value } : x
                          ),
                        })
                      }
                      className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 8. CMS REVISION HISTORY & ROLLBACK ==================== */}
      {section === 'revisions' && (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#123B5D]">
              CMS Revision History &amp; Rollback ({revisions.length})
            </h3>
            <p className="text-[11px] text-[#263746]/70">
              Every time you click &ldquo;Publish Live&rdquo;, a recoverable version snapshot is recorded here.
            </p>
          </div>
          {revisions.length === 0 ? (
            <div className="py-8 text-center text-[#263746]/70">
              No revisions saved yet. Click &ldquo;Publish Live&rdquo; above to create your first revision snapshot.
            </div>
          ) : (
            <div className="divide-y divide-[#DCEAF5] border border-[#DCEAF5] rounded-xl overflow-hidden">
              {revisions.map((rev) => (
                <div key={rev.id} className="p-4 flex flex-wrap items-center justify-between gap-3 bg-white hover:bg-[#F0F8FF]">
                  <div>
                    <div className="font-semibold text-[#123B5D]">{rev.label}</div>
                    <div className="font-mono text-[11px] text-[#263746]/70">
                      Target: {rev.targetKey} · Author: {rev.createdBy} · {new Date(rev.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleRollback(rev.id, false)}
                      className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Load to Draft
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleRollback(rev.id, true)}
                      className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      Restore Live Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shared Media Library Picker Modal */}
      {pickerState && (
        <MediaPickerModal
          open={pickerState.open}
          title={pickerState.title}
          filterKind={pickerState.filterKind}
          defaultCategory={pickerState.category}
          onClose={() => setPickerState(null)}
          onSelect={pickerState.onSelect}
        />
      )}
    </div>
  );
};
