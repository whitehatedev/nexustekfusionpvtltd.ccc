import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Smartphone,
  FileDown,
  ShoppingBag,
  MessageSquarePlus,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { downloadDroneBrochurePdf } from '../lib/pdf';
import { Product } from '../types/platform';
import { DroneEnquiryForm, KRASHIVANTRI_SPEC_KEYS } from './KrashivantriProductPage';

const COMPARISON_ROWS: Array<{ label: string; key: string }> = [
  { label: 'Payload', key: 'Payload Capacity' },
  { label: 'Flight Time', key: 'Flight Time' },
  { label: 'Tank Capacity', key: 'Tank Capacity' },
  { label: 'Spraying Width', key: 'Spraying Width' },
  { label: 'Battery', key: 'Battery Specifications' },
  { label: 'Navigation', key: 'Navigation Capabilities' },
];

export const KrashivantriPage: React.FC<{ initialScrollToEnquiry?: boolean }> = ({ initialScrollToEnquiry }) => {
  const { settings, banners, navigate, apiFetch, notify, addToCart } = usePlatform();
  const catalog = settings.krashivantriCatalog;
  const appLinks = settings.appLinks || [];
  const krashiBanners = (banners || []).filter(
    (b) => b.placement === 'krashivantri' && b.isActive && b.status === 'published'
  );
  const heroVideoUrl = catalog?.bannerVideoUrl || settings.cmsContent?.krashivantriVideoUrl || '';

  const [flagshipProducts, setFlagshipProducts] = useState<{ x: Product | null; xPro: Product | null }>({
    x: null,
    xPro: null,
  });
  const [selectedEnquiryProduct, setSelectedEnquiryProduct] = useState<'KRASHIVANTRI X' | 'KRASHIVANTRI X PRO'>('KRASHIVANTRI X');

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ product: Product }>('/api/products/krashivantri-x').catch(() => null),
      apiFetch<{ product: Product }>('/api/products/krashivantri-x-pro').catch(() => null),
    ]).then(([r1, r2]) => {
      if (active) {
        setFlagshipProducts({
          x: r1?.product || null,
          xPro: r2?.product || null,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [apiFetch]);

  useEffect(() => {
    if (initialScrollToEnquiry) {
      const timer = setTimeout(() => {
        document.getElementById('krashivantri-enquiry')?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [initialScrollToEnquiry]);

  const models = [
    {
      id: 'krashivantri-x',
      route: '/krashivantri-x',
      name: 'KRASHIVANTRI X',
      defaultPrice: 450000,
      tagline: 'Smart Agriculture. Precision Spraying.',
      summary:
        'Precision agricultural spraying UAV engineered by NEXUSTEKFUSION PRIVATE LIMITED for precision crop spraying, FPO fleet operations, and institutional agritech R&D.',
      imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
      highlights: [
        'Precision agricultural crop spraying & uniform droplet application',
        'Built for FPO fleet operations & institutional agritech R&D',
      ],
    },
    {
      id: 'krashivantri-x-pro',
      route: '/krashivantri-x-pro',
      name: 'KRASHIVANTRI X PRO',
      defaultPrice: 560000,
      tagline: 'Advanced Intelligence. Precision Agriculture.',
      summary:
        'Enterprise intelligent agricultural UAV engineered for commercial agricultural spraying contractors, university R&D stations, and large-acreage precision farming.',
      imageUrl: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
      highlights: [
        'Commercial agricultural spraying contractor grade mission intelligence',
        'University R&D & large-acreage precision farming readiness',
      ],
    },
  ];

  const getComparisonValue = (modelId: string, key: string): string => {
    const dbProd = modelId === 'krashivantri-x-pro' ? flagshipProducts.xPro : flagshipProducts.x;
    const raw = String(dbProd?.technicalSpecs?.[key] || '').trim();
    if (!raw || raw.toLowerCase() === 'official specification on briefing') {
      return 'Official specification pending';
    }
    return raw;
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const priceX = flagshipProducts.x?.priceInr && flagshipProducts.x.priceInr > 0 ? flagshipProducts.x.priceInr : 450000;
  const pricePro = flagshipProducts.xPro?.priceInr && flagshipProducts.xPro.priceInr > 0 ? flagshipProducts.xPro.priceInr : 560000;

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] border-b border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
            <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
              KRASHIVANTRI AGRICULTURAL DRONES · NEXUSTEKFUSION PRIVATE LIMITED
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-balance text-[#123B5D]">
              {catalog?.platformName || 'KRASHIVANTRI Agricultural Drone Ecosystem'}
            </h1>
            <p className="text-base text-[#263746] leading-relaxed max-w-xl">
              {catalog?.summary ||
                'Precision agricultural UAV hardware, smart field telemetry, and unified Farmer, Pilot, and Buyer operational workflows engineered in Nagpur.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => navigate('/krashivantri-x')}
                className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                KRASHIVANTRI X · ₹{priceX.toLocaleString('en-IN')} <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/krashivantri-x-pro')}
                className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                KRASHIVANTRI X PRO · ₹{pricePro.toLocaleString('en-IN')} <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/krashivantri/compare')}
                className="px-5 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#64B5F6] text-[#123B5D] text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                Compare Models
              </button>
              <button
                onClick={() => scrollToSection('krashivantri-enquiry')}
                className="px-5 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#64B5F6] text-[#123B5D] text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                Enquire Now
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-72 sm:h-96 lg:h-full min-h-[320px] rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] shadow-sm">
              {heroVideoUrl ? (
                <video
                  src={heroVideoUrl}
                  poster={catalog?.bannerImageUrl || '/src/assets/images/krashivantri_x_field_1795013369836.jpg'}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  <img
                    src={catalog?.bannerImageUrl || '/src/assets/images/krashivantri_x_field_1795013369836.jpg'}
                    alt="KRASHIVANTRI Agricultural UAV Platform"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#123B5D]/80 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 text-xs text-white flex flex-wrap gap-2 font-medium">
                    <span>KRASHIVANTRI X</span>
                    <span aria-hidden="true">·</span>
                    <span>KRASHIVANTRI X PRO</span>
                    <span aria-hidden="true">·</span>
                    <span>Farmer, Pilot &amp; Buyer Apps</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Active KRASHIVANTRI CMS Promotional Banners */}
      {krashiBanners.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4">
          {krashiBanners.map((b) => (
            <div
              key={b.id ?? b.bannerKey}
              className="rounded-2xl border border-[#90CAF9] bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-sm"
            >
              <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-[#64B5F6] font-semibold">
                  KRASHIVANTRI Highlights
                </div>
                <h2 className="font-display text-2xl font-bold text-[#123B5D]">{b.title}</h2>
                {b.subtitle && <p className="text-sm text-[#263746] leading-relaxed">{b.subtitle}</p>}
                {b.ctaLabel && b.ctaLink && (
                  <div className="pt-1">
                    <button
                      onClick={() => navigate(b.ctaLink)}
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                    >
                      {b.ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {(b.videoUrl || b.imageUrl) && (
                <div className="lg:col-span-5 aspect-[16/9] lg:aspect-auto bg-[#F0F8FF]">
                  {b.videoUrl ? (
                    <video
                      src={b.videoUrl}
                      poster={b.imageUrl || undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={b.imageUrl}
                      alt={b.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Flagship Aircraft Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DCEAF5] pb-5">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">Flagship Aircraft Platforms</div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
              KRASHIVANTRI X &amp; KRASHIVANTRI X PRO
            </h2>
            <p className="text-sm text-[#263746] max-w-2xl">
              Explore full product details, official briefing specifications, downloadable brochures, and direct online ordering.
            </p>
          </div>
          <button
            onClick={() => navigate('/store/category/agricultural-drone-parts')}
            className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline inline-flex items-center gap-1.5 shrink-0"
          >
            Browse Agri-Drone Spare Parts <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {models.map((model) => {
            const dbProd = model.id === 'krashivantri-x-pro' ? flagshipProducts.xPro : flagshipProducts.x;
            const activePrice =
              dbProd && dbProd.priceInr > 0
                ? dbProd.discountPriceInr !== null && dbProd.discountPriceInr < dbProd.priceInr
                  ? dbProd.discountPriceInr
                  : dbProd.priceInr
                : model.defaultPrice;

            return (
              <div key={model.id} className="rounded-2xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col shadow-sm">
                <button
                  type="button"
                  onClick={() => navigate(model.route)}
                  className="aspect-[16/9] bg-[#F0F8FF] overflow-hidden block w-full"
                >
                  <img
                    src={dbProd?.imageUrl || model.imageUrl}
                    alt={model.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </button>
                <div className="p-6 sm:p-8 space-y-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono text-[#64B5F6] font-semibold">{model.tagline}</div>
                        <h3 className="font-display text-2xl font-bold text-[#123B5D] mt-1">{model.name}</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-[#263746]/70 uppercase font-mono">Selling Price</div>
                        <div className="font-mono text-xl font-bold text-[#123B5D] tabular-nums">
                          ₹{activePrice.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-[#263746] leading-relaxed">{dbProd?.shortDescription || model.summary}</p>

                    <ul className="space-y-1.5 text-sm text-[#263746]">
                      {(dbProd?.features?.length ? dbProd.features : model.highlights).slice(0, 3).map((h, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="border-t border-[#DCEAF5] pt-4 space-y-2">
                      <div className="text-xs font-semibold text-[#123B5D]">Key System Specifications</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {KRASHIVANTRI_SPEC_KEYS.map((specKey) => (
                          <div key={specKey} className="bg-[#F0F8FF] border border-[#DCEAF5] rounded-lg p-2.5">
                            <div className="text-[#263746]/75">{specKey}</div>
                            <div className="font-semibold text-[#123B5D] truncate">
                              {dbProd?.technicalSpecs?.[specKey] || 'Official Specification on Briefing'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2.5">
                    {dbProd && (
                      <button
                        type="button"
                        disabled={dbProd.stockQty <= 0}
                        onClick={() => {
                          addToCart(dbProd, 1);
                          navigate('/checkout');
                        }}
                        className="px-4 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" /> Buy Now
                      </button>
                    )}

                    {dbProd && (
                      <button
                        type="button"
                        disabled={dbProd.stockQty <= 0}
                        onClick={() => addToCart(dbProd, 1)}
                        className="px-4 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 disabled:opacity-40 transition-colors"
                      >
                        Add to Cart
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => navigate(`${model.route}#key-specifications`)}
                      className="px-4 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                    >
                      View Specifications
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEnquiryProduct(model.name as 'KRASHIVANTRI X' | 'KRASHIVANTRI X PRO');
                        scrollToSection('krashivantri-enquiry');
                      }}
                      className="px-4 py-2.5 border border-[#90CAF9] text-[#123B5D] bg-white hover:bg-[#F0F8FF] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5 text-[#64B5F6]" /> Enquire Now
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (dbProd?.brochureUrl) {
                          const a = document.createElement('a');
                          a.href = dbProd.brochureUrl;
                          a.target = '_blank';
                          a.rel = 'noreferrer';
                          a.click();
                        } else {
                          downloadDroneBrochurePdf({
                            name: model.name,
                            sku: dbProd?.sku || model.id.toUpperCase(),
                            hsnCode: dbProd?.hsnCode || '8806',
                            priceInr: activePrice,
                            shortDescription: model.tagline,
                            description: dbProd?.description || model.summary,
                            technicalSpecs: dbProd?.technicalSpecs,
                            features: dbProd?.features || model.highlights,
                            applications: dbProd?.applications,
                            packageContents: dbProd?.packageContents,
                            warrantyInfo: dbProd?.warrantyInfo,
                            deliveryInfo: dbProd?.deliveryInfo,
                          });
                          notify(`Downloaded ${model.name} brochure PDF.`, 'success');
                        }
                      }}
                      className="px-4 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <FileDown className="w-3.5 h-3.5 text-[#64B5F6]" /> Download Brochure
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Official Side-by-Side Model Comparison Matrix */}
      <section id="compare" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#DCEAF5] pb-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">Product Comparison</div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
              KRASHIVANTRI X vs KRASHIVANTRI X PRO
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/krashivantri/compare')}
            className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline whitespace-nowrap"
          >
            Open Dedicated Comparison Page →
          </button>
        </div>

        <div className="rounded-xl border border-[#DCEAF5] bg-white overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F0F8FF] text-[#123B5D] border-b border-[#DCEAF5]">
                <th className="py-4 px-5 font-display font-semibold text-xs uppercase tracking-wider w-1/4">
                  Feature
                </th>
                <th className="py-4 px-5 font-display font-bold text-base w-[37.5%]">
                  KRASHIVANTRI X
                </th>
                <th className="py-4 px-5 font-display font-bold text-base w-[37.5%]">
                  KRASHIVANTRI X PRO
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCEAF5]">
              <tr className="bg-white">
                <td className="py-3.5 px-5 font-semibold text-[#123B5D]">Price</td>
                <td className="py-3.5 px-5 font-mono font-bold text-[#123B5D] tabular-nums">
                  ₹{priceX.toLocaleString('en-IN')}
                </td>
                <td className="py-3.5 px-5 font-mono font-bold text-[#123B5D] tabular-nums">
                  ₹{pricePro.toLocaleString('en-IN')}
                </td>
              </tr>
              {COMPARISON_ROWS.map((row, idx) => {
                const valX = getComparisonValue('krashivantri-x', row.key);
                const valPro = getComparisonValue('krashivantri-x-pro', row.key);
                return (
                  <tr key={row.key} className={idx % 2 === 0 ? 'bg-[#F0F8FF]/60' : 'bg-white'}>
                    <td className="py-3.5 px-5 font-semibold text-[#123B5D] text-xs sm:text-sm">
                      {row.label}
                    </td>
                    <td className={`py-3.5 px-5 text-xs sm:text-sm ${valX === 'Official specification pending' ? 'text-[#263746]/60 italic' : 'text-[#263746] font-medium font-mono'}`}>
                      {valX}
                    </td>
                    <td className={`py-3.5 px-5 text-xs sm:text-sm ${valPro === 'Official specification pending' ? 'text-[#263746]/60 italic' : 'text-[#263746] font-medium font-mono'}`}>
                      {valPro}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Android Apps Ecosystem */}
      {appLinks.length > 0 && (
        <section className="bg-[#F0F8FF] border-y border-[#DCEAF5] py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#64B5F6] uppercase tracking-wider">Mobile Software Platform</div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                Farmer, Drone Pilot &amp; Buyer Android Apps
              </h2>
              <p className="text-sm text-[#263746] max-w-2xl">
                Connected mobile software linking agricultural drone operators, farmers, and component procurement.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {appLinks.map((app) => (
                <div key={app.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 flex flex-col justify-between space-y-5 shadow-sm">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#263746]/70">
                      <span className="font-semibold text-[#64B5F6]">{app.role}</span>
                      <Smartphone className="w-4 h-4 text-[#64B5F6]" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#123B5D]">{app.name}</h3>
                    <p className="text-sm text-[#263746] leading-relaxed">{app.description}</p>
                  </div>
                  <div>
                    {app.comingSoon || (!app.playStoreUrl && !app.apkDownloadUrl) ? (
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] text-xs font-semibold text-[#123B5D]">
                        Coming Soon on Google Play
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {app.playStoreUrl && (
                          <a
                            href={app.playStoreUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                          >
                            Google Play Store <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {app.apkDownloadUrl && (
                          <a
                            href={app.apkDownloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                          >
                            Download APK
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Structured Product Enquiry Form Anchor (#krashivantri-enquiry) */}
      <section id="krashivantri-enquiry" className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <DroneEnquiryForm
          defaultProduct={selectedEnquiryProduct}
          heading="Enquire About KRASHIVANTRI Drones & Official Briefings"
        />
      </section>
    </div>
  );
};

