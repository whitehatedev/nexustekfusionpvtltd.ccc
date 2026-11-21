import type { SiteSettings } from '../types/platform';

export const SITE_BASE_URL = 'https://nexustekfusion.in';
export const DEFAULT_SITE_LOGO = '/assets/aistudio/image_1a5ac752.png';
export const DEFAULT_SITE_OG_IMAGE = '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface DynamicSeoOverride {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
  ogDescription?: string;
  ogType?: 'website' | 'article' | 'product';
  robots?: string;
  breadcrumbs?: BreadcrumbItem[];
  schemas?: Record<string, unknown>[];
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
  keywords: string;
  robots: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  ogType: string;
  googleSiteVerification?: string;
  schemas: Record<string, unknown>[];
}

export function normalizeSeoPath(pathname: string): string {
  const clean = (pathname || '/').split('?')[0].split('#')[0] || '/';
  return clean !== '/' && clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

export function toAbsoluteUrl(urlOrPath: string, baseUrl = SITE_BASE_URL): string {
  if (!urlOrPath) return baseUrl;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${cleanBase}${cleanPath}`;
}

export function isNoindexRoute(pathname: string, search = ''): boolean {
  const path = normalizeSeoPath(pathname);
  if (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/customer/dashboard' ||
    path.startsWith('/customer/dashboard/') ||
    path === '/partner/dashboard' ||
    path === '/mitra/dashboard' ||
    path === '/fpo/dashboard' ||
    path === '/my-account' ||
    path.startsWith('/my-account/') ||
    path === '/checkout' ||
    path === '/cart' ||
    path === '/login' ||
    path === '/register' ||
    path === '/auth/callback'
  ) {
    return true;
  }
  if (search) {
    const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(cleanSearch);
    if (params.has('q') || params.get('previewDraft') === 'true' || params.get('preview') === 'true') {
      return true;
    }
  }
  return false;
}

export function buildOrganizationAndLocalBusinessSchema(
  companyInfo?: SiteSettings['companyInfo'],
  baseUrl = SITE_BASE_URL
): Record<string, unknown> {
  const legalName = companyInfo?.legalName || 'NEXUSTEKFUSION PRIVATE LIMITED';
  const brandName = companyInfo?.brandName || 'NexusTekFusion';
  const email = companyInfo?.email || companyInfo?.customerCareEmail || 'info@nexustekfusion.in';
  const socialLinks = companyInfo?.socialLinks
    ? Object.values(companyInfo.socialLinks).filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
    : [];

  return {
    '@type': ['Organization', 'LocalBusiness'],
    '@id': `${baseUrl}/#organization`,
    name: legalName,
    alternateName: brandName,
    url: baseUrl,
    logo: toAbsoluteUrl(DEFAULT_SITE_LOGO, baseUrl),
    image: toAbsoluteUrl(DEFAULT_SITE_OG_IMAGE, baseUrl),
    email,
    ...(companyInfo?.contactPhone ? { telephone: companyInfo.contactPhone } : {}),
    identifier: {
      '@type': 'PropertyValue',
      name: 'CIN',
      value: companyInfo?.cin || 'U30305ME2026PTC474052',
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth',
      addressLocality: 'Nagpur',
      addressRegion: 'Maharashtra',
      postalCode: '440018',
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 21.1458,
      longitude: 79.0882,
    },
    areaServed: ['Nagpur', 'Vidarbha', 'Maharashtra', 'India'],
    openingHours: 'Mo-Sa 10:00-19:00',
    ...(socialLinks.length > 0 ? { sameAs: socialLinks } : {}),
  };
}

export function buildWebsiteSchema(baseUrl = SITE_BASE_URL): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    url: baseUrl,
    name: 'NEXUSTEKFUSION PRIVATE LIMITED',
    publisher: { '@id': `${baseUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/shop?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildBreadcrumbSchema(
  items: BreadcrumbItem[],
  baseUrl = SITE_BASE_URL
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: toAbsoluteUrl(item.url, baseUrl),
    })),
  };
}

export function buildProductSchema(
  input: {
    name: string;
    description: string;
    sku: string;
    brand?: string;
    imageUrl?: string;
    url: string;
    priceInr?: number | null;
    inStock?: boolean;
    quoteOnly?: boolean;
    ratingValue?: number | null;
    reviewCount?: number | null;
  },
  baseUrl = SITE_BASE_URL
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@type': 'Product',
    name: input.name,
    description: input.description,
    sku: input.sku,
    brand: {
      '@type': 'Brand',
      name: input.brand || 'NexusTekFusion',
    },
    image: toAbsoluteUrl(input.imageUrl || DEFAULT_SITE_OG_IMAGE, baseUrl),
    url: toAbsoluteUrl(input.url, baseUrl),
  };

  if (!input.quoteOnly && typeof input.priceInr === 'number' && input.priceInr > 0) {
    schema.offers = {
      '@type': 'Offer',
      url: toAbsoluteUrl(input.url, baseUrl),
      priceCurrency: 'INR',
      price: input.priceInr,
      availability: input.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${baseUrl}/#organization` },
    };
  }

  if (
    typeof input.reviewCount === 'number' &&
    input.reviewCount > 0 &&
    typeof input.ratingValue === 'number' &&
    input.ratingValue > 0
  ) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(input.ratingValue.toFixed(1)),
      reviewCount: input.reviewCount,
    };
  }

  return schema;
}

export function buildServiceSchema(
  input: {
    name: string;
    serviceType: string;
    description: string;
    url: string;
    areaServed?: string[];
  },
  baseUrl = SITE_BASE_URL
): Record<string, unknown> {
  return {
    '@type': 'Service',
    name: input.name,
    serviceType: input.serviceType,
    description: input.description,
    url: toAbsoluteUrl(input.url, baseUrl),
    provider: { '@id': `${baseUrl}/#organization` },
    areaServed: input.areaServed || ['Nagpur', 'Maharashtra', 'India'],
  };
}

export function buildFaqSchema(items: Array<{ q: string; a: string }>): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

export function buildArticleSchema(
  input: {
    headline: string;
    description: string;
    url: string;
    imageUrl?: string;
    datePublished?: string;
    dateModified?: string;
    authorName?: string;
    category?: string;
  },
  baseUrl = SITE_BASE_URL
): Record<string, unknown> {
  return {
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: toAbsoluteUrl(input.url, baseUrl),
    image: toAbsoluteUrl(input.imageUrl || DEFAULT_SITE_OG_IMAGE, baseUrl),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.category ? { articleSection: input.category } : {}),
    author: {
      '@type': 'Organization',
      name: input.authorName || 'NexusTekFusion Engineering Desk',
    },
    publisher: { '@id': `${baseUrl}/#organization` },
  };
}

const BUILTIN_ROUTE_DEFAULTS: Record<string, { title: string; description: string; keywords: string }> = {
  '/': {
    title: 'NEXUSTEKFUSION PRIVATE LIMITED — Agricultural Drones, KRASHIVANTRI & Engineering Services',
    description:
      'Indigenous agricultural drone manufacturer in Nagpur, India. Explore KRASHIVANTRI X & X PRO spraying drones, 3D printing, custom engineering project development, and UAV hardware store.',
    keywords:
      'NexusTekFusion, KRASHIVANTRI, agricultural drone manufacturer India, Nagpur drone company, 3D printing Nagpur, custom engineering projects',
  },
  '/krashivantri': {
    title: 'KRASHIVANTRI Agricultural Drones & Spraying Ecosystem | NexusTekFusion',
    description:
      'Explore KRASHIVANTRI X (₹4,50,000) and KRASHIVANTRI X PRO (₹5,60,000) agricultural spraying drones, Farmer Spraying Portal, and Drone Pilot Portal.',
    keywords: 'KRASHIVANTRI, KRASHIVANTRI X, KRASHIVANTRI X PRO, agriculture drone spraying India',
  },
  '/krashivantri-x': {
    title: 'KRASHIVANTRI X Agricultural Drone — ₹4,50,000 | NexusTekFusion',
    description:
      'Smart Agriculture. Precision Spraying. Order KRASHIVANTRI X agricultural spraying drone or request an institutional briefing from NexusTekFusion Private Limited.',
    keywords: 'KRASHIVANTRI X, agricultural spraying drone price India, NexusTekFusion',
  },
  '/krashivantri-x-pro': {
    title: 'KRASHIVANTRI X PRO Agricultural Drone — ₹5,60,000 | NexusTekFusion',
    description:
      'Advanced Intelligence. Precision Agriculture. Order KRASHIVANTRI X PRO commercial agricultural drone or request a fleet briefing from NexusTekFusion.',
    keywords: 'KRASHIVANTRI X PRO, commercial agriculture drone India, NexusTekFusion',
  },
  '/krashivantri/compare': {
    title: 'Compare KRASHIVANTRI X vs KRASHIVANTRI X PRO | NexusTekFusion',
    description: 'Side-by-side comparison of KRASHIVANTRI X and KRASHIVANTRI X PRO agricultural UAV platforms.',
    keywords: 'compare KRASHIVANTRI X, KRASHIVANTRI X PRO comparison',
  },
  '/services': {
    title: 'Engineering Services — 3D Printing, Project Development & Drone Repair | NexusTekFusion',
    description:
      'Precision 3D printing & rapid prototyping, end-to-end engineering project development, and agricultural & commercial drone repair & diagnostics in Nagpur, India.',
    keywords:
      '3D printing services Nagpur, drone repair service India, custom engineering project development, PCB prototyping',
  },
  '/services/3d-printing': {
    title: '3D Printing & Rapid Prototyping Service — Instant STL/OBJ Quote | NexusTekFusion',
    description:
      'Upload STL, OBJ, 3MF, STEP or IGES CAD files for FDM & SLA 3D printing, mechanical parts, and rapid prototyping in Nagpur & pan-India.',
    keywords: '3D printing service India, FDM SLA 3D printing Nagpur, STL online quote, rapid prototyping',
  },
  '/services/custom-engineering': {
    title: 'Custom Engineering Project Development & Hardware Prototyping | NexusTekFusion',
    description:
      'End-to-end engineering project development across Robotics, AI/ML, IoT, Embedded Systems, PCB Design, and UAV platforms with milestone-backed execution.',
    keywords: 'custom engineering project development, final year engineering projects, hardware prototyping Nagpur',
  },
  '/services/drone-repair': {
    title: 'Drone Repair & Diagnostics Service — Nagpur & Field Dispatch | NexusTekFusion',
    description:
      'Complete agricultural and commercial drone inspection, airframe repair, ESC/motor replacement, flight controller calibration, and field support.',
    keywords: 'drone repair Nagpur, agricultural drone servicing, UAV diagnostics center India',
  },
  '/services/pcb-design': {
    title: 'Single & Double-Layer PCB Design & Gerber Quoting | NexusTekFusion',
    description:
      'Upload Gerber files and BOM for single-layer and double-layer PCB fabrication, DFM check, and custom electronics assembly.',
    keywords: 'PCB fabrication Nagpur, Gerber online quote, single double layer PCB India',
  },
  '/store': {
    title: 'Drone Components, Avionics & Engineering Hardware Store | NexusTekFusion',
    description:
      'Shop agricultural drones, propulsion motors, FOC ESCs, flight controllers, LiPo batteries, spraying pumps, GPS sensors, and 3D printed UAV hardware.',
    keywords: 'drone parts store India, agricultural drone components, brushless motors, flight controllers',
  },
  '/shop': {
    title: 'Drone Components, Avionics & Engineering Hardware Store | NexusTekFusion',
    description:
      'Shop agricultural drones, propulsion motors, FOC ESCs, flight controllers, LiPo batteries, spraying pumps, GPS sensors, and 3D printed UAV hardware.',
    keywords: 'drone parts store India, agricultural drone components, brushless motors, flight controllers',
  },
  '/store/3d-printed-products': {
    title: '3D Printed UAV & Mechanical Products Store | NexusTekFusion',
    description: 'Ready-to-ship PA12-CF, PETG, and TPU 3D printed drone mounts, gearboxes, and engineering hardware.',
    keywords: '3D printed drone parts, PA12-CF UAV mounts, additive hardware store',
  },
  '/projects': {
    title: 'Engineering R&D Showcase & Project Gallery | NexusTekFusion',
    description:
      'Explore agricultural drone architectures, ROS2 robotics rovers, embedded electronics, and rapid additive prototypes by NexusTekFusion.',
    keywords: 'engineering R&D projects, robotics showcase, UAV development portfolio',
  },
  '/register-project': {
    title: 'Register Your Engineering Project | NexusTekFusion Private Limited',
    description:
      'Submit your custom hardware, software, IoT, AI/ML, robotics, drone, or PCB project brief for technical evaluation and quotation.',
    keywords: 'register engineering project, custom hardware quote, engineering project portal',
  },
  '/b2b': {
    title: 'B2B, FPO & Institutional Bulk Procurement Portal | NexusTekFusion',
    description:
      'Volume quotations and institutional procurement for agricultural drone fleets, spare parts, 3D printed batches, and custom R&D labs.',
    keywords: 'B2B drone procurement, institutional robotics lab equipment, FPO drone fleet',
  },
  '/blogs': {
    title: 'Engineering Journal — Agricultural Drones, 3D Printing & Robotics | NexusTekFusion',
    description:
      'Technical articles on agricultural drone technology, 3D printing & manufacturing, robotics & embedded engineering, and UAV maintenance.',
    keywords: 'agricultural drone blog, 3D printing manufacturing articles, UAV maintenance guide',
  },
  '/nagpur': {
    title: 'Agricultural Drones, 3D Printing & Engineering Services in Nagpur | NexusTekFusion',
    description:
      'Visit NexusTekFusion Private Limited in Ganjipeth, Nagpur for KRASHIVANTRI agricultural drones, drone repair workshop, 3D printing, and engineering project development.',
    keywords: 'drone company in Nagpur, agricultural drone Nagpur, 3D printing service Nagpur, drone repair Nagpur',
  },
  '/maharashtra': {
    title: 'Agricultural Drone Manufacturer & Engineering Partner Across Maharashtra | NexusTekFusion',
    description:
      'Serving Nagpur, Vidarbha, Amravati, Wardha, Pune, Nashik, and pan-Maharashtra with KRASHIVANTRI spraying drones, field UAV service, and custom engineering.',
    keywords: 'agricultural drone Maharashtra, Vidarbha crop spraying drone, drone manufacturer Maharashtra',
  },
  '/contact': {
    title: 'Contact NexusTekFusion Private Limited — Nagpur Headquarters',
    description:
      'Reach NexusTekFusion Private Limited at Ganjipeth, Nagpur for KRASHIVANTRI drone demonstrations, repair support, hardware store orders, and engineering enquiries.',
    keywords: 'contact NexusTekFusion, Nagpur drone manufacturer, info@nexustekfusion.in',
  },
  '/faq': {
    title: 'Frequently Asked Questions — Drones, Store, 3D Printing & Projects | NexusTekFusion',
    description:
      'Answers on KRASHIVANTRI agricultural drones, pan-India shipping, GST invoicing, 3D printing file formats, PCB quoting, and project milestones.',
    keywords: 'NexusTekFusion FAQ, agricultural drone FAQ, 3D printing file formats',
  },
};

export function resolveRouteSeo(input: {
  pathname: string;
  search?: string;
  seoConfig?: SiteSettings['seoConfig'];
  companyInfo?: SiteSettings['companyInfo'];
  override?: DynamicSeoOverride | null;
  baseUrl?: string;
}): ResolvedSeoMetadata {
  const baseUrl = input.baseUrl || SITE_BASE_URL;
  const cleanPath = normalizeSeoPath(input.pathname);
  const seo = input.seoConfig;
  const routes = Array.isArray(seo?.routes) ? seo.routes : [];

  const matchedConfig =
    routes.find((r) => normalizeSeoPath(r.route) === cleanPath) ||
    (cleanPath.startsWith('/store/category/')
      ? routes.find((r) => r.route === '/store' || r.route === '/shop')
      : undefined);

  const builtin = BUILTIN_ROUTE_DEFAULTS[cleanPath];
  const ov = input.override;

  const title =
    ov?.title ||
    matchedConfig?.title ||
    builtin?.title ||
    seo?.defaultTitle ||
    'NEXUSTEKFUSION PRIVATE LIMITED — Agricultural Drone Manufacturing & KRASHIVANTRI';

  const description =
    ov?.description ||
    matchedConfig?.description ||
    builtin?.description ||
    seo?.defaultDescription ||
    'Indigenous agricultural drone manufacturing, precision engineering services, 3D printing, and hardware store from Nagpur, India.';

  const keywords =
    ov?.keywords ||
    matchedConfig?.keywords ||
    builtin?.keywords ||
    seo?.defaultKeywords ||
    'NexusTekFusion, KRASHIVANTRI, agricultural drone, Nagpur';

  const noindex = isNoindexRoute(cleanPath, input.search || '');
  const robots = ov?.robots || matchedConfig?.robots || (noindex ? 'noindex, nofollow' : 'index, follow');

  const canonicalPath = cleanPath === '/shop' ? '/store' : cleanPath;
  const canonicalUrl = toAbsoluteUrl(
    ov?.canonicalUrl || matchedConfig?.canonicalUrl || canonicalPath,
    baseUrl
  );

  const ogImageUrl = toAbsoluteUrl(
    ov?.ogImageUrl || matchedConfig?.ogImageUrl || seo?.defaultOgImageUrl || DEFAULT_SITE_OG_IMAGE,
    baseUrl
  );

  const ogDescription =
    ov?.ogDescription || matchedConfig?.socialDescription || description;

  const breadcrumbs =
    ov?.breadcrumbs ||
    (cleanPath !== '/'
      ? [
          { name: 'Home', url: '/' },
          {
            name:
              cleanPath
                .split('/')
                .filter(Boolean)
                .pop()
                ?.replace(/-/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Page',
            url: canonicalPath,
          },
        ]
      : undefined);

  const schemas: Record<string, unknown>[] = [
    buildOrganizationAndLocalBusinessSchema(input.companyInfo, baseUrl),
    buildWebsiteSchema(baseUrl),
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: title,
      description,
      isPartOf: { '@id': `${baseUrl}/#website` },
    },
  ];

  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push(buildBreadcrumbSchema(breadcrumbs, baseUrl));
  }

  if (ov?.schemas && ov.schemas.length > 0) {
    schemas.push(...ov.schemas);
  }

  return {
    title,
    description,
    keywords,
    robots,
    canonicalUrl,
    ogTitle: title,
    ogDescription,
    ogImageUrl,
    ogType: ov?.ogType || 'website',
    googleSiteVerification: seo?.googleSiteVerification?.trim() || undefined,
    schemas,
  };
}

export function buildJsonLdGraphString(schemas: Record<string, unknown>[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': schemas,
  });
}

export function applySeoToDocument(resolved: ResolvedSeoMetadata): void {
  if (typeof document === 'undefined') return;
  document.title = resolved.title;

  const upsertMeta = (attr: 'name' | 'property', key: string, content?: string) => {
    const existing = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
    if (!content) {
      if (existing) existing.remove();
      return;
    }
    const el = existing || document.createElement('meta');
    if (!existing) {
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.content = content;
  };

  upsertMeta('name', 'description', resolved.description);
  upsertMeta('name', 'keywords', resolved.keywords);
  upsertMeta('name', 'robots', resolved.robots);
  upsertMeta('name', 'google-site-verification', resolved.googleSiteVerification);

  upsertMeta('property', 'og:title', resolved.ogTitle);
  upsertMeta('property', 'og:description', resolved.ogDescription);
  upsertMeta('property', 'og:image', resolved.ogImageUrl);
  upsertMeta('property', 'og:url', resolved.canonicalUrl);
  upsertMeta('property', 'og:type', resolved.ogType);
  upsertMeta('property', 'og:site_name', 'NEXUSTEKFUSION PRIVATE LIMITED');

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', resolved.ogTitle);
  upsertMeta('name', 'twitter:description', resolved.ogDescription);
  upsertMeta('name', 'twitter:image', resolved.ogImageUrl);

  let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = resolved.canonicalUrl;

  let jsonLdScript = document.getElementById('ntf-jsonld') as HTMLScriptElement | null;
  if (!jsonLdScript) {
    jsonLdScript = document.createElement('script');
    jsonLdScript.id = 'ntf-jsonld';
    jsonLdScript.type = 'application/ld+json';
    document.head.appendChild(jsonLdScript);
  }
  jsonLdScript.textContent = buildJsonLdGraphString(resolved.schemas);
}
