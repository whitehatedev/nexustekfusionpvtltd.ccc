import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Factory,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  MessageSquarePlus,
  Plane,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sprout,
  Truck,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { HomepageSectionConfig, Product } from '../types/platform';

const HERO_IMG = '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg';
const KRASHI_X_IMG = '/src/assets/images/krashivantri_x_field_1795013369836.jpg';
const KRASHI_X_PRO_IMG = '/src/assets/images/krashivantri_x_pro_1795013371537.jpg';
const PCB_IMG = '/src/assets/images/service_pcb_electronics_1794981062614.jpg';
const ROBOT_IMG = '/src/assets/images/service_robotics_automation_1794981063545.jpg';

const PRINTING_3D_CAPABILITIES = [
  'FDM 3D Printing & SLA Resin Prototyping',
  'Custom 3D Prototyping & CAD Iteration',
  'Functional Mechanical & UAV Parts',
  'Product Design & Development',
  'Engineering Models & Small-Batch Manufacturing',
];

const CUSTOM_PROJECT_CAPABILITIES = [
  'Final-Year & Institutional R&D Projects',
  'AI, Machine Learning & Computer Vision',
  'IoT Telemetry & Embedded Systems',
  'Robotics, Automation & ROS2 Platforms',
  'Single & Double-Layer PCB Design & Drones',
];

const SERVICE_CARDS = [
  {
    num: '01',
    slug: '3d-printing',
    title: '3D Printing & Rapid Prototyping',
    summary:
      'Transform digital CAD designs into physical products through FDM & SLA 3D printing, rapid prototyping, custom component manufacturing, and precision fabrication.',
    to: '/services/3d-printing',
    ctaLabel: 'Explore Service',
    points: PRINTING_3D_CAPABILITIES,
    icon: Box,
  },
  {
    num: '02',
    slug: 'custom-engineering-projects',
    title: 'Project Development',
    summary:
      'End-to-end engineering project development, hardware prototyping, embedded programming, robotics, IoT, AI/ML, PCB design, and industrial project solutions.',
    to: '/register-project',
    ctaLabel: 'Register Project',
    points: CUSTOM_PROJECT_CAPABILITIES,
    icon: Cpu,
  },
  {
    num: '03',
    slug: 'drone-repair',
    title: 'Drone Repair & Diagnostics Service',
    summary:
      'Complete drone inspection, troubleshooting, airframe rebuilds, flight controller configuration, ESC/motor calibration and testing for agricultural and commercial UAVs.',
    to: '/services/drone-repair',
    ctaLabel: 'Book Drone Repair',
    points: [
      'Agricultural spraying, survey & custom UAV fault diagnostics',
      'Flight controller calibration, ESC/motor swap & pump servicing',
      'Nagpur Service Centre drop-off or on-site field technician support',
    ],
    icon: Plane,
  },
];

const KRASHIVANTRI_SPEC_ROWS: Array<{ label: string; keys: string[]; fallback: string }> = [
  { label: 'Payload Capacity', keys: ['Payload capacity', 'Payload Capacity'], fallback: 'Official Specification on Briefing' },
  { label: 'Flight Time', keys: ['Flight time', 'Flight Time'], fallback: 'Official Specification on Briefing' },
  { label: 'Tank Capacity', keys: ['Tank capacity', 'Tank Capacity'], fallback: 'Official Specification on Briefing' },
  { label: 'Spraying Width', keys: ['Spraying width', 'Spraying Width'], fallback: 'Official Specification on Briefing' },
  { label: 'Battery Specifications', keys: ['Battery', 'Battery Specifications', 'Battery Configuration'], fallback: 'Official Specification on Briefing' },
  { label: 'Navigation Capabilities', keys: ['Navigation system', 'Navigation Capabilities', 'Navigation System'], fallback: 'Official Specification on Briefing' },
  { label: 'Applications', keys: ['Application', 'Applications', 'Target Application'], fallback: 'Precision Crop Spraying & Agricultural Field Operations' },
];

const FALLBACK_SECTIONS: HomepageSectionConfig[] = [
  { id: 'hero', type: 'hero', visible: true },
  { id: 'agri_fpv_showcase', type: 'agri_fpv_showcase', visible: true },
  { id: 'services', type: 'services', visible: true },
  { id: 'company_intro', type: 'company_intro', visible: true },
  { id: 'categories', type: 'categories', visible: true },
  { id: 'featured_products', type: 'featured_products', visible: true },
  { id: 'bestsellers', type: 'bestsellers', visible: true },
  { id: 'new_arrivals', type: 'new_arrivals', visible: true },
  { id: 'printing_and_projects', type: 'printing_and_projects', visible: true },
  { id: 'why_us', type: 'why_us', visible: true },
  { id: 'industries_applications', type: 'industries_applications', visible: true },
  { id: 'faqs_section', type: 'faqs_section', visible: true },
  { id: 'contact_enquiry', type: 'contact_enquiry', visible: true },
];

export const HomePage: React.FC = () => {
  const {
    navigate,
    featuredProducts,
    bestsellerProducts,
    newArrivalProducts,
    categories,
    caseStudies,
    addToCart,
    settings,
    banners,
    previewDraft,
    apiFetch,
  } = usePlatform();

  const [krashiProducts, setKrashiProducts] = useState<{ x: Product | null; xPro: Product | null }>({
    x: null,
    xPro: null,
  });
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ product: Product }>('/api/products/krashivantri-x').catch(() => null),
      apiFetch<{ product: Product }>('/api/products/krashivantri-x-pro').catch(() => null),
    ]).then(([r1, r2]) => {
      if (active) {
        setKrashiProducts({
          x: r1?.product || null,
          xPro: r2?.product || null,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const company = settings.companyInfo;
  const customerCareEmail = company?.customerCareEmail || 'info@nexustekfusion.in';
  const krashiCatalog = settings.krashivantriCatalog;
  const cmsContent = settings.cmsContent;
  const publishedBanners = (banners || []).filter((b) => b.isActive && b.status === 'published');
  const heroBanners = publishedBanners.filter((b) => b.placement === 'homepage_hero');
  const promoBanners = publishedBanners.filter((b) => b.placement === 'homepage_promo');
  const layoutList =
    (previewDraft ? settings.homepageLayout?.draft : settings.homepageLayout?.published) ||
    FALLBACK_SECTIONS;

  const resolveKrashiSpec = (modelId: string, row: typeof KRASHIVANTRI_SPEC_ROWS[number]): string => {
    const dbProd = modelId === 'krashivantri-x-pro' ? krashiProducts.xPro : krashiProducts.x;
    const cmsModel = krashiCatalog?.models?.find((m) => m.id === modelId);
    if (row.label === 'Applications' && dbProd?.applications) {
      return dbProd.applications;
    }
    const specsObj = dbProd?.technicalSpecs || {};
    for (const [k, v] of Object.entries(specsObj)) {
      if (row.keys.some((target) => target.toLowerCase() === k.toLowerCase()) && String(v).trim()) {
        return String(v).trim();
      }
    }
    const cmsSpec = cmsModel?.specs?.find((sp) =>
      row.keys.some((target) => target.toLowerCase() === sp.label.trim().toLowerCase())
    );
    if (cmsSpec?.value?.trim()) return cmsSpec.value.trim();
    return row.fallback;
  };

  const renderProductGrid = (items: Product[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {items.map((product) => {
        const isQuoteOnly = product.productType === 'quote_only' || product.priceInr <= 0;
        const hasDiscount =
          !isQuoteOnly &&
          product.discountPriceInr !== null &&
          product.discountPriceInr < product.priceInr &&
          product.priceInr > 0;
        const discountPct = hasDiscount
          ? Math.round(((product.priceInr - (product.discountPriceInr || 0)) / product.priceInr) * 100)
          : 0;
        const activePrice = hasDiscount ? product.discountPriceInr! : product.priceInr;
        const specEntries = Object.entries(product.technicalSpecs || {}).slice(0, 2);
        return (
          <div
            key={product.id}
            className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between hover:border-[#64B5F6] transition-colors shadow-xs"
          >
            <div>
              <button
                onClick={() => navigate(`/product/${product.slug}`)}
                className="relative block w-full aspect-[4/3] bg-[#F0F8FF] overflow-hidden"
              >
                <img
                  src={product.imageUrl || PCB_IMG}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
                {hasDiscount && discountPct > 0 && (
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-[#64B5F6] text-white font-mono text-[11px] font-bold">
                    -{discountPct}%
                  </span>
                )}
              </button>
              <div className="p-5 space-y-2">
                <div className="text-[11px] text-[#263746]/70 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[#263746]">{product.sku}</span>
                  <span aria-hidden="true">·</span>
                  {isQuoteOnly ? (
                    <span className="text-[#42A5F5] font-semibold">Custom Build</span>
                  ) : (
                    <span className={product.stockQty > 0 ? 'text-[#42A5F5] font-semibold' : 'text-red-600 font-semibold'}>
                      {product.stockQty > 0 ? `In Stock (${product.stockQty})` : 'Out of Stock'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/product/${product.slug}`)}
                  className="text-left font-display font-semibold text-[#123B5D] hover:text-[#42A5F5] line-clamp-2 transition-colors"
                >
                  {product.name}
                </button>
                {(product.shortDescription || product.description) && (
                  <p className="text-xs text-[#263746] line-clamp-2">
                    {product.shortDescription || product.description}
                  </p>
                )}
                {specEntries.length > 0 && (
                  <div className="pt-1 border-t border-[#DCEAF5] space-y-0.5 text-[11px] text-[#263746]/70">
                    {specEntries.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2 truncate">
                        <span className="truncate">{k}</span>
                        <span className="font-mono text-[#123B5D] truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-baseline gap-2 pt-1 font-mono tabular-nums">
                  {isQuoteOnly ? (
                    <span className="text-sm font-bold text-[#123B5D] font-sans">Contact for Price</span>
                  ) : (
                    <>
                      <span className="text-base font-bold text-[#123B5D]">
                        ₹{activePrice.toLocaleString('en-IN')}
                      </span>
                      {hasDiscount && (
                        <span className="text-xs text-[#263746]/50 line-through">
                          ₹{product.priceInr.toLocaleString('en-IN')}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 space-y-2">
              {isQuoteOnly ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/product/${product.slug}`)}
                    className="flex-1 py-2 px-3 border border-[#90CAF9] bg-white rounded-lg text-xs font-medium text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
                  >
                    Specifications
                  </button>
                  <button
                    onClick={() => navigate(`/product/${product.slug}#quote`)}
                    className="flex-1 py-2 px-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Enquire Now
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button
                      disabled={product.stockQty <= 0}
                      onClick={() => addToCart(product, 1, product.availableVariants[0], product.availableColors[0])}
                      className="flex-1 py-2 px-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold disabled:opacity-40 whitespace-nowrap transition-colors"
                    >
                      Add to Cart
                    </button>
                    <button
                      disabled={product.stockQty <= 0}
                      onClick={() => {
                        addToCart(product, 1, product.availableVariants[0], product.availableColors[0]);
                        navigate('/checkout');
                      }}
                      className="py-2 px-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-xs font-semibold disabled:opacity-40 whitespace-nowrap transition-colors"
                    >
                      Buy Now
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/product/${product.slug}`)}
                      className="flex-1 py-1.5 border border-[#DCEAF5] hover:border-[#64B5F6] text-[#263746] rounded-lg text-[11px] font-medium transition-colors"
                    >
                      Specifications
                    </button>
                    <button
                      onClick={() => navigate(`/product/${product.slug}#quote`)}
                      className="py-1.5 px-3 border border-[#DCEAF5] hover:border-[#64B5F6] text-[#42A5F5] hover:text-[#123B5D] rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <MessageSquarePlus className="w-3 h-3" /> Enquire
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderSection = (sec: HomepageSectionConfig) => {
    if (!sec.visible) return null;

    switch (sec.type) {
      case 'hero':
        return (
          <div key={sec.id}>
            <section className="bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] border-b border-[#DCEAF5]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
                  <div className="text-xs font-semibold text-[#64B5F6] tracking-wider font-mono uppercase">
                    {sec.kicker || 'NEXUSTEKFUSION PRIVATE LIMITED'}
                  </div>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-balance text-[#123B5D]">
                    {sec.heading || 'Engineering Intelligence. Manufacturing Innovation.'}
                  </h1>
                  <p className="text-base sm:text-lg text-[#123B5D]/85 font-medium leading-relaxed max-w-xl">
                    {sec.subheading ||
                      'Agricultural Drone Manufacturing | Precision Engineering | Advanced Technology Development'}
                  </p>
                  <p className="text-sm text-[#263746] leading-relaxed max-w-xl">
                    {sec.body ||
                      'We unite indigenous agricultural drone manufacturing, precision 3D printing & rapid prototyping, custom engineering R&D, and a pan-India drone hardware store from Nagpur, Maharashtra.'}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => navigate(sec.primaryCtaLink || '/krashivantri')}
                      className="px-5 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shadow-sm"
                    >
                      {sec.primaryCtaLabel || 'Explore KRASHIVANTRI'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigate(sec.secondaryCtaLink || '/services')}
                      className="px-5 py-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      {sec.secondaryCtaLabel || 'Explore Our Services'}
                    </button>
                    <button
                      onClick={() => navigate('/store')}
                      className="px-5 py-3 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#64B5F6] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      Visit Engineering Store
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative h-72 sm:h-96 lg:h-full min-h-[360px] rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] shadow-sm">
                    {sec.videoUrl ? (
                      <video
                        src={sec.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        poster={sec.imageUrl || HERO_IMG}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <>
                        <img
                          src={sec.imageUrl || HERO_IMG}
                          alt="NexusTekFusion agricultural drone manufacturing facility and KRASHIVANTRI multirotor"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#123B5D]/80 via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 text-xs text-white flex flex-wrap items-center gap-2 font-mono">
                          <span>KRASHIVANTRI Agricultural UAVs</span>
                          <span aria-hidden="true">·</span>
                          <span>3D Printing &amp; Prototyping</span>
                          <span aria-hidden="true">·</span>
                          <span>Nagpur Engineering Lab</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {heroBanners.length > 0 && (
              <div className="bg-[#F0F8FF] text-[#123B5D] border-b border-[#DCEAF5]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-display font-bold text-sm text-[#123B5D]">{heroBanners[0].title}</div>
                    {heroBanners[0].subtitle && (
                      <div className="text-xs text-[#263746]">{heroBanners[0].subtitle}</div>
                    )}
                  </div>
                  {heroBanners[0].ctaLabel && heroBanners[0].ctaLink && (
                    <button
                      onClick={() => navigate(heroBanners[0].ctaLink)}
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {heroBanners[0].ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Manufacturing & Engineering Capabilities Strip */}
            <div className="bg-white border-b border-[#DCEAF5]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <Plane className="w-4 h-4 text-[#64B5F6] shrink-0" />
                  <div>
                    <div className="font-semibold text-[#123B5D]">Agricultural Drone Manufacturing</div>
                    <div className="text-[#263746]/70">KRASHIVANTRI X &amp; X PRO UAV platforms</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-[#64B5F6] shrink-0" />
                  <div>
                    <div className="font-semibold text-[#123B5D]">Pan-India Components Store</div>
                    <div className="text-[#263746]/70">Free dispatch on orders above ₹2,500</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-[#64B5F6] shrink-0" />
                  <div>
                    <div className="font-semibold text-[#123B5D]">Razorpay &amp; GST Invoicing</div>
                    <div className="text-[#263746]/70">Verified checkout &amp; tax documentation</div>
                  </div>
                </div>
                <a
                  href={`mailto:${customerCareEmail}?subject=${encodeURIComponent('Engineering & Drone Enquiry — NexusTekFusion')}`}
                  className="flex items-center gap-3 hover:text-[#42A5F5] transition-colors"
                >
                  <Mail className="w-4 h-4 text-[#64B5F6] shrink-0" />
                  <div>
                    <div className="font-semibold text-[#123B5D]">Customer Care Desk</div>
                    <div className="font-mono text-[#42A5F5]">{customerCareEmail}</div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        );

      case 'agri_fpv_showcase': {
        const allCatalogDrones = Array.from(
          new Map(
            [...featuredProducts, ...bestsellerProducts, ...newArrivalProducts]
              .filter(
                (p) =>
                  p.slug !== 'krashivantri-x' &&
                  p.slug !== 'krashivantri-x-pro' &&
                  /drone|uav|hexacopter|agri|flight controller|nozzle/i.test(
                    `${p.name} ${p.subcategory || ''} ${(p.tags || []).join(' ')}`
                  )
              )
              .map((p) => [p.id, p])
          ).values()
        ).slice(0, 4);

        const krashiVideoUrl = sec.videoUrl || krashiCatalog?.bannerVideoUrl || cmsContent?.krashivantriVideoUrl || '';

        const droneModels = [
          {
            id: 'krashivantri-x',
            priceText: '₹4,50,000',
            route: '/krashivantri-x',
            name: krashiProducts.x?.name || krashiCatalog?.models?.[0]?.name || 'KRASHIVANTRI X',
            tagline: krashiCatalog?.models?.[0]?.tagline || 'Smart Agriculture. Precision Spraying.',
            summary:
              krashiProducts.x?.shortDescription ||
              krashiCatalog?.models?.[0]?.summary ||
              'Multi-rotor agricultural spraying UAV engineered by NexusTekFusion for dependable crop protection, field efficiency, and modular servicing.',
            imageUrl: krashiCatalog?.models?.[0]?.imageUrl || krashiProducts.x?.imageUrl || KRASHI_X_IMG,
            videoUrl: krashiCatalog?.models?.[0]?.videoUrl || '',
          },
          {
            id: 'krashivantri-x-pro',
            priceText: '₹5,60,000',
            route: '/krashivantri-x-pro',
            name: krashiProducts.xPro?.name || krashiCatalog?.models?.[1]?.name || 'KRASHIVANTRI X PRO',
            tagline: krashiCatalog?.models?.[1]?.tagline || 'Advanced Intelligence. Precision Agriculture.',
            summary:
              krashiProducts.xPro?.shortDescription ||
              krashiCatalog?.models?.[1]?.summary ||
              'Heavy-duty commercial agricultural drone platform built for continuous fleet operations, precision spraying acreage, and real-time telemetry.',
            imageUrl: krashiCatalog?.models?.[1]?.imageUrl || krashiProducts.xPro?.imageUrl || KRASHI_X_PRO_IMG,
            videoUrl: krashiCatalog?.models?.[1]?.videoUrl || '',
          },
        ];

        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#DCEAF5] pb-6">
              <div className="space-y-2 max-w-3xl">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'FLAGSHIP AGRICULTURAL UAV PLATFORMS'}
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'KRASHIVANTRI — Agricultural Drone Systems'}
                </h2>
                <p className="text-sm sm:text-base text-[#263746]">
                  {sec.subheading ||
                    'Explore our flagship agricultural drone platforms engineered in-house for Indian farming conditions, commercial spraying fleets, and research institutions.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={() => navigate('/krashivantri/compare')}
                  className="px-4 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  Compare Models <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => navigate('/krashivantri/enquiry')}
                  className="px-4 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap transition-colors"
                >
                  Book Field Demo
                </button>
              </div>
            </div>

            {krashiVideoUrl && (
              <div className="rounded-2xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] shadow-sm">
                <video
                  src={krashiVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={krashiCatalog?.bannerImageUrl || KRASHI_X_IMG}
                  className="w-full max-h-[440px] object-cover"
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {droneModels.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[#DCEAF5] bg-gradient-to-br from-[#FFFFFF] to-[#F0F8FF] text-[#263746] overflow-hidden flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="aspect-[16/10] bg-[#F0F8FF] overflow-hidden relative">
                      {m.videoUrl ? (
                        <video
                          src={m.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          poster={m.imageUrl}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <img
                            src={m.imageUrl}
                            alt={m.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#123B5D]/80 via-transparent to-transparent" />
                          <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono font-semibold text-white uppercase tracking-wider">
                              {m.tagline}
                            </span>
                            <span className="px-2.5 py-1 rounded bg-[#64B5F6] text-white font-mono text-xs font-bold shadow-xs">
                              {m.priceText}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="p-6 sm:p-7 space-y-5">
                      <div className="space-y-2">
                        <h3 className="font-display text-2xl font-bold text-[#123B5D]">{m.name}</h3>
                        <p className="text-xs sm:text-sm text-[#263746] leading-relaxed">{m.summary}</p>
                      </div>

                      <div className="border-t border-[#DCEAF5] pt-4 space-y-2">
                        <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#64B5F6]">
                          Key System Specifications
                        </div>
                        <div className="divide-y divide-[#DCEAF5] text-xs">
                          {KRASHIVANTRI_SPEC_ROWS.map((row) => {
                            const val = resolveKrashiSpec(m.id, row);
                            return (
                              <div key={row.label} className="py-2 flex justify-between gap-4">
                                <span className="text-[#263746]/80">{row.label}</span>
                                <span
                                  className={`text-right font-mono ${
                                    val === 'Official Specification on Briefing'
                                      ? 'text-[#263746]/60 italic font-sans'
                                      : 'text-[#123B5D] font-semibold'
                                  }`}
                                >
                                  {val}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 sm:px-7 pb-6 sm:pb-7 pt-2 flex flex-wrap gap-3">
                    <button
                      onClick={() => navigate(m.route)}
                      className="flex-1 py-2.5 px-4 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                      Buy / View Product <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => navigate('/krashivantri/enquiry')}
                      className="flex-1 py-2.5 px-4 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap transition-colors"
                    >
                      Enquire Now
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {allCatalogDrones.length > 0 && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold text-[#123B5D]">
                    Agricultural Drone Airframes, Flight Controllers &amp; Spraying Hardware
                  </h3>
                  <button
                    onClick={() => navigate('/store/category/agricultural-drone-parts')}
                    className="text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline inline-flex items-center gap-1"
                  >
                    Browse Drone Hardware Store <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {renderProductGrid(allCatalogDrones)}
              </div>
            )}
          </section>
        );
      }

      case 'services': {
        const cmsServices = cmsContent?.services?.services || settings.servicesCatalog || [];
        const bySlug = new Map(cmsServices.map((s) => [s.slug, s]));
        const itemsToRender = SERVICE_CARDS.filter((def) => {
          const override =
            bySlug.get(def.slug) ||
            (def.slug === 'custom-engineering-projects' ? bySlug.get('custom-engineering') : undefined);
          return !override || override.visible !== false;
        }).map((def, idx) => {
          const override =
            bySlug.get(def.slug) ||
            (def.slug === 'custom-engineering-projects' ? bySlug.get('custom-engineering') : undefined);
          const isLegacyProj =
            override?.title === 'Custom Engineering Project Development & Prototyping';
          return {
            num: String(idx + 1).padStart(2, '0'),
            slug: def.slug,
            title: override && !isLegacyProj ? override.title : def.title,
            summary: override && !isLegacyProj ? override.shortDesc || def.summary : def.summary,
            to: override?.ctaLink || def.to,
            ctaLabel:
              override?.ctaLabel && !isLegacyProj && override.ctaLabel !== 'Register Your Project'
                ? override.ctaLabel
                : def.ctaLabel,
            points: override?.benefits?.length && !isLegacyProj ? override.benefits : def.points,
          };
        });

        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'ENGINEERING, MANUFACTURING & UAV SUPPORT'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Primary Engineering Services'}
                </h2>
                {sec.subheading && <p className="text-sm text-[#263746] max-w-2xl">{sec.subheading}</p>}
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/services')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'Explore All Services'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {itemsToRender.map((svc) => {
                const is3dPrinting = svc.slug === '3d-printing';
                const isProjectDev = svc.slug === 'custom-engineering-projects' || svc.slug === 'custom-engineering';
                return (
                  <div
                    key={svc.slug}
                    className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-xs hover:border-[#64B5F6] transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#263746]/70 font-mono">
                        <span className="font-bold text-[#123B5D]">{svc.num}</span>
                        <div className="w-9 h-9 rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] text-[#42A5F5] flex items-center justify-center">
                          {is3dPrinting ? (
                            <Box className="w-4 h-4" />
                          ) : isProjectDev ? (
                            <Cpu className="w-4 h-4" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                      <h3 className="font-display text-xl font-bold text-[#123B5D]">{svc.title}</h3>
                      <p className="text-sm text-[#263746] leading-relaxed">{svc.summary}</p>
                      <div className="pt-2">
                        <div className="text-xs font-semibold text-[#123B5D] mb-2">
                          {is3dPrinting
                            ? 'Capabilities & Fabrication:'
                            : isProjectDev
                            ? 'Project Development Scope:'
                            : 'Diagnostics & Service Coverage:'}
                        </div>
                        <ul className="space-y-1.5 text-xs text-[#263746]">
                          {svc.points.map((pt) => (
                            <li key={pt} className="flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#64B5F6] shrink-0 mt-0.5" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        onClick={() => navigate(svc.to)}
                        className="flex-1 px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {svc.ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      {isProjectDev && (
                        <button
                          onClick={() => navigate('/services/custom-engineering')}
                          className="px-4 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                        >
                          Learn More
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      }

      case 'company_intro':
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 border border-[#DCEAF5] py-14 bg-gradient-to-br from-[#FFFFFF] to-[#F0F8FF] rounded-2xl px-6 sm:px-10 shadow-xs">
              <div className="lg:col-span-5 space-y-4">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'MANUFACTURING & ENGINEERING CAPABILITIES'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D] text-balance">
                  {sec.heading || 'Indigenous UAV Manufacturing & Hardware Execution'}
                </h2>
                <p className="text-[#263746] text-sm sm:text-base leading-relaxed">
                  {sec.body ||
                    'NexusTekFusion Private Limited unites KRASHIVANTRI agricultural drone manufacturing, precision drone hardware & electronics supply, and end-to-end engineering project development from our Nagpur facility.'}
                </p>
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    onClick={() =>
                      navigate(
                        sec.primaryCtaLink && !sec.primaryCtaLink.startsWith('/about')
                          ? sec.primaryCtaLink
                          : '/krashivantri'
                      )
                    }
                    className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
                  >
                    {sec.primaryCtaLabel && !/company profile|about us/i.test(sec.primaryCtaLabel)
                      ? sec.primaryCtaLabel
                      : 'Explore KRASHIVANTRI'}{' '}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/nagpur')}
                    className="text-sm font-semibold text-[#123B5D] hover:text-[#42A5F5] inline-flex items-center gap-1"
                  >
                    Nagpur Operations <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  [
                    'KRASHIVANTRI Agri-UAVs',
                    'KRASHIVANTRI X and KRASHIVANTRI X PRO precision spraying platforms built for Indian agricultural conditions.',
                  ],
                  [
                    'Drone Hardware Store',
                    'Industrial propulsion systems, flight controllers, ESC stacks, GNSS/RTK GPS modules, pumps, and batteries ready to ship.',
                  ],
                  [
                    'Engineering R&D Execution',
                    'Custom industrial and academic builds with 14-category itemized quotations, milestone tracking, and verified deliverables.',
                  ],
                  [
                    'Diagnostics & 3D Prototyping',
                    'Agricultural UAV bench diagnostics, single/double-layer PCB validation, and rapid carbon-reinforced 3D prototyping.',
                  ],
                ].map(([title, desc]) => (
                  <div key={title} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-1.5 shadow-xs">
                    <h3 className="font-display font-bold text-[#123B5D]">{title}</h3>
                    <p className="text-sm text-[#263746] leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );

      case 'categories':
        if (categories.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'ENGINEERING HARDWARE STORE'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Store Categories & Precision Drone Components'}
                </h2>
                {sec.subheading && <p className="text-sm text-[#263746] max-w-2xl">{sec.subheading}</p>}
              </div>
              <button
                onClick={() => navigate('/store')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                Open Full Store <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.filter((c) => c.storeScope === 'general').slice(0, 14).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => navigate(`/store/category/${cat.slug}`)}
                  className="text-left rounded-xl border border-[#DCEAF5] bg-white p-5 hover:border-[#64B5F6] hover:bg-[#F0F8FF]/50 transition-colors space-y-1.5 shadow-xs"
                >
                  <div className="font-display font-bold text-sm text-[#123B5D]">{cat.name}</div>
                  <p className="text-xs text-[#263746] line-clamp-2">
                    {cmsContent?.storeContent?.categoryDescriptions?.[cat.slug] || cat.description}
                  </p>
                </button>
              ))}
            </div>
          </section>
        );

      case 'featured_products':
        if (featuredProducts.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            {promoBanners.length > 0 && (
              <div className="space-y-4">
                {promoBanners.map((ban) => (
                  <div
                    key={ban.bannerKey}
                    className="rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center shadow-xs"
                  >
                    {(ban.videoUrl || ban.imageUrl) && (
                      <div className="lg:col-span-5 aspect-[16/9] lg:aspect-auto lg:h-full bg-[#F0F8FF] border-b lg:border-b-0 lg:border-r border-[#DCEAF5]">
                        {ban.videoUrl ? (
                          <video
                            src={ban.videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            poster={ban.imageUrl || undefined}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img src={ban.imageUrl} alt={ban.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                    <div
                      className={`${
                        ban.videoUrl || ban.imageUrl ? 'lg:col-span-7' : 'lg:col-span-12'
                      } p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
                    >
                      <div className="space-y-1.5">
                        <div className="font-display text-xl sm:text-2xl font-bold text-[#123B5D]">{ban.title}</div>
                        {ban.subtitle && <p className="text-xs sm:text-sm text-[#263746]">{ban.subtitle}</p>}
                      </div>
                      {ban.ctaLabel && ban.ctaLink && (
                        <button
                          onClick={() => navigate(ban.ctaLink)}
                          className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                        >
                          {ban.ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'Drone Parts & Electronics Store'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Featured Store Products'}
                </h2>
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/store')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'Visit Engineering Store'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {renderProductGrid(featuredProducts)}
          </section>
        );

      case 'bestsellers':
        if (bestsellerProducts.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'High-Demand Components'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'In-Demand Drone & Electronics Components'}
                </h2>
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/store')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'Browse Store'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {renderProductGrid(bestsellerProducts.slice(0, 4))}
          </section>
        );

      case 'new_arrivals':
        if (newArrivalProducts.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'Latest Inventory'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'New Hardware in Store'}
                </h2>
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/store')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'View New Stock'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {renderProductGrid(newArrivalProducts.slice(0, 4))}
          </section>
        );

      case 'printing_and_projects':
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-[#DCEAF5] bg-white p-8 flex flex-col justify-between space-y-6 shadow-xs">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                    ON-DEMAND ADDITIVE MANUFACTURING
                  </div>
                  <h2 className="font-display text-2xl font-bold text-[#123B5D]">
                    Online 3D Printing &amp; Instant CAD Quoting
                  </h2>
                  <p className="text-sm text-[#263746] leading-relaxed">
                    Upload STL, OBJ, 3MF, STEP, or IGES files, inspect geometry in our interactive 3D viewport, choose FDM or SLA materials, receive automated slicing calculations, and order online.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-[#263746]">
                    {[
                      'STL / OBJ Auto Volumetric Slicing',
                      'PLA+ · PETG · PA12-CF · TPU · SLA',
                      'Configurable Infill & Layer Height',
                      'Direct Nagpur Fabrication & Shipping',
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#64B5F6] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate('/services/3d-printing')}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    Upload Your 3D Model <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/store/3d-printed-products')}
                    className="px-4 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                  >
                    Ready 3D Products
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-8 flex flex-col justify-between space-y-6 shadow-xs">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-semibold text-[#42A5F5] uppercase tracking-wider">
                    50% ADVANCE + 50% HANDOVER MILESTONE WORKFLOW
                  </div>
                  <h2 className="font-display text-2xl font-bold text-[#123B5D]">
                    Project Development &amp; Structured Delivery
                  </h2>
                  <p className="text-sm text-[#263746] leading-relaxed">
                    Submit your Robotics, Embedded, IoT, AI/ML, PCB, or UAV project requirements. Every build follows itemized quotation approval, 50% mobilization advance, live milestone progress, and final clearance before full source &amp; hardware handover.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 pt-2 text-xs">
                    {[
                      '1. Scope & Engineering Review',
                      '2. Itemized Quote & 50% Advance',
                      '3. Build, Test & Progress Logs',
                      '4. 50% Balance & Full Handover',
                    ].map((step) => (
                      <div key={step} className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#123B5D] font-medium">
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate('/register-project')}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    Register Your Project <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/services/custom-engineering')}
                    className="px-4 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                  >
                    View Workflow Details
                  </button>
                </div>
              </div>
            </div>
          </section>
        );

      case 'why_us':
        return (
          <section key={sec.id} className="bg-[#F0F8FF] border-y border-[#DCEAF5] py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-2">
                  <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                    {sec.kicker || 'BUILT FOR INDUSTRIAL & FIELD RELIABILITY'}
                  </div>
                  <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                    {sec.heading || 'Why Choose NexusTekFusion'}
                  </h2>
                </div>
                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                  {[
                    ['Engineering-Focused', 'Every engagement starts with technical feasibility, BOM review, and clear deliverables.'],
                    ['Agricultural UAV R&D', 'Hardware, propulsion, spraying systems, and navigation tuned for real Indian field conditions.'],
                    ['Hardware + Software', 'Unified PCB, mechanical CAD, embedded firmware, and cloud/AI telemetry dashboards.'],
                    ['In-House Prototyping', 'Rapid FDM/SLA 3D printing and electronics bench validation under one roof in Nagpur.'],
                    ['Transparent Quotations', 'Itemized estimates, revision tracking, GST documentation, and milestone visibility.'],
                    ['Dedicated Support', 'Direct engineer assignment and structured support tickets from our Nagpur headquarters.'],
                  ].map(([title, body]) => (
                    <div key={title} className="space-y-1.5">
                      <h3 className="font-display font-bold text-[#123B5D]">{title}</h3>
                      <p className="text-[#263746] leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#DCEAF5] pt-10 space-y-4">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  7-Step Engineering Execution Protocol
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    '01. Requirement',
                    '02. Research',
                    '03. Design',
                    '04. Development',
                    '05. Prototyping',
                    '06. Testing',
                    '07. Delivery',
                  ].map((step) => (
                    <div
                      key={step}
                      className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-3 text-xs font-mono font-semibold text-[#123B5D] text-center shadow-xs"
                    >
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );

      case 'industries_applications':
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="space-y-2 max-w-3xl">
              <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                {sec.kicker || 'SECTORS WE SERVE'}
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                {sec.heading || 'Industries & Applications'}
              </h2>
              {sec.subheading && <p className="text-sm text-[#263746]">{sec.subheading}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: Sprout,
                  title: 'Precision Agriculture & FPOs',
                  desc: 'KRASHIVANTRI spraying drones, certified DaaS operations, and field-serviceable pump & propulsion spares.',
                  to: '/krashivantri',
                },
                {
                  icon: GraduationCap,
                  title: 'Engineering Institutes & Academic R&D',
                  desc: 'Sponsored UAV/robotics testbeds, final-year engineering prototypes, and institutional B2B lab kits.',
                  to: '/register-project',
                },
                {
                  icon: Rocket,
                  title: 'Startups & Product Teams',
                  desc: 'Rapid 3D printed enclosures, single/double-layer PCBs, embedded firmware, and functional MVP hardware.',
                  to: '/services/3d-printing',
                },
                {
                  icon: Factory,
                  title: 'Industrial Automation & Survey',
                  desc: 'Custom telemetry nodes, autonomous inspection rovers, UAV diagnostics, and bulk B2B procurement.',
                  to: '/b2b',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.title}
                    onClick={() => navigate(item.to)}
                    className="text-left rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 hover:border-[#64B5F6] hover:bg-[#F0F8FF]/40 transition-colors shadow-xs"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] text-[#42A5F5] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#123B5D]">{item.title}</h3>
                    <p className="text-xs sm:text-sm text-[#263746] leading-relaxed">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </section>
        );

      case 'faqs_section': {
        const faqs = settings.faqs || [];
        if (faqs.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'FREQUENTLY ASKED QUESTIONS'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Technical & Commercial Answers'}
                </h2>
                {sec.subheading && <p className="text-sm text-[#263746] max-w-2xl">{sec.subheading}</p>}
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/faq')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'View All FAQs'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div
                    key={faq.q}
                    className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden shadow-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                      className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-[#F0F8FF] transition-colors"
                    >
                      <span className="font-display font-semibold text-sm sm:text-base text-[#123B5D]">
                        {faq.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#64B5F6] shrink-0 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 text-sm text-[#263746] leading-relaxed border-t border-[#DCEAF5] pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      }

      case 'contact_enquiry':
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="rounded-2xl bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-8 sm:p-12 border border-[#90CAF9] grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-xs">
              <div className="lg:col-span-7 space-y-3">
                <div className="text-xs font-mono font-semibold text-[#42A5F5] uppercase tracking-wider">
                  {sec.kicker || 'NAGPUR HEADQUARTERS & ENGINEERING DESK'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Connect with Our Engineering Team'}
                </h2>
                <p className="text-[#263746] text-sm sm:text-base leading-relaxed">
                  {sec.subheading ||
                    'Schedule a KRASHIVANTRI drone briefing, book UAV diagnostics in Nagpur, or discuss custom engineering development with our technical desk.'}
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate(sec.primaryCtaLink || '/contact')}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                  >
                    {sec.primaryCtaLabel || 'Contact Support Desk'} <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/register-project')}
                    className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                  >
                    Register Your Project
                  </button>
                  <button
                    onClick={() => navigate(sec.secondaryCtaLink || '/nagpur')}
                    className="px-5 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                  >
                    {sec.secondaryCtaLabel || 'Explore Nagpur Operations'}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 rounded-xl bg-white border border-[#DCEAF5] p-6 space-y-3 text-xs shadow-xs">
                <div className="flex items-center gap-2 text-[#42A5F5] font-mono font-semibold uppercase">
                  <Building2 className="w-4 h-4" /> Corporate Office
                </div>
                <div className="font-display text-sm font-bold text-[#123B5D]">
                  {company?.legalName || 'NEXUSTEKFUSION PRIVATE LIMITED'}
                </div>
                <div className="flex items-start gap-2 text-[#263746] leading-relaxed">
                  <MapPin className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                  <span>
                    {company?.address ||
                      'H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, Maharashtra, India'}
                  </span>
                </div>
                <div className="font-mono text-[#263746] space-y-1 pt-2 border-t border-[#DCEAF5]">
                  <div>Email: {customerCareEmail}</div>
                  <div>CIN: {company?.cin || 'U30305ME2026PTC474052'}</div>
                </div>
                <div className="flex gap-4 pt-1 font-semibold">
                  <button onClick={() => navigate('/nagpur')} className="text-[#42A5F5] hover:text-[#123B5D] underline">
                    Nagpur Hub
                  </button>
                  <button onClick={() => navigate('/maharashtra')} className="text-[#42A5F5] hover:text-[#123B5D] underline">
                    Maharashtra Coverage
                  </button>
                </div>
              </div>
            </div>
          </section>
        );

      case 'krashivantri_apps': {
        const apps = settings.appLinks || [];
        if (apps.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'Mobile Ecosystem'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'KRASHIVANTRI Digital Portals & Applications'}
                </h2>
                {sec.subheading && <p className="text-sm text-[#263746] max-w-2xl">{sec.subheading}</p>}
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/krashivantri')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'Open KRASHIVANTRI'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {apps.map((app) => (
                <div key={app.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 flex flex-col justify-between space-y-4 shadow-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#42A5F5] font-semibold">
                      <span>{app.role}</span>
                      <Smartphone className="w-4 h-4 text-[#64B5F6]" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#123B5D]">{app.name}</h3>
                    <p className="text-sm text-[#263746]">{app.description}</p>
                  </div>
                  {app.comingSoon || (!app.playStoreUrl && !app.apkDownloadUrl) ? (
                    <div className="text-xs font-semibold text-[#123B5D] bg-[#F0F8FF] border border-[#DCEAF5] rounded-lg px-3 py-2 w-fit">
                      Coming Soon on Google Play
                    </div>
                  ) : (
                    <a
                      href={app.playStoreUrl || app.apkDownloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg w-fit inline-flex items-center gap-1.5 transition-colors"
                    >
                      Get App <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      }

      case 'case_studies':
        if (caseStudies.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                  {sec.kicker || 'Applied Engineering'}
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Engineering R&D & Academic Projects'}
                </h2>
              </div>
              <button
                onClick={() => navigate(sec.primaryCtaLink || '/projects')}
                className="text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1.5"
              >
                {sec.primaryCtaLabel || 'View All Projects'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {caseStudies.slice(0, 4).map((cs) => (
                <div key={cs.id} className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between shadow-xs hover:border-[#64B5F6] transition-colors">
                  <div>
                    <div className="aspect-[16/9] bg-[#F0F8FF]">
                      <img
                        src={cs.imageUrl || ROBOT_IMG}
                        alt={cs.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="text-xs text-[#42A5F5] font-medium">{cs.relatedServices.join(' · ')}</div>
                      <h3 className="font-display text-xl font-bold text-[#123B5D]">{cs.title}</h3>
                      <p className="text-sm text-[#263746] leading-relaxed">{cs.description}</p>
                      <div className="pt-2 border-t border-[#DCEAF5] text-xs text-[#263746] space-y-1">
                        <div>
                          <span className="font-semibold text-[#123B5D]">Technologies:</span> {cs.technologyUsed}
                        </div>
                        <div>
                          <span className="font-semibold text-[#123B5D]">Applications:</span> {cs.applications}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-5">
                    <button
                      onClick={() => navigate(`/projects/${cs.slug}`)}
                      className="text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline inline-flex items-center gap-1"
                    >
                      View Project Details <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );

      case 'testimonials': {
        const list = settings.testimonials || [];
        if (list.length === 0) return null;
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
            <div className="space-y-1.5">
              <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
                {sec.kicker || 'Verified Client Feedback'}
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                {sec.heading || 'Engineering & Store Feedback'}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {list.map((t, idx) => (
                <div key={idx} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-xs">
                  <p className="text-sm text-[#263746] leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                  <div className="text-xs text-[#263746]/70 pt-2 border-t border-[#DCEAF5]">
                    <span className="font-semibold text-[#123B5D]">{t.name}</span> · {t.role} ({t.org})
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }

      case 'cta':
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="rounded-2xl bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-8 sm:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-[#90CAF9] shadow-xs">
              <div className="space-y-2 max-w-2xl">
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                  {sec.heading || 'Ready to Deploy KRASHIVANTRI or Build Your Engineering System?'}
                </h2>
                <p className="text-[#263746] text-sm sm:text-base">
                  {sec.subheading ||
                    'Schedule an agricultural drone demonstration, request bulk hardware supply, or register your custom engineering project with our Nagpur team.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0">
                <button
                  onClick={() => navigate(sec.primaryCtaLink || '/register-project')}
                  className="px-5 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg whitespace-nowrap transition-colors"
                >
                  {sec.primaryCtaLabel || 'Register Your Project'}
                </button>
                <button
                  onClick={() => navigate(sec.secondaryCtaLink || '/contact')}
                  className="px-5 py-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg whitespace-nowrap transition-colors"
                >
                  {sec.secondaryCtaLabel || 'Contact Our Team'}
                </button>
              </div>
            </div>
          </section>
        );

      case 'custom_block':
        return (
          <section key={sec.id} className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-xs">
              <div className={sec.imageUrl || sec.videoUrl ? 'lg:col-span-7 space-y-4' : 'lg:col-span-12 space-y-4'}>
                {sec.kicker && (
                  <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">{sec.kicker}</div>
                )}
                {sec.heading && (
                  <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#123B5D]">
                    {sec.heading}
                  </h2>
                )}
                {sec.subheading && (
                  <p className="text-sm sm:text-base text-[#263746] leading-relaxed">{sec.subheading}</p>
                )}
                {sec.body && (
                  <p className="text-sm text-[#263746] leading-relaxed whitespace-pre-line">{sec.body}</p>
                )}
                {sec.customItems && sec.customItems.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {sec.customItems.map((item, idx) => (
                      <div key={idx} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-1">
                        <div className="font-display font-bold text-sm text-[#123B5D]">{item.title}</div>
                        <p className="text-xs text-[#263746] leading-relaxed">{item.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                {(sec.primaryCtaLabel || sec.secondaryCtaLabel) && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {sec.primaryCtaLabel && (
                      <button
                        onClick={() => navigate(sec.primaryCtaLink || '/contact')}
                        className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                      >
                        {sec.primaryCtaLabel} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {sec.secondaryCtaLabel && (
                      <button
                        onClick={() =>
                          navigate(
                            sec.secondaryCtaLink && !sec.secondaryCtaLink.startsWith('/about')
                              ? sec.secondaryCtaLink
                              : '/krashivantri'
                          )
                        }
                        className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap transition-colors"
                      >
                        {sec.secondaryCtaLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {(sec.videoUrl || sec.imageUrl) && (
                <div className="lg:col-span-5 rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] aspect-[16/10]">
                  {sec.videoUrl ? (
                    <video
                      src={sec.videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      poster={sec.imageUrl || undefined}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={sec.imageUrl}
                      alt={sec.heading || 'NexusTekFusion content section'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              )}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-20 bg-[#FFFFFF]">
      {previewDraft && (
        <div className="bg-[#F0F8FF] border-b border-[#90CAF9] px-4 py-2 text-center text-xs font-semibold text-[#123B5D]">
          Draft Layout Preview Mode — Only visible to authenticated Administrators until published.
        </div>
      )}
      {layoutList.map((sec) => renderSection(sec))}
    </div>
  );
};
