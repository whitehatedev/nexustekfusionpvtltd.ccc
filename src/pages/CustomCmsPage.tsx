import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { CmsPageRecord } from '../types/platform';

export const CustomCmsPage: React.FC<{ slug: string }> = ({ slug }) => {
  const { apiFetch, navigate } = usePlatform();
  const [page, setPage] = useState<CmsPageRecord | null>(null);
  const [content, setContent] = useState<CmsPageRecord['draftContent'] | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const preview = new URLSearchParams(window.location.search).get('preview') === 'true';
        const res = await apiFetch<{
          page: CmsPageRecord;
          content: CmsPageRecord['draftContent'];
          isPreview: boolean;
        }>(`/api/pages/${encodeURIComponent(slug)}${preview ? '?preview=true' : ''}`);
        if (active) {
          setPage(res.page);
          setContent(res.content);
          setIsPreview(res.isPreview);
        }
      } catch {
        if (active) {
          setPage(null);
          setContent(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [slug, apiFetch]);

  useEffect(() => {
    if (page) {
      document.title = page.seoTitle || page.title;
    }
  }, [page]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-20 text-sm text-[#263746]/70">Loading page...</div>;
  }

  if (!page || !content) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">Page Not Found</h1>
        <p className="text-sm text-[#263746]">This custom landing page does not exist or has not been published yet.</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-16 bg-[#FFFFFF] text-[#263746]">
      {isPreview && (
        <div className="bg-[#F0F8FF] border-b border-[#90CAF9] px-4 py-2 text-center text-xs font-semibold text-[#123B5D]">
          Draft Preview Mode — Changes shown here are not live until published in Website Editor.
        </div>
      )}

      <section className="bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] border-b border-[#DCEAF5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className={content.heroImageUrl || content.heroVideoUrl ? 'lg:col-span-7 space-y-5' : 'lg:col-span-12 space-y-5'}>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-balance text-[#123B5D]">
              {content.heroHeadline || page.title}
            </h1>
            <p className="text-base sm:text-lg text-[#263746] max-w-2xl leading-relaxed">
              {content.heroSubheadline}
            </p>
            {content.ctaLabel && (
              <button
                onClick={() => navigate(content.ctaLink || '/contact')}
                className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap transition-colors"
              >
                {content.ctaLabel} <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
          {(content.heroVideoUrl || content.heroImageUrl) && (
            <div className="lg:col-span-5 rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] aspect-[16/10] shadow-sm">
              {content.heroVideoUrl ? (
                <video
                  src={content.heroVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={content.heroImageUrl || undefined}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={content.heroImageUrl}
                  alt={content.heroHeadline || page.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8 pb-10">
        {(content.blocks || []).map((block) => (
          <div key={block.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-4 shadow-sm">
            {block.videoUrl ? (
              <div className="aspect-[16/9] rounded-lg overflow-hidden bg-[#F0F8FF] border border-[#DCEAF5]">
                <video
                  src={block.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={block.imageUrl || undefined}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : block.imageUrl ? (
              <div className="aspect-[16/9] rounded-lg overflow-hidden bg-[#F0F8FF] border border-[#DCEAF5]">
                <img src={block.imageUrl} alt={block.heading} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
            ) : null}
            <h2 className="font-display text-2xl font-bold text-[#123B5D]">{block.heading}</h2>
            <div className="text-sm sm:text-base text-[#263746] leading-relaxed whitespace-pre-line">{block.body}</div>
          </div>
        ))}
      </section>
    </div>
  );
};
