import React, { useEffect, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Save,
  Send,
  RotateCcw,
  Plus,
  Trash2,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  RefreshCw,
  Undo2,
  Edit3,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getDashboardRouteForRole } from '../lib/rbac';
import {
  AndroidAppLinkConfig,
  CmsPageRecord,
  HomepageSectionConfig,
  KrashivantriModelConfig,
  SiteSettings,
} from '../types/platform';
import { MediaPickerModal } from '../components/admin/MediaLibraryPanel';

type EditorTab = 'sections' | 'krashivantri' | 'apps' | 'pages' | 'branding_seo' | 'revisions';

const PREVIEW_ROUTES = [
  { label: 'Homepage (Draft)', url: '/?previewDraft=true' },
  { label: 'KRASHIVANTRI', url: '/krashivantri?previewDraft=true' },
  { label: 'KRASHIVANTRI X', url: '/krashivantri-x?previewDraft=true' },
  { label: 'KRASHIVANTRI X PRO', url: '/krashivantri-x-pro?previewDraft=true' },
  { label: 'Services (Draft)', url: '/services?previewDraft=true' },
  { label: 'Hardware Store', url: '/shop?previewDraft=true' },
  { label: 'Projects Gallery', url: '/projects?previewDraft=true' },
  { label: 'Contact & Footer', url: '/contact?previewDraft=true' },
];

export const WebsiteEditorPage: React.FC = () => {
  const { isSignedIn, isAdmin, dbUser, signInWithSupabaseOAuth, apiFetch, notify, refreshBootstrap, navigate } = usePlatform();
  const [tab, setTab] = useState<EditorTab>('sections');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('/?previewDraft=true');

  const [sections, setSections] = useState<HomepageSectionConfig[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [pages, setPages] = useState<CmsPageRecord[]>([]);
  const [editingPage, setEditingPage] = useState<CmsPageRecord | null>(null);

  const [krashivantri, setKrashivantri] = useState<{
    platformName: string;
    summary: string;
    bannerImageUrl?: string;
    bannerVideoUrl?: string;
    models: KrashivantriModelConfig[];
  }>({ platformName: '', summary: '', bannerImageUrl: '', bannerVideoUrl: '', models: [] });

  const [appLinks, setAppLinks] = useState<AndroidAppLinkConfig[]>([]);
  const [announcement, setAnnouncement] = useState({ enabled: true, text: '', link: '', ctaLabel: '' });
  const [seoConfig, setSeoConfig] = useState<NonNullable<SiteSettings['seoConfig']>>({
    defaultTitle: '',
    defaultDescription: '',
    defaultKeywords: '',
    defaultOgImageUrl: '',
    defaultSocialDescription: '',
    ga4MeasurementId: '',
    routes: [],
  });

  const [newPageForm, setNewPageForm] = useState({ title: '', slug: '', heroHeadline: '', heroSubheadline: '' });

  const [pickerState, setPickerState] = useState<{
    title: string;
    filterKind: 'all' | 'image' | 'video';
    category: string;
    onSelect: (url: string) => void;
  } | null>(null);

  const loadEditorState = async () => {
    if (!isSignedIn || !isAdmin) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ settings: SiteSettings; pages: CmsPageRecord[]; revisions: any[] }>(
        '/api/admin/website-editor/state'
      );
      const s = res.settings || {};
      setSections(s.homepageLayout?.draft || s.homepageLayout?.published || []);
      setKrashivantri(
        s.krashivantriCatalog || { platformName: '', summary: '', bannerImageUrl: '', bannerVideoUrl: '', models: [] }
      );
      setAppLinks(s.appLinks || []);
      setAnnouncement(s.announcementBar || { enabled: true, text: '', link: '', ctaLabel: '' });
      setSeoConfig({
        defaultTitle: s.seoConfig?.defaultTitle || '',
        defaultDescription: s.seoConfig?.defaultDescription || '',
        defaultKeywords: s.seoConfig?.defaultKeywords || '',
        defaultOgImageUrl: s.seoConfig?.defaultOgImageUrl || '',
        defaultSocialDescription: s.seoConfig?.defaultSocialDescription || '',
        ga4MeasurementId: s.seoConfig?.ga4MeasurementId || '',
        routes: s.seoConfig?.routes || [],
      });
      setPages(res.pages || []);
      setRevisions(res.revisions || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load Website Editor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSignedIn || !isAdmin) {
      setSections([]);
      setPages([]);
      setRevisions([]);
      setLoading(false);
      return;
    }
    loadEditorState();
  }, [isSignedIn, isAdmin, dbUser?.role]);

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">Visual Website Editor</h1>
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate('/admin/login')} className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-sm font-semibold transition-colors">
            Admin Login
          </button>
          <button onClick={() => signInWithSupabaseOAuth('/admin/website-editor')} className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-sm font-semibold transition-colors">
            Google Admin Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-red-600">
          403 · Access Denied
        </div>
        <h1 className="font-display text-2xl font-bold text-[#123B5D]">Admin Access Required</h1>
        <p className="text-sm text-[#263746]/80">
          Signed in as <span className="font-mono">{dbUser?.email}</span> ({dbUser?.role || 'customer'}).
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate(getDashboardRouteForRole(dbUser?.role))}
            className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Return to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    const copy = [...sections];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    setSections(copy);
    setSelectedIdx(target);
  };

  const updateSelectedSection = (patch: Partial<HomepageSectionConfig>) => {
    setSections((prev) => prev.map((s, i) => (i === selectedIdx ? { ...s, ...patch } : s)));
  };

  const addCustomBlock = () => {
    const next: HomepageSectionConfig = {
      id: `custom_${Date.now()}`,
      type: 'custom_block',
      visible: true,
      kicker: 'ENGINEERING HIGHLIGHT',
      heading: 'New Content Section',
      subheading: 'Customize this heading, body text, highlights, image, or demonstration video.',
      body: '',
      primaryCtaLabel: 'Explore More',
      primaryCtaLink: '/krashivantri',
      imageUrl: '',
      videoUrl: '',
      customItems: [
        { title: 'Feature Highlight 01', body: 'Concise engineering capability or field milestone.' },
      ],
    };
    setSections((prev) => [...prev, next]);
    setSelectedIdx(sections.length);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/website-editor/draft', {
        method: 'PUT',
        body: JSON.stringify({ sections }),
      });
      setPreviewUrl('/?previewDraft=true');
      setPreviewKey((k) => k + 1);
      notify('Draft saved. Preview refreshed.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to save draft.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardDraft = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/cms/discard', { method: 'POST' });
      await loadEditorState();
      setPreviewKey((k) => k + 1);
      notify('Unpublished draft discarded and reset to Live published layout.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Discard draft failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/website-editor/publish', {
        method: 'POST',
        body: JSON.stringify({ sections, label: `Published ${new Date().toLocaleTimeString('en-IN')}` }),
      });
      await refreshBootstrap();
      setPreviewKey((k) => k + 1);
      loadEditorState();
      notify('Homepage layout published live!', 'success');
    } catch (err: any) {
      notify(err?.message || 'Publish failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (revisionId: number) => {
    setSaving(true);
    try {
      const res = await apiFetch<{ homepageLayout: { draft: HomepageSectionConfig[] } }>(
        `/api/admin/website-editor/rollback/${revisionId}`,
        { method: 'POST', body: JSON.stringify({ publishImmediately: false }) }
      );
      setSections(res.homepageLayout.draft || []);
      setPreviewKey((k) => k + 1);
      notify('Revision restored into Draft. Review Preview and click Publish Live.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Rollback failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomPage = async (publishNow: boolean, unpublish = false) => {
    if (!editingPage) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/website-editor/pages/${editingPage.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editingPage.title,
          seoTitle: editingPage.seoTitle,
          seoDescription: editingPage.seoDescription,
          draftContent: editingPage.draftContent,
          publish: publishNow,
          unpublish,
        }),
      });
      await loadEditorState();
      await refreshBootstrap();
      setPreviewUrl(`/p/${editingPage.slug}?preview=true`);
      setPreviewKey((k) => k + 1);
      notify(
        unpublish
          ? 'Page reverted to draft.'
          : publishNow
            ? 'Custom page published live!'
            : 'Custom page draft saved.',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Failed to save custom page.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selected = sections[selectedIdx];
  const previewWidthClass =
    viewport === 'mobile' ? 'max-w-[390px]' : viewport === 'tablet' ? 'max-w-[768px]' : 'w-full';

  return (
    <div className="min-h-screen bg-[#F0F8FF] flex flex-col">
      {/* Top Toolbar */}
      <div className="bg-white border-b border-[#DCEAF5] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] whitespace-nowrap shrink-0 transition-colors"
          >
            ← Admin Console
          </button>
          <div>
            <div className="font-display font-bold text-base text-[#123B5D]">Visual Website Editor</div>
            <div className="text-[11px] text-[#263746]/70">Draft · Live Preview · Publish · Discard · Rollback</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={previewUrl}
            onChange={(e) => {
              setPreviewUrl(e.target.value);
              setPreviewKey((k) => k + 1);
            }}
            aria-label="Preview Page Route"
            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-xs font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          >
            {PREVIEW_ROUTES.map((r) => (
              <option key={r.url} value={r.url}>
                {r.label}
              </option>
            ))}
            {pages.map((p) => (
              <option key={p.id} value={`/p/${p.slug}?preview=true`}>
                Custom: /p/{p.slug}
              </option>
            ))}
          </select>

          <div className="flex items-center border border-[#DCEAF5] rounded-lg p-0.5 bg-[#F0F8FF]">
            <button
              onClick={() => setViewport('desktop')}
              title="Desktop"
              className={`p-1.5 rounded transition-colors ${viewport === 'desktop' ? 'bg-[#64B5F6] shadow-sm text-white' : 'text-[#263746] hover:bg-white'}`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewport('tablet')}
              title="Tablet"
              className={`p-1.5 rounded transition-colors ${viewport === 'tablet' ? 'bg-[#64B5F6] shadow-sm text-white' : 'text-[#263746] hover:bg-white'}`}
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewport('mobile')}
              title="Mobile"
              className={`p-1.5 rounded transition-colors ${viewport === 'mobile' ? 'bg-[#64B5F6] shadow-sm text-white' : 'text-[#263746] hover:bg-white'}`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded-lg text-xs font-semibold text-[#123B5D] inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#42A5F5]" /> Refresh
          </button>

          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded-lg text-xs font-semibold text-[#123B5D] inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#42A5F5]" /> Open Preview
          </a>

          <button
            disabled={saving}
            onClick={handleDiscardDraft}
            className="px-3 py-2 border border-[#DCEAF5] bg-white text-[#263746] hover:bg-[#F0F8FF] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" /> Discard Draft
          </button>

          <button
            disabled={saving}
            onClick={handleSaveDraft}
            className="px-4 py-2 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#F0F8FF] disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <Save className="w-3.5 h-3.5 text-[#42A5F5]" /> Save Draft
          </button>

          <button
            disabled={saving}
            onClick={handlePublish}
            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Publish Live
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12">
        {/* Left Editor Panel */}
        <div className="xl:col-span-5 bg-white border-r border-[#DCEAF5] p-5 space-y-5 overflow-y-auto max-h-[calc(100vh-64px)]">
          <div className="flex flex-wrap gap-1 p-1 bg-[#F0F8FF] rounded-lg border border-[#DCEAF5] text-xs">
            {[
              ['sections', 'Homepage Sections'],
              ['krashivantri', 'KRASHIVANTRI'],
              ['apps', 'Android Apps'],
              ['pages', 'Custom Pages'],
              ['branding_seo', 'Banner & SEO'],
              ['revisions', 'Revisions'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k as EditorTab)}
                className={`px-2.5 py-1.5 rounded-md font-semibold whitespace-nowrap transition-colors ${
                  tab === k ? 'bg-[#64B5F6] text-white shadow-sm' : 'text-[#263746] hover:bg-white hover:text-[#123B5D]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-xs text-[#263746]/70">Loading editor state...</div>
          ) : (
            <>
              {tab === 'sections' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[#123B5D]">Section Order &amp; Visibility</div>
                      <button
                        type="button"
                        onClick={addCustomBlock}
                        className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded-md text-[11px] font-semibold text-[#123B5D] inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Plus className="w-3 h-3 text-[#42A5F5]" /> Add Content Block
                      </button>
                    </div>
                    <div className="divide-y divide-[#DCEAF5] border border-[#DCEAF5] rounded-xl overflow-hidden text-xs">
                      {sections.map((sec, idx) => (
                        <div
                          key={sec.id}
                          onClick={() => setSelectedIdx(idx)}
                          className={`px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            idx === selectedIdx ? 'bg-[#F0F8FF]' : 'bg-white hover:bg-[#F0F8FF]/50'
                          }`}
                        >
                          <div className="truncate font-medium text-[#123B5D]">
                            <span className="font-mono text-[11px] text-[#42A5F5] mr-2 tabular-nums">{idx + 1}.</span>
                            {sec.type} {sec.heading ? `— ${sec.heading}` : ''}
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setSections((prev) =>
                                  prev.map((s, i) => (i === idx ? { ...s, visible: !s.visible } : s))
                                );
                              }}
                              className="p-1 text-[#263746]/70 hover:text-[#123B5D]"
                              title={sec.visible ? 'Hide section' : 'Show section'}
                            >
                              {sec.visible ? <Eye className="w-3.5 h-3.5 text-[#42A5F5]" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => moveSection(idx, -1)}
                              className="p-1 text-[#263746]/70 hover:text-[#123B5D]"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveSection(idx, 1)}
                              className="p-1 text-[#263746]/70 hover:text-[#123B5D]"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            {sec.type === 'custom_block' && (
                              <button
                                onClick={() => {
                                  setSections((prev) => prev.filter((_, i) => i !== idx));
                                  setSelectedIdx(Math.max(0, idx - 1));
                                }}
                                className="p-1 text-red-600 hover:text-red-700"
                                title="Delete custom block"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selected && (
                    <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3 text-xs">
                      <div className="font-display font-bold text-sm text-[#123B5D]">
                        Edit Section: {selected.type}
                      </div>
                      <input
                        placeholder="Kicker / Eyebrow Label"
                        value={selected.kicker || ''}
                        onChange={(e) => updateSelectedSection({ kicker: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                      />
                      <input
                        placeholder="Section Heading"
                        value={selected.heading || ''}
                        onChange={(e) => updateSelectedSection({ heading: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                      />
                      <textarea
                        rows={2}
                        placeholder="Subheading"
                        value={selected.subheading || ''}
                        onChange={(e) => updateSelectedSection({ subheading: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                      />
                      <textarea
                        rows={2}
                        placeholder="Body Copy"
                        value={selected.body || ''}
                        onChange={(e) => updateSelectedSection({ body: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Primary CTA Label"
                          value={selected.primaryCtaLabel || ''}
                          onChange={(e) => updateSelectedSection({ primaryCtaLabel: e.target.value })}
                          className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                        />
                        <input
                          placeholder="Primary CTA Link"
                          value={selected.primaryCtaLink || ''}
                          onChange={(e) => updateSelectedSection({ primaryCtaLink: e.target.value })}
                          className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                        />
                        <input
                          placeholder="Secondary CTA Label"
                          value={selected.secondaryCtaLabel || ''}
                          onChange={(e) => updateSelectedSection({ secondaryCtaLabel: e.target.value })}
                          className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                        />
                        <input
                          placeholder="Secondary CTA Link"
                          value={selected.secondaryCtaLink || ''}
                          onChange={(e) => updateSelectedSection({ secondaryCtaLink: e.target.value })}
                          className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#123B5D]">Section Image URL</label>
                        <div className="flex gap-1.5">
                          <input
                            placeholder="Image URL"
                            value={selected.imageUrl || ''}
                            onChange={(e) => updateSelectedSection({ imageUrl: e.target.value })}
                            className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPickerState({
                                title: `Select Image for ${selected.type}`,
                                filterKind: 'image',
                                category: 'Banners',
                                onSelect: (url) => updateSelectedSection({ imageUrl: url }),
                              })
                            }
                            className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-[#42A5F5]" /> Media
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#123B5D]">Section Video URL (.mp4 / .webm)</label>
                        <div className="flex gap-1.5">
                          <input
                            placeholder="Optional Video URL"
                            value={selected.videoUrl || ''}
                            onChange={(e) => updateSelectedSection({ videoUrl: e.target.value })}
                            className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPickerState({
                                title: `Select Video for ${selected.type}`,
                                filterKind: 'video',
                                category: 'Promotional Videos',
                                onSelect: (url) => updateSelectedSection({ videoUrl: url }),
                              })
                            }
                            className="px-3 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Film className="w-3.5 h-3.5 text-[#42A5F5]" /> Video
                          </button>
                        </div>
                      </div>

                      {selected.type === 'custom_block' && (
                        <div className="pt-2 border-t border-[#DCEAF5] space-y-2">
                          <div className="flex items-center justify-between font-semibold text-[#123B5D]">
                            <span>Feature Cards ({(selected.customItems || []).length})</span>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedSection({
                                  customItems: [
                                    ...(selected.customItems || []),
                                    { title: 'New Highlight', body: 'Describe this highlight.' },
                                  ],
                                })
                              }
                              className="text-[#42A5F5] hover:text-[#123B5D] font-semibold inline-flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Add Item
                            </button>
                          </div>
                          {(selected.customItems || []).map((ci, ciIdx) => (
                            <div key={ciIdx} className="rounded-lg border border-[#DCEAF5] bg-white p-2.5 space-y-1.5">
                              <div className="flex gap-2 items-center">
                                <input
                                  placeholder="Item Title"
                                  value={ci.title}
                                  onChange={(e) =>
                                    updateSelectedSection({
                                      customItems: (selected.customItems || []).map((x, xi) =>
                                        xi === ciIdx ? { ...x, title: e.target.value } : x
                                      ),
                                    })
                                  }
                                  className="flex-1 rounded border border-[#DCEAF5] bg-white text-[#263746] px-2.5 py-1.5 font-semibold focus:outline-none focus:border-[#64B5F6]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSelectedSection({
                                      customItems: (selected.customItems || []).filter((_, xi) => xi !== ciIdx),
                                    })
                                  }
                                  className="p-1 text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                placeholder="Item Description"
                                value={ci.body}
                                onChange={(e) =>
                                  updateSelectedSection({
                                    customItems: (selected.customItems || []).map((x, xi) =>
                                      xi === ciIdx ? { ...x, body: e.target.value } : x
                                    ),
                                  })
                                }
                                className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] px-2.5 py-1.5 focus:outline-none focus:border-[#64B5F6]"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === 'krashivantri' && (
                <div className="space-y-4 text-xs">
                  <div className="font-display font-bold text-sm text-[#123B5D]">KRASHIVANTRI Platform &amp; Drone Models</div>
                  <input
                    placeholder="Platform Name"
                    value={krashivantri.platformName}
                    onChange={(e) => setKrashivantri({ ...krashivantri, platformName: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <textarea
                    rows={3}
                    placeholder="Platform Summary"
                    value={krashivantri.summary}
                    onChange={(e) => setKrashivantri({ ...krashivantri, summary: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <div className="flex gap-1.5">
                    <input
                      placeholder="Banner Image URL"
                      value={krashivantri.bannerImageUrl || ''}
                      onChange={(e) => setKrashivantri({ ...krashivantri, bannerImageUrl: e.target.value })}
                      className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPickerState({
                          title: 'Select KRASHIVANTRI Banner Image',
                          filterKind: 'image',
                          category: 'KRASHIVANTRI Products',
                          onSelect: (url) => setKrashivantri((prev) => ({ ...prev, bannerImageUrl: url })),
                        })
                      }
                      className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Media
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      placeholder="Showcase Video URL (.mp4 / .webm)"
                      value={krashivantri.bannerVideoUrl || ''}
                      onChange={(e) => setKrashivantri({ ...krashivantri, bannerVideoUrl: e.target.value })}
                      className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPickerState({
                          title: 'Select KRASHIVANTRI Demo Video',
                          filterKind: 'video',
                          category: 'KRASHIVANTRI Products',
                          onSelect: (url) => setKrashivantri((prev) => ({ ...prev, bannerVideoUrl: url })),
                        })
                      }
                      className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Video
                    </button>
                  </div>

                  {krashivantri.models.map((m, idx) => (
                    <div key={m.id} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
                      <div className="font-bold text-[#123B5D]">{m.name}</div>
                      <input
                        placeholder="Tagline"
                        value={m.tagline}
                        onChange={(e) =>
                          setKrashivantri({
                            ...krashivantri,
                            models: krashivantri.models.map((mm, i) => (i === idx ? { ...mm, tagline: e.target.value } : mm)),
                          })
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <div className="flex gap-1.5">
                        <input
                          placeholder="Model Image URL"
                          value={m.imageUrl || ''}
                          onChange={(e) =>
                            setKrashivantri({
                              ...krashivantri,
                              models: krashivantri.models.map((mm, i) => (i === idx ? { ...mm, imageUrl: e.target.value } : mm)),
                            })
                          }
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPickerState({
                              title: `Image for ${m.name}`,
                              filterKind: 'image',
                              category: 'KRASHIVANTRI Products',
                              onSelect: (url) =>
                                setKrashivantri((prev) => ({
                                  ...prev,
                                  models: prev.models.map((mm, i) => (i === idx ? { ...mm, imageUrl: url } : mm)),
                                })),
                            })
                          }
                          className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                        >
                          Media
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          placeholder="Model Demo Video URL (.mp4 / .webm)"
                          value={m.videoUrl || ''}
                          onChange={(e) =>
                            setKrashivantri({
                              ...krashivantri,
                              models: krashivantri.models.map((mm, i) => (i === idx ? { ...mm, videoUrl: e.target.value } : mm)),
                            })
                          }
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPickerState({
                              title: `Video for ${m.name}`,
                              filterKind: 'video',
                              category: 'KRASHIVANTRI Products',
                              onSelect: (url) =>
                                setKrashivantri((prev) => ({
                                  ...prev,
                                  models: prev.models.map((mm, i) => (i === idx ? { ...mm, videoUrl: url } : mm)),
                                })),
                            })
                          }
                          className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                        >
                          Video
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Model Summary"
                        value={m.summary}
                        onChange={(e) =>
                          setKrashivantri({
                            ...krashivantri,
                            models: krashivantri.models.map((mm, i) => (i === idx ? { ...mm, summary: e.target.value } : mm)),
                          })
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <div className="space-y-2">
                        <div className="flex justify-between items-center font-semibold text-[#123B5D]">
                          <span>Verified Technical Specs ({m.specs.length})</span>
                          <button
                            type="button"
                            onClick={() =>
                              setKrashivantri({
                                ...krashivantri,
                                models: krashivantri.models.map((mm, i) =>
                                  i === idx ? { ...mm, specs: [...mm.specs, { label: '', value: '' }] } : mm
                                ),
                              })
                            }
                            className="text-[#42A5F5] hover:text-[#123B5D] font-semibold inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Spec Row
                          </button>
                        </div>
                        {m.specs.map((sp, spIdx) => (
                          <div key={spIdx} className="flex gap-2">
                            <input
                              placeholder="Spec Label (e.g. Tank Capacity)"
                              value={sp.label}
                              onChange={(e) =>
                                setKrashivantri({
                                  ...krashivantri,
                                  models: krashivantri.models.map((mm, i) =>
                                    i === idx
                                      ? {
                                          ...mm,
                                          specs: mm.specs.map((s, si) => (si === spIdx ? { ...s, label: e.target.value } : s)),
                                        }
                                      : mm
                                  ),
                                })
                              }
                              className="flex-1 rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                            <input
                              placeholder="Verified Value"
                              value={sp.value}
                              onChange={(e) =>
                                setKrashivantri({
                                  ...krashivantri,
                                  models: krashivantri.models.map((mm, i) =>
                                    i === idx
                                      ? {
                                          ...mm,
                                          specs: mm.specs.map((s, si) => (si === spIdx ? { ...s, value: e.target.value } : s)),
                                        }
                                      : mm
                                  ),
                                })
                              }
                              className="flex-1 rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setKrashivantri({
                                  ...krashivantri,
                                  models: krashivantri.models.map((mm, i) =>
                                    i === idx ? { ...mm, specs: mm.specs.filter((_, si) => si !== spIdx) } : mm
                                  ),
                                })
                              }
                              className="p-1.5 text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={async () => {
                      await apiFetch('/api/admin/settings/krashivantriCatalog', {
                        method: 'PUT',
                        body: JSON.stringify({ value: krashivantri }),
                      });
                      await refreshBootstrap();
                      setPreviewUrl('/krashivantri?previewDraft=true');
                      setPreviewKey((k) => k + 1);
                      notify('KRASHIVANTRI catalog updated.', 'success');
                    }}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg transition-colors"
                  >
                    Save KRASHIVANTRI Catalog
                  </button>
                </div>
              )}

              {tab === 'apps' && (
                <div className="space-y-4 text-xs">
                  <div className="font-display font-bold text-sm text-[#123B5D]">Farmer, Drone Pilot &amp; Buyer Android Apps</div>
                  {appLinks.map((app, idx) => (
                    <div key={app.id} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-2.5">
                      <div className="font-bold text-[#123B5D]">{app.name}</div>
                      <label className="flex items-center gap-2 font-medium text-[#263746]">
                        <input
                          type="checkbox"
                          className="accent-[#64B5F6]"
                          checked={app.comingSoon}
                          onChange={(e) =>
                            setAppLinks(appLinks.map((a, i) => (i === idx ? { ...a, comingSoon: e.target.checked } : a)))
                          }
                        />
                        Show &quot;Coming Soon on Google Play&quot;
                      </label>
                      <input
                        placeholder="Google Play Store URL"
                        value={app.playStoreUrl}
                        onChange={(e) =>
                          setAppLinks(appLinks.map((a, i) => (i === idx ? { ...a, playStoreUrl: e.target.value } : a)))
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <input
                        placeholder="Direct APK URL (optional)"
                        value={app.apkDownloadUrl || ''}
                        onChange={(e) =>
                          setAppLinks(appLinks.map((a, i) => (i === idx ? { ...a, apkDownloadUrl: e.target.value } : a)))
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                  ))}
                  <button
                    onClick={async () => {
                      await apiFetch('/api/admin/settings/appLinks', {
                        method: 'PUT',
                        body: JSON.stringify({ value: appLinks }),
                      });
                      await refreshBootstrap();
                      setPreviewKey((k) => k + 1);
                      notify('Android app links saved.', 'success');
                    }}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg transition-colors"
                  >
                    Save Android App Links
                  </button>
                </div>
              )}

              {tab === 'pages' && (
                <div className="space-y-5 text-xs">
                  {editingPage ? (
                    <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/60 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-2">
                        <div>
                          <div className="font-display font-bold text-sm text-[#123B5D]">Edit Page: /p/{editingPage.slug}</div>
                          <div className="text-[11px] text-[#263746]/70">Status: {editingPage.status}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingPage(null)}
                          className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold"
                        >
                          Back to List
                        </button>
                      </div>

                      <input
                        placeholder="Page Title"
                        value={editingPage.title}
                        onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-semibold text-[#123B5D] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <input
                        placeholder="SEO Title"
                        value={editingPage.seoTitle || ''}
                        onChange={(e) => setEditingPage({ ...editingPage, seoTitle: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <textarea
                        rows={2}
                        placeholder="SEO Meta Description"
                        value={editingPage.seoDescription || ''}
                        onChange={(e) => setEditingPage({ ...editingPage, seoDescription: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <input
                        placeholder="Hero Headline"
                        value={editingPage.draftContent.heroHeadline || ''}
                        onChange={(e) =>
                          setEditingPage({
                            ...editingPage,
                            draftContent: { ...editingPage.draftContent, heroHeadline: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <textarea
                        rows={2}
                        placeholder="Hero Subheadline"
                        value={editingPage.draftContent.heroSubheadline || ''}
                        onChange={(e) =>
                          setEditingPage({
                            ...editingPage,
                            draftContent: { ...editingPage.draftContent, heroSubheadline: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="CTA Label"
                          value={editingPage.draftContent.ctaLabel || ''}
                          onChange={(e) =>
                            setEditingPage({
                              ...editingPage,
                              draftContent: { ...editingPage.draftContent, ctaLabel: e.target.value },
                            })
                          }
                          className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <input
                          placeholder="CTA Link"
                          value={editingPage.draftContent.ctaLink || ''}
                          onChange={(e) =>
                            setEditingPage({
                              ...editingPage,
                              draftContent: { ...editingPage.draftContent, ctaLink: e.target.value },
                            })
                          }
                          className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          placeholder="Hero Banner Image URL (optional)"
                          value={editingPage.draftContent.heroImageUrl || ''}
                          onChange={(e) =>
                            setEditingPage({
                              ...editingPage,
                              draftContent: { ...editingPage.draftContent, heroImageUrl: e.target.value },
                            })
                          }
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPickerState({
                              title: 'Hero Image for Custom Page',
                              filterKind: 'image',
                              category: 'Banners',
                              onSelect: (url) =>
                                setEditingPage((prev) =>
                                  prev
                                    ? { ...prev, draftContent: { ...prev.draftContent, heroImageUrl: url } }
                                    : null
                                ),
                            })
                          }
                          className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                        >
                          Media
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          placeholder="Hero Video URL (.mp4 / .webm)"
                          value={editingPage.draftContent.heroVideoUrl || ''}
                          onChange={(e) =>
                            setEditingPage({
                              ...editingPage,
                              draftContent: { ...editingPage.draftContent, heroVideoUrl: e.target.value },
                            })
                          }
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPickerState({
                              title: 'Hero Video for Custom Page',
                              filterKind: 'video',
                              category: 'Promotional Videos',
                              onSelect: (url) =>
                                setEditingPage((prev) =>
                                  prev
                                    ? { ...prev, draftContent: { ...prev.draftContent, heroVideoUrl: url } }
                                    : null
                                ),
                            })
                          }
                          className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                        >
                          Video
                        </button>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[#DCEAF5]">
                        <div className="flex items-center justify-between font-semibold text-[#123B5D]">
                          <span>Content Blocks ({(editingPage.draftContent.blocks || []).length})</span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingPage({
                                ...editingPage,
                                draftContent: {
                                  ...editingPage.draftContent,
                                  blocks: [
                                    ...(editingPage.draftContent.blocks || []),
                                    { id: `blk_${Date.now()}`, heading: 'New Block', body: '' },
                                  ],
                                },
                              })
                            }
                            className="text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Block
                          </button>
                        </div>

                        {(editingPage.draftContent.blocks || []).map((blk, bIdx) => (
                          <div key={blk.id} className="rounded-lg border border-[#DCEAF5] bg-white p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                placeholder="Block Heading"
                                value={blk.heading}
                                onChange={(e) =>
                                  setEditingPage({
                                    ...editingPage,
                                    draftContent: {
                                      ...editingPage.draftContent,
                                      blocks: editingPage.draftContent.blocks.map((b, i) =>
                                        i === bIdx ? { ...b, heading: e.target.value } : b
                                      ),
                                    },
                                  })
                                }
                                className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-semibold text-[#123B5D] focus:outline-none focus:border-[#64B5F6]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingPage({
                                    ...editingPage,
                                    draftContent: {
                                      ...editingPage.draftContent,
                                      blocks: editingPage.draftContent.blocks.filter((_, i) => i !== bIdx),
                                    },
                                  })
                                }
                                className="p-1 text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              placeholder="Block Body Copy"
                              value={blk.body}
                              onChange={(e) =>
                                setEditingPage({
                                  ...editingPage,
                                  draftContent: {
                                    ...editingPage.draftContent,
                                    blocks: editingPage.draftContent.blocks.map((b, i) =>
                                      i === bIdx ? { ...b, body: e.target.value } : b
                                    ),
                                  },
                                })
                              }
                              className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                            <div className="flex gap-1.5">
                              <input
                                placeholder="Block Image URL"
                                value={blk.imageUrl || ''}
                                onChange={(e) =>
                                  setEditingPage({
                                    ...editingPage,
                                    draftContent: {
                                      ...editingPage.draftContent,
                                      blocks: editingPage.draftContent.blocks.map((b, i) =>
                                        i === bIdx ? { ...b, imageUrl: e.target.value } : b
                                      ),
                                    },
                                  })
                                }
                                className="flex-1 min-w-0 rounded border border-[#DCEAF5] bg-white px-2.5 py-1 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setPickerState({
                                    title: 'Block Image',
                                    filterKind: 'image',
                                    category: 'Engineering Projects',
                                    onSelect: (url) =>
                                      setEditingPage((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              draftContent: {
                                                ...prev.draftContent,
                                                blocks: prev.draftContent.blocks.map((b, i) =>
                                                  i === bIdx ? { ...b, imageUrl: url } : b
                                                ),
                                              },
                                            }
                                          : null
                                      ),
                                  })
                                }
                                className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold whitespace-nowrap shrink-0"
                              >
                                Media
                              </button>
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                placeholder="Block Video URL (.mp4 / .webm)"
                                value={blk.videoUrl || ''}
                                onChange={(e) =>
                                  setEditingPage({
                                    ...editingPage,
                                    draftContent: {
                                      ...editingPage.draftContent,
                                      blocks: editingPage.draftContent.blocks.map((b, i) =>
                                        i === bIdx ? { ...b, videoUrl: e.target.value } : b
                                      ),
                                    },
                                  })
                                }
                                className="flex-1 min-w-0 rounded border border-[#DCEAF5] bg-white px-2.5 py-1 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setPickerState({
                                    title: 'Block Video',
                                    filterKind: 'video',
                                    category: 'Promotional Videos',
                                    onSelect: (url) =>
                                      setEditingPage((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              draftContent: {
                                                ...prev.draftContent,
                                                blocks: prev.draftContent.blocks.map((b, i) =>
                                                  i === bIdx ? { ...b, videoUrl: url } : b
                                                ),
                                              },
                                            }
                                          : null
                                      ),
                                  })
                                }
                                className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold whitespace-nowrap shrink-0"
                              >
                                Video
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSaveCustomPage(false, false)}
                          className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
                        >
                          Save Page Draft
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSaveCustomPage(true, false)}
                          className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                        >
                          Publish Page Live
                        </button>
                        {editingPage.status === 'published' && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSaveCustomPage(false, true)}
                            className="px-4 py-2 border border-amber-300 text-amber-800 bg-amber-50 rounded-lg font-semibold"
                          >
                            Unpublish
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await apiFetch('/api/admin/website-editor/pages', {
                            method: 'POST',
                            body: JSON.stringify({
                              title: newPageForm.title,
                              slug: newPageForm.slug,
                              status: 'published',
                              draftContent: {
                                heroHeadline: newPageForm.heroHeadline || newPageForm.title,
                                heroSubheadline: newPageForm.heroSubheadline,
                                ctaLabel: 'Contact Us',
                                ctaLink: '/contact',
                                blocks: [{ id: 'b1', heading: 'Details', body: newPageForm.heroSubheadline }],
                              },
                            }),
                          });
                          setNewPageForm({ title: '', slug: '', heroHeadline: '', heroSubheadline: '' });
                          loadEditorState();
                          refreshBootstrap();
                          notify('Custom landing page created and published.', 'success');
                        }}
                        className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-2.5"
                      >
                        <div className="font-display font-bold text-sm text-[#123B5D]">Create Custom Page (/p/:slug)</div>
                        <input
                          required
                          placeholder="Page Title"
                          value={newPageForm.title}
                          onChange={(e) => setNewPageForm({ ...newPageForm, title: e.target.value })}
                          className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <input
                          placeholder="URL Slug (optional, e.g. agri-subsidy)"
                          value={newPageForm.slug}
                          onChange={(e) => setNewPageForm({ ...newPageForm, slug: e.target.value })}
                          className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <textarea
                          rows={2}
                          placeholder="Hero Summary"
                          value={newPageForm.heroSubheadline}
                          onChange={(e) => setNewPageForm({ ...newPageForm, heroSubheadline: e.target.value })}
                          className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg transition-colors">
                          Create &amp; Publish Page
                        </button>
                      </form>

                      <div className="space-y-2">
                        <div className="font-semibold text-[#123B5D]">Published &amp; Draft Pages ({pages.length})</div>
                        {pages.map((pg) => (
                          <div key={pg.id} className="rounded-lg border border-[#DCEAF5] bg-white p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-[#123B5D] truncate">{pg.title}</div>
                              <div className="font-mono text-[11px] text-[#263746]/70 truncate">/p/{pg.slug} · {pg.status}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => setEditingPage(JSON.parse(JSON.stringify(pg)))}
                                className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3 text-[#42A5F5]" /> Edit
                              </button>
                              <button
                                onClick={() => {
                                  setPreviewUrl(`/p/${pg.slug}?preview=true`);
                                  setPreviewKey((k) => k + 1);
                                }}
                                className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold"
                              >
                                Preview
                              </button>
                              <button
                                onClick={async () => {
                                  await apiFetch(`/api/admin/website-editor/pages/${pg.id}`, { method: 'DELETE' });
                                  loadEditorState();
                                  refreshBootstrap();
                                }}
                                className="p-1 text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === 'branding_seo' && (
                <div className="space-y-4 text-xs">
                  <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-2.5">
                    <div className="font-bold text-[#123B5D]">Announcement Banner</div>
                    <label className="flex items-center gap-2 text-[#263746]">
                      <input
                        type="checkbox"
                        className="accent-[#64B5F6]"
                        checked={announcement.enabled}
                        onChange={(e) => setAnnouncement({ ...announcement, enabled: e.target.checked })}
                      />
                      Show Top Announcement Bar
                    </label>
                    <input
                      placeholder="Banner Message"
                      value={announcement.text}
                      onChange={(e) => setAnnouncement({ ...announcement, text: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="CTA Label"
                        value={announcement.ctaLabel}
                        onChange={(e) => setAnnouncement({ ...announcement, ctaLabel: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <input
                        placeholder="CTA Link"
                        value={announcement.link}
                        onChange={(e) => setAnnouncement({ ...announcement, link: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-2.5">
                    <div className="font-bold text-[#123B5D]">SEO Metadata &amp; Analytics</div>
                    <input
                      placeholder="Default SEO Title"
                      value={seoConfig.defaultTitle}
                      onChange={(e) => setSeoConfig({ ...seoConfig, defaultTitle: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                    <textarea
                      rows={2}
                      placeholder="Default SEO Meta Description"
                      value={seoConfig.defaultDescription}
                      onChange={(e) => setSeoConfig({ ...seoConfig, defaultDescription: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      placeholder="Default SEO Keywords (comma-separated)"
                      value={seoConfig.defaultKeywords || ''}
                      onChange={(e) => setSeoConfig({ ...seoConfig, defaultKeywords: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                    <div className="flex gap-1.5">
                      <input
                        placeholder="Default OpenGraph Social Image URL"
                        value={seoConfig.defaultOgImageUrl || ''}
                        onChange={(e) => setSeoConfig({ ...seoConfig, defaultOgImageUrl: e.target.value })}
                        className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPickerState({
                            title: 'Select Default Social Share (OG) Image',
                            filterKind: 'image',
                            category: 'Company Branding',
                            onSelect: (url) => setSeoConfig((prev) => ({ ...prev, defaultOgImageUrl: url })),
                          })
                        }
                        className="px-3 py-2 border border-[#90CAF9] rounded-lg bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                      >
                        Media
                      </button>
                    </div>
                    <input
                      placeholder="Google Analytics 4 Measurement ID (G-XXXXXXXXXX)"
                      value={seoConfig.ga4MeasurementId || ''}
                      onChange={(e) => setSeoConfig({ ...seoConfig, ga4MeasurementId: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      await Promise.all([
                        apiFetch('/api/admin/settings/announcementBar', {
                          method: 'PUT',
                          body: JSON.stringify({ value: announcement }),
                        }),
                        apiFetch('/api/admin/settings/seoConfig', {
                          method: 'PUT',
                          body: JSON.stringify({ value: seoConfig }),
                        }),
                      ]);
                      await refreshBootstrap();
                      setPreviewKey((k) => k + 1);
                      notify('Banner & SEO configuration saved.', 'success');
                    }}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg transition-colors"
                  >
                    Save Banner &amp; SEO
                  </button>
                </div>
              )}

              {tab === 'revisions' && (
                <div className="space-y-3 text-xs">
                  <div className="font-display font-bold text-sm text-[#123B5D]">
                    Published Revision History ({revisions.length})
                  </div>
                  {revisions.length === 0 ? (
                    <div className="text-[#263746]/70">Click &quot;Publish Live&quot; to store a restorable layout snapshot.</div>
                  ) : (
                    revisions.map((rev) => (
                      <div key={rev.id} className="rounded-lg border border-[#DCEAF5] bg-white p-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#123B5D]">{rev.label}</div>
                          <div className="text-[11px] text-[#263746]/70 font-mono">
                            By {rev.createdBy} · {new Date(rev.createdAt).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRollback(rev.id)}
                          className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 text-[#42A5F5]" /> Restore Draft
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Live Preview Canvas */}
        <div className="xl:col-span-7 p-4 sm:p-6 flex flex-col items-center overflow-auto bg-[#F0F8FF]">
          <div className={`${previewWidthClass} h-[calc(100vh-110px)] bg-white rounded-xl border border-[#DCEAF5] shadow-lg overflow-hidden transition-all`}>
            <iframe
              key={previewKey}
              src={previewUrl}
              title="Live Website Preview"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </div>

      <MediaPickerModal
        open={Boolean(pickerState)}
        title={pickerState?.title || 'Select Media'}
        filterKind={pickerState?.filterKind || 'all'}
        defaultCategory={pickerState?.category}
        onClose={() => setPickerState(null)}
        onSelect={(asset) => {
          pickerState?.onSelect(asset.url);
          setPickerState(null);
        }}
      />
    </div>
  );
};
