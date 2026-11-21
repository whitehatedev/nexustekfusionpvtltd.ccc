import { count, eq } from 'drizzle-orm';
import { db, isCloudDatabaseConfigured, isCloudDbReady, verifyCloudDatabaseConnection } from '../db/index.ts';
import { ensureInitialAdminUser } from '../db/users.ts';
import {
  blogs,
  brands,
  caseStudies,
  coupons,
  printingMachines,
  printingMaterials,
  productCategories,
  products,
  siteSettings,
  teamMembers,
  websiteBanners,
} from '../db/schema.ts';
import { ensureCmsTablesExist } from '../db/ensure-cms-tables.ts';
import {
  DEFAULT_CMS_BUNDLE,
  DEFAULT_SEO_CONFIG,
  DEFAULT_TEAM_MEMBERS_SEED,
  DEFAULT_WEBSITE_BANNERS_SEED,
  pickNeutralAvatar,
} from './cms-defaults.ts';
import { DEFAULT_PCB_PRICING_CONFIG } from './gerber.ts';

let seededOnce = false;

export const DEFAULT_HOMEPAGE_SECTIONS = [
  {
    id: 'hero',
    type: 'hero',
    visible: true,
    kicker: 'NEXUSTEKFUSION PRIVATE LIMITED',
    heading: 'Engineering Intelligence. Manufacturing Innovation.',
    subheading: 'Agricultural Drone Manufacturing | Precision Engineering | Advanced Technology Development',
    body: 'We unite indigenous agricultural drone manufacturing, precision 3D printing & rapid prototyping, custom engineering R&D, and a pan-India drone hardware store from Nagpur, Maharashtra.',
    primaryCtaLabel: 'Explore KRASHIVANTRI',
    primaryCtaLink: '/krashivantri',
    secondaryCtaLabel: 'Explore Our Services',
    secondaryCtaLink: '/services',
    imageUrl: '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
  },
  {
    id: 'agri_fpv_showcase',
    type: 'agri_fpv_showcase',
    visible: true,
    kicker: 'FLAGSHIP AGRICULTURAL UAV PLATFORMS',
    heading: 'KRASHIVANTRI — Agricultural Drone Systems',
    subheading:
      'Indigenous multi-rotor spraying drones engineered for Indian field endurance, modular servicing, and verified performance across commercial and institutional operations.',
    primaryCtaLabel: 'Explore KRASHIVANTRI',
    primaryCtaLink: '/krashivantri',
    secondaryCtaLabel: 'Compare Models',
    secondaryCtaLink: '/krashivantri/compare',
    imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
  },
  {
    id: 'services',
    type: 'services',
    visible: true,
    kicker: 'ENGINEERING, MANUFACTURING & UAV SUPPORT',
    heading: 'Primary Engineering Services',
    subheading:
      'Accountable technical execution across 3D printing & rapid prototyping, end-to-end project development, and agricultural & commercial drone repair.',
    primaryCtaLabel: 'Explore All Services',
    primaryCtaLink: '/services',
  },
  {
    id: 'company_intro',
    type: 'company_intro',
    visible: true,
    kicker: 'MANUFACTURING & ENGINEERING CAPABILITIES',
    heading: 'Indigenous UAV Manufacturing & Hardware Execution',
    body: 'NexusTekFusion Private Limited operates from Ganjipeth, Nagpur as an agricultural drone manufacturer, engineering services partner, 3D printing studio, and verified drone components distributor.',
    primaryCtaLabel: 'Explore KRASHIVANTRI',
    primaryCtaLink: '/krashivantri',
  },
  {
    id: 'categories',
    type: 'categories',
    visible: true,
    kicker: 'ENGINEERING HARDWARE STORE',
    heading: 'Store Categories & Precision Drone Components',
    subheading:
      'Direct-dispatch agricultural drones, propulsion motors, flight controllers, frames, smart power systems, spraying pumps, GPS sensors, embedded boards, and 3D printed hardware.',
  },
  {
    id: 'featured_products',
    type: 'featured_products',
    visible: true,
    kicker: 'Featured Drone Hardware',
    heading: 'Featured Store Products',
    primaryCtaLabel: 'Visit Engineering Store',
    primaryCtaLink: '/store',
  },
  {
    id: 'bestsellers',
    type: 'bestsellers',
    visible: true,
    kicker: 'Field-Proven Hardware',
    heading: 'In-Demand Drone & Electronics Components',
    primaryCtaLabel: 'Browse Store',
    primaryCtaLink: '/store',
  },
  {
    id: 'new_arrivals',
    type: 'new_arrivals',
    visible: true,
    kicker: 'Latest Additions',
    heading: 'New Hardware in Store',
    primaryCtaLabel: 'View New Stock',
    primaryCtaLink: '/store',
  },
  {
    id: 'printing_and_projects',
    type: 'printing_and_projects',
    visible: true,
    kicker: 'STRUCTURED ENGINEERING DELIVERY',
    heading: 'Project Development Capabilities & 50% + 50% Milestone Workflow',
    subheading:
      'Transparent milestone-backed engineering from enquiry and quotation through prototype build, verification, and complete source handover.',
  },
  {
    id: 'why_us',
    type: 'why_us',
    visible: true,
    kicker: 'BUILT FOR INDUSTRIAL & FIELD RELIABILITY',
    heading: 'Why Choose NexusTekFusion',
  },
  {
    id: 'industries_applications',
    type: 'industries_applications',
    visible: true,
    kicker: 'SECTORS WE SERVE',
    heading: 'Industries & Applications',
    subheading:
      'Supporting progressive farms, FPOs, engineering universities, startups, and industrial survey teams across Nagpur, Maharashtra, and India.',
  },
  {
    id: 'faqs_section',
    type: 'faqs_section',
    visible: true,
    kicker: 'FREQUENTLY ASKED QUESTIONS',
    heading: 'Technical & Commercial Answers',
    subheading:
      'Clear guidance on KRASHIVANTRI drones, CAD 3D printing quotes, PCB fabrication, pan-India shipping, and project milestones.',
    primaryCtaLabel: 'View All FAQs',
    primaryCtaLink: '/faq',
  },
  {
    id: 'contact_enquiry',
    type: 'contact_enquiry',
    visible: true,
    kicker: 'NAGPUR HEADQUARTERS & ENGINEERING DESK',
    heading: 'Connect with Our Engineering Team',
    subheading:
      'Schedule a KRASHIVANTRI drone briefing, book UAV diagnostics in Nagpur, or discuss custom engineering development with our technical desk.',
    primaryCtaLabel: 'Contact Support Desk',
    primaryCtaLink: '/contact',
    secondaryCtaLabel: 'Explore Nagpur Operations',
    secondaryCtaLink: '/nagpur',
  },
  {
    id: 'krashivantri_apps',
    type: 'krashivantri_apps',
    visible: true,
    kicker: 'Connected Mobile Ecosystem',
    heading: 'KRASHIVANTRI Digital Portals & Applications',
    subheading:
      'Dedicated digital tools for Farmers, Certified Drone Pilots, and Hardware Buyers — managed centrally by NexusTekFusion.',
    primaryCtaLabel: 'Open KRASHIVANTRI',
    primaryCtaLink: '/krashivantri',
  },
  {
    id: 'case_studies',
    type: 'case_studies',
    visible: true,
    kicker: 'Applied Engineering',
    heading: 'Engineering R&D & Academic Projects',
    primaryCtaLabel: 'View All Projects',
    primaryCtaLink: '/projects',
  },
  {
    id: 'testimonials',
    type: 'testimonials',
    visible: true,
    kicker: 'Verified Client Feedback',
    heading: 'Customer & Institutional Reviews',
  },
  {
    id: 'cta',
    type: 'cta',
    visible: true,
    heading: 'Build Custom Drones, Source Hardware, or Register an Engineering Project',
    subheading:
      'Connect with our Nagpur agricultural UAV & engineering team for KRASHIVANTRI fleet demonstrations, custom hardware builds, drone repair, or milestone-backed R&D projects.',
    primaryCtaLabel: 'Register Your Project',
    primaryCtaLink: '/register-project',
    secondaryCtaLabel: 'Contact Our Team',
    secondaryCtaLink: '/contact',
  },
];

import { DEFAULT_PROJECT_EMAIL_TEMPLATES } from './email.ts';

export const DEFAULT_NAVIGATION_MENUS = {
  header: [
    { id: 'home', label: 'Home', to: '/', visible: true, sortOrder: 1 },
    {
      id: 'krashivantri',
      label: 'KRASHIVANTRI',
      to: '/krashivantri',
      visible: true,
      sortOrder: 2,
      children: [
        { id: 'krash-overview', label: 'KRASHIVANTRI Overview', to: '/krashivantri' },
        { id: 'krash-x', label: 'KRASHIVANTRI X (₹4,50,000)', to: '/krashivantri-x' },
        { id: 'krash-x-pro', label: 'KRASHIVANTRI X PRO (₹5,60,000)', to: '/krashivantri-x-pro' },
        { id: 'krash-compare', label: 'Compare Drones', to: '/krashivantri/compare' },
        { id: 'krash-enquiry', label: 'Enquire Now', to: '/krashivantri/enquiry' },
        { id: 'krash-farmer', label: 'Farmer Spraying Portal', to: '/krashivantri/farmer-portal' },
        { id: 'krash-pilot', label: 'Drone Pilot Portal', to: '/krashivantri/pilot-portal' },
      ],
    },
    {
      id: 'store',
      label: 'Store',
      to: '/store',
      visible: true,
      sortOrder: 3,
      children: [
        { id: 'store-all', label: 'All Hardware Categories', to: '/store' },
        { id: 'store-agri-drones', label: 'Agricultural Drones', to: '/store/category/agricultural-drones' },
        { id: 'store-agri-parts', label: 'Agricultural Drone Parts', to: '/store/category/agricultural-drone-parts' },
        { id: 'store-motors', label: 'Drone Motors & Propulsion', to: '/store/category/drone-motors-propulsion' },
        { id: 'store-esc-fc', label: 'ESCs & Flight Controllers', to: '/store/category/escs-flight-controllers' },
        { id: 'store-batteries', label: 'Batteries & Power Systems', to: '/store/category/batteries-power-systems' },
        { id: 'store-pumps', label: 'Spraying Pumps & Nozzles', to: '/store/category/spraying-pumps-nozzles' },
        { id: 'store-sensors', label: 'Drone Sensors & GPS Modules', to: '/store/category/drone-sensors-gps' },
        { id: 'store-embedded', label: 'Embedded Electronics', to: '/store/category/embedded-electronics' },
        { id: 'store-3dp-store', label: '3D Printed Products', to: '/store/3d-printed-products' },
      ],
    },
    {
      id: 'services',
      label: 'Services',
      to: '/services',
      visible: true,
      sortOrder: 4,
      children: [
        { id: 'svc-all', label: 'Services Overview', to: '/services' },
        { id: 'svc-3d-printing', label: '3D Printing & Rapid Prototyping', to: '/services/3d-printing' },
        {
          id: 'svc-custom-projects',
          label: 'Project Development',
          to: '/services/custom-engineering',
        },
        { id: 'svc-repair', label: 'Drone Repair & Diagnostics Service', to: '/services/drone-repair' },
      ],
    },
    { id: 'contact', label: 'Contact', to: '/contact', visible: true, sortOrder: 5 },
  ],
};

export const DEFAULT_SERVICES_CATALOG = [
  {
    slug: '3d-printing',
    title: '3D Printing & Rapid Prototyping',
    shortDesc:
      'Transform your digital designs into physical products with professional 3D printing, rapid prototyping, custom component manufacturing, product development, and precision fabrication services.',
    visible: true,
    imageUrl: '',
    ctaLabel: 'Explore Service',
    ctaLink: '/services/3d-printing',
  },
  {
    slug: 'custom-engineering-projects',
    title: 'Project Development',
    shortDesc:
      'End-to-end engineering project development, hardware prototyping, electronics integration, embedded programming, robotics, IoT, AI/ML, PCB design, and customized final-year and industrial project solutions.',
    visible: true,
    imageUrl: '',
    ctaLabel: 'Explore Service',
    ctaLink: '/register-project',
  },
  {
    slug: 'drone-repair',
    title: 'Drone Repair & Diagnostics Service',
    shortDesc:
      'Complete drone inspection, troubleshooting, repair, component replacement, flight controller configuration, calibration and performance testing for agricultural, commercial and custom-built drones.',
    visible: true,
    imageUrl: '',
    ctaLabel: 'Book Drone Repair',
    ctaLink: '/services/drone-repair',
  },
];

export const DEFAULT_SITE_SETTINGS: Record<string, unknown> = {
  announcementBar: {
    enabled: true,
    text: 'NEXUSTEKFUSION PRIVATE LIMITED · Agricultural Drone Manufacturing, KRASHIVANTRI UAVs & Engineering Store',
    link: '/krashivantri',
    ctaLabel: 'Explore KRASHIVANTRI',
  },
  companyInfo: {
    legalName: 'NEXUSTEKFUSION PRIVATE LIMITED',
    brandName: 'NexusTekFusion',
    established: '2026',
    founderCeo: 'Sahil Prakash Bhagat',
    email: 'info@nexustekfusion.in',
    customerCareEmail: 'info@nexustekfusion.in',
    website: 'https://nexustekfusion.in',
    address: 'H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, Maharashtra, India',
    cin: 'U30305ME2026PTC474052',
    gstin: '',
    contactPhone: '',
    businessHours: 'Monday – Saturday, 10:00 AM – 7:00 PM IST',
    primaryTagline: 'Transforming Ideas into Reality',
    secondaryTagline: 'Engineering the Future with Intelligence',
    socialLinks: {
      linkedin: '',
      instagram: '',
      youtube: '',
      github: '',
      twitter: '',
    },
  },
  seoConfig: DEFAULT_SEO_CONFIG,
  cmsWorkspace: {
    draft: DEFAULT_CMS_BUNDLE,
    published: DEFAULT_CMS_BUNDLE,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  shippingConfig: {
    standardShippingInr: 99,
    freeShippingAboveInr: 2500,
    defaultGstPercent: 18,
  },
  projectSettings: {
    enableGstTax: false,
    defaultGstPercent: 18,
    defaultAdvancePercent: 50,
    quotationValidityDays: 15,
  },
  projectPaymentSettings: {
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
    cancellationRefundPolicy:
      'Advance covers procurement and engineering mobilization; custom milestone refunds are reviewed case-by-case by Super Admin.',
  },
  projectEmailTemplates: DEFAULT_PROJECT_EMAIL_TEMPLATES,
  krashivantriOpsConfig: {
    baseRatePerAcreInr: 500,
    minimumBookingAcres: 1,
    platformCommissionPercent: 15,
    gpsStaleThresholdMinutes: 10,
    arrivalGeofenceMeters: 250,
    pilotResponseTimeoutMinutes: 30,
    cancellationBeforeDispatchRefundPercent: 100,
    lateArrivalPenaltyInr: 200,
  },
  homepageLayout: {
    draft: DEFAULT_HOMEPAGE_SECTIONS,
    published: DEFAULT_HOMEPAGE_SECTIONS,
    publishedAt: new Date().toISOString(),
  },
  navigationMenus: DEFAULT_NAVIGATION_MENUS,
  servicesCatalog: DEFAULT_SERVICES_CATALOG,
  pcbPricingConfig: DEFAULT_PCB_PRICING_CONFIG,
  krashivantriCatalog: {
    platformName: 'KRASHIVANTRI Agricultural Drone Ecosystem',
    summary:
      'Precision agricultural UAV hardware, IoT field telemetry, and unified Farmer, Pilot, and Buyer operational workflows engineered by NexusTekFusion Private Limited.',
    bannerImageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
    models: [
      {
        id: 'krashivantri-x',
        name: 'KRASHIVANTRI X',
        tagline: 'Smart Agriculture. Precision Spraying.',
        summary:
          'Modular multi-rotor agricultural UAV architecture engineered for precision crop spraying operations, rapid field servicing, and integrated telemetry monitoring. Official performance specifications are published and updated through the Admin Catalog.',
        imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
        specs: [],
        highlights: [
          'Modular carbon-fiber agricultural airframe and field-serviceable propulsion arms',
          'Precision spraying pump and flat-fan nozzle integration',
          'Compatible with KRASHIVANTRI Farmer & Drone Pilot mission portals',
        ],
      },
      {
        id: 'krashivantri-x-pro',
        name: 'KRASHIVANTRI X PRO',
        tagline: 'Advanced Intelligence. Precision Agriculture.',
        summary:
          'Commercial-grade intelligent agricultural drone platform built for high-uptime spraying contractors, institutions, and large-acreage farming operations. Official capacity and mission parameters are synchronized from the Admin Catalog.',
        imageUrl: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
        specs: [],
        highlights: [
          'Reinforced commercial composite arms & heavy-duty power distribution',
          'Dual-pump spraying readiness and enterprise fleet telemetry integration',
          'Backed by Nagpur priority spares, calibration, and field engineering support',
        ],
      },
    ],
  },
  appLinks: [
    {
      id: 'farmer-app',
      name: 'KRASHIVANTRI Farmer App',
      role: 'For Farmers & FPOs',
      description: 'Schedule agricultural drone spraying missions, pin field boundaries, and track service status.',
      comingSoon: true,
      playStoreUrl: '',
      apkDownloadUrl: '',
    },
    {
      id: 'pilot-app',
      name: 'KRASHIVANTRI Drone Pilot App',
      role: 'For Certified Drone Pilots',
      description: 'Manage assigned spraying sorties, pre-flight checklists, field telemetry logs, and mission completion.',
      comingSoon: true,
      playStoreUrl: '',
      apkDownloadUrl: '',
    },
    {
      id: 'buyer-app',
      name: 'NexusTekFusion Buyer App',
      role: 'For Hardware & Component Buyers',
      description: 'Order agricultural/FPV drone spares, electronics, and track custom 3D printing & project milestones.',
      comingSoon: true,
      playStoreUrl: '',
      apkDownloadUrl: '',
    },
  ],
  krashivantriInfo: {
    platformName: 'KRASHIVANTRI Agricultural Drone Platform',
    summary:
      'Indigenous agricultural UAV engineering platform developed for precision crop spraying, IoT field telemetry, and unified Farmer, Pilot & Buyer operations.',
    verifiedSpecs: [],
  },
  faqs: [
    {
      q: 'What file formats are supported for custom 3D printing?',
      a: 'You can upload STL, OBJ, 3MF, and STEP/STP models. STL and OBJ meshes undergo automated dimensional and volumetric slicing; STEP/STP and multi-part assemblies are routed directly for engineering CAD review.',
    },
    {
      q: 'How does the engineering project enquiry and quotation workflow work?',
      a: 'Sign in, submit your project scope along with schematics or PDFs and delivery address, receive an itemized quotation from our engineering team, accept it, and pay the advance via Razorpay to activate your project with milestone tracking.',
    },
    {
      q: 'What PCB types do you fabricate and how do I get a quote?',
      a: 'We fabricate Single Layer PCBs and Double Layer PCBs. Upload your Gerber ZIP or RS-274X files, drill file, and board specs on our PCB Design & Fabrication page for instant calculation or engineering review.',
    },
    {
      q: 'Do you support B2B bulk procurement and institutional orders?',
      a: 'Yes. Colleges, R&D labs, and industrial buyers can submit bulk hardware, drone, robotics, or 3D printing requirements through the B2B portal for custom volume pricing.',
    },
  ],
  testimonials: [],
  policies: {
    shipping:
      'Orders for ready-made components and custom 3D printed parts are dispatched from our Nagpur facility via tracked courier partners. Dispatch timelines depend on stock availability or print/build queue schedules shown on your order summary.',
    returnRefund:
      'Unused hardware components in original anti-static packaging may be requested for return within 7 days of delivery if defective or damaged in transit. Custom 3D printed parts and commissioned engineering prototypes are built to specification and covered for manufacturing defects.',
    privacy:
      'NexusTekFusion Private Limited collects customer identity, address, and technical upload files strictly for fulfilling orders, generating quotations, and delivering engineering services. Uploaded CAD, Gerber, and project files are stored privately and never shared with third parties.',
    terms:
      'All engineering quotations, custom manufacturing work orders, and e-commerce orders are governed by the terms issued with the respective quotation or invoice under the jurisdiction of Nagpur, Maharashtra, India.',
  },
  aboutTeam: [
    {
      id: 'sahil-prakash-bhagat',
      name: 'Sahil Prakash Bhagat',
      designation: 'Founder & Chief Executive Officer',
      qualifications:
        'Bachelor of Engineering – YCCE, Nagpur · MBA – JD College of Engineering & Management',
      biography:
        'Sahil Prakash Bhagat is the Founder and CEO of NexusTekFusion Private Limited. He leads the company’s strategic vision, engineering innovation, product development, and business growth. His focus areas include indigenous agricultural drone manufacturing, nationwide Drone-as-a-Service expansion, AI-powered agriculture, robotics, embedded systems, and advanced engineering solutions.',
      responsibilities:
        'Corporate strategy and business development · Agricultural drone manufacturing · KRASHIVANTRI product development · Nationwide DaaS expansion · Technology commercialization · Strategic partnerships and investor relations · Research and innovation',
      photoUrl: '',
      displayOrder: 1,
      isActive: true,
    },
    {
      id: 'anchal-joshi',
      name: 'Anchal Joshi',
      designation: 'Engineering & Innovation Team',
      qualifications: '',
      biography: '',
      responsibilities: '',
      photoUrl: '',
      displayOrder: 2,
      isActive: true,
    },
  ],
};

const CORE_CATEGORIES = [
  { name: 'Agricultural Drones', slug: 'agricultural-drones', storeScope: 'general', description: 'Complete agricultural spraying UAV airframes, KRASHIVANTRI platforms, and fleet systems', sortOrder: 1 },
  { name: 'Agricultural Drone Parts', slug: 'agricultural-drone-parts', storeScope: 'general', description: 'Modular tank assemblies, folding joints, landing skids, and field-serviceable UAV spares', sortOrder: 2 },
  { name: 'Drone Motors and Propulsion Systems', slug: 'drone-motors-propulsion', storeScope: 'general', description: 'High-thrust brushless agricultural motors, folding carbon propellers, and coaxial propulsion sets', sortOrder: 3 },
  { name: 'ESCs and Flight Controllers', slug: 'escs-flight-controllers', storeScope: 'general', description: 'Dual-IMU flight controllers, FOC heavy-duty ESCs, and autonomous UAV avionics stacks', sortOrder: 4 },
  { name: 'Drone Frames and Mechanical Parts', slug: 'drone-frames-mechanical', storeScope: 'general', description: '3K carbon-fiber airframe kits, CNC 7075 alloy arms, clamps, and structural mounts', sortOrder: 5 },
  { name: 'Batteries and Power Systems', slug: 'batteries-power-systems', storeScope: 'general', description: '6S–14S smart UAV LiPo battery packs, heavy-copper PDBs, and fast chargers', sortOrder: 6 },
  { name: 'Spraying Pumps and Nozzles', slug: 'spraying-pumps-nozzles', storeScope: 'general', description: 'Brushless diaphragm spraying pumps, flat-fan nozzles, flowmeters, and manifold kits', sortOrder: 7 },
  { name: 'Drone Sensors and GPS Modules', slug: 'drone-sensors-gps', storeScope: 'general', description: 'RTK GNSS modules, terrain-following radar, LiDAR rangefinders, and obstacle sensors', sortOrder: 8 },
  { name: 'Embedded Electronics', slug: 'embedded-electronics', storeScope: 'general', description: 'Industrial carrier boards, isolated CAN/RS485 nodes, BMS, and power electronics', sortOrder: 9 },
  { name: 'Microcontrollers and Development Boards', slug: 'microcontrollers-dev-boards', storeScope: 'general', description: 'STM32, ESP32-S3, RP2040, and robotics compute/control development boards', sortOrder: 10 },
  { name: 'Communication and Telemetry Modules', slug: 'communication-telemetry', storeScope: 'general', description: 'Long-range 900MHz/2.4GHz telemetry radios, SiK links, and LoRa ground station receivers', sortOrder: 11 },
  { name: 'Wiring, Connectors and Electronic Components', slug: 'wiring-connectors-components', storeScope: 'general', description: 'XT90-S, AS150 anti-spark harnesses, silicone AWG cables, and JST-GH avionics leads', sortOrder: 12 },
  { name: 'Drone Accessories and Spare Parts', slug: 'drone-accessories-spare-parts', storeScope: 'general', description: 'Vibration dampers, field toolkits, battery straps, and quick-release hardware', sortOrder: 13 },
  { name: 'Custom Drone Hardware', slug: 'custom-drone-hardware', storeScope: 'general', description: 'Bespoke survey hexacopters, custom payload bays, and mission-specific UAV hardware', sortOrder: 14 },
  { name: '3D Printed Products', slug: '3d-printed-products', storeScope: '3d_printed', description: 'Industrial FDM & SLA printed UAV mounts, gearboxes, and custom enclosures', sortOrder: 15 },
];

export async function ensureInitialSeed() {
  if (seededOnce) return;

  try {
    // 0. Probe configured PostgreSQL before running queries so unreachable DB falls back cleanly
    if (isCloudDatabaseConfigured() && !isCloudDbReady()) {
      await verifyCloudDatabaseConnection().catch(() => false);
    }

    // 0a. Ensure CMS upgrade tables/columns exist in PostgreSQL
    await ensureCmsTablesExist();

    // 0b. Ensure initial super admin user if configured via env vars
    await ensureInitialAdminUser();

    // 1. Site Settings (backfill any missing default keys & auto-heal customerCareEmail typo)
    for (const [key, value] of Object.entries(DEFAULT_SITE_SETTINGS)) {
      await db
        .insert(siteSettings)
        .values({ key, value })
        .onConflictDoNothing({ target: siteSettings.key });
    }

    const [existingAnn] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'announcementBar'))
      .limit(1);
    if (existingAnn?.value) {
      const annStr = JSON.stringify(existingAnn.value);
      if (
        annStr.includes('nexusteksuaion.in') ||
        annStr.includes('Free Pan-India Shipping') ||
        annStr.includes('Shop Store')
      ) {
        await db
          .update(siteSettings)
          .set({ value: DEFAULT_SITE_SETTINGS.announcementBar, updatedAt: new Date() })
          .where(eq(siteSettings.key, 'announcementBar'));
      }
    }

    const [existingCompany] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'companyInfo'))
      .limit(1);
    if (existingCompany?.value && JSON.stringify(existingCompany.value).includes('nexusteksuaion.in')) {
      const nextComp = { ...(existingCompany.value as Record<string, unknown>) };
      nextComp.customerCareEmail = 'info@nexustekfusion.in';
      await db.update(siteSettings).set({ value: nextComp, updatedAt: new Date() }).where(eq(siteSettings.key, 'companyInfo'));
    }

    // Ensure Services catalog ONLY keeps Drone Repair & Custom Engineering Project Development & Prototyping
    const [existingCatalog] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'servicesCatalog'))
      .limit(1);
    if (existingCatalog && Array.isArray(existingCatalog.value)) {
      const legacySlugs = new Set([
        'ai-ml',
        'drone-development',
        'robotics',
        'iot-embedded',
        'automation',
        '3d-printing',
        'pcb-design',
      ]);
      const hasLegacy = existingCatalog.value.some((item: any) => legacySlugs.has(String(item?.slug || '')));
      const hasCustomProj = existingCatalog.value.some(
        (item: any) => String(item?.slug || '') === 'custom-engineering-projects'
      );
      if (hasLegacy || !hasCustomProj || existingCatalog.value.length === 0) {
        await db
          .update(siteSettings)
          .set({ value: DEFAULT_SERVICES_CATALOG, updatedAt: new Date() })
          .where(eq(siteSettings.key, 'servicesCatalog'));
      }
    }

    // Refresh persisted navigationMenus if legacy Store/Services dropdown, About Us item, or missing KRASHIVANTRI links
    const [existingNav] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'navigationMenus'))
      .limit(1);
    if (existingNav?.value) {
      const navStr = JSON.stringify(existingNav.value);
      if (
        navStr.includes('/sale') ||
        navStr.includes('Shop Store') ||
        navStr.includes('/about') ||
        navStr.includes('About Us') ||
        navStr.includes('"/shop"') ||
        navStr.includes("'/shop'") ||
        !navStr.includes('/register-project') ||
        !navStr.includes('/krashivantri-x') ||
        !navStr.includes('/services/3d-printing') ||
        !navStr.includes('/contact')
      ) {
        await db
          .update(siteSettings)
          .set({ value: DEFAULT_NAVIGATION_MENUS, updatedAt: new Date() })
          .where(eq(siteSettings.key, 'navigationMenus'));
      }
    }

    const [existingHomeLayout] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'homepageLayout'))
      .limit(1);
    if (existingHomeLayout?.value) {
      const rawLayout = JSON.stringify(existingHomeLayout.value);
      if (
        rawLayout.includes('/sale') ||
        rawLayout.includes('/about') ||
        rawLayout.includes('About NexusTekFusion') ||
        rawLayout.includes('Shop Precision Drone Hardware') ||
        rawLayout.includes('ONLINE HARDWARE, DRONES') ||
        !rawLayout.includes('Engineering Intelligence. Manufacturing Innovation.') ||
        !rawLayout.includes('industries_applications') ||
        !rawLayout.includes('faqs_section') ||
        !rawLayout.includes('contact_enquiry')
      ) {
        await db
          .update(siteSettings)
          .set({
            value: {
              draft: DEFAULT_HOMEPAGE_SECTIONS,
              published: DEFAULT_HOMEPAGE_SECTIONS,
              publishedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(siteSettings.key, 'homepageLayout'));
      }
    }

    const [existingKrashiCatalog] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'krashivantriCatalog'))
      .limit(1);
    if (existingKrashiCatalog?.value) {
      const kStr = JSON.stringify(existingKrashiCatalog.value);
      if (kStr.includes('hero_nexustek_engineering_1794981062404') || kStr.includes('service_agri_drone_1794981061744')) {
        await db
          .update(siteSettings)
          .set({ value: DEFAULT_SITE_SETTINGS.krashivantriCatalog, updatedAt: new Date() })
          .where(eq(siteSettings.key, 'krashivantriCatalog'));
      }
    }

    const [existingSeo] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'seoConfig'))
      .limit(1);
    if (existingSeo?.value) {
      const seoVal = existingSeo.value as Record<string, any>;
      const seoStr = JSON.stringify(seoVal);
      if (
        seoStr.includes('Shop agricultural') ||
        seoStr.includes('"/about"') ||
        !seoStr.includes('/krashivantri-x') ||
        !seoStr.includes('/nagpur') ||
        !seoStr.includes('/services/3d-printing') ||
        !seoStr.includes('googleSiteVerification')
      ) {
        await db
          .update(siteSettings)
          .set({
            value: {
              ...DEFAULT_SEO_CONFIG,
              ga4MeasurementId: seoVal.ga4MeasurementId || '',
              googleSiteVerification: seoVal.googleSiteVerification || '',
            },
            updatedAt: new Date(),
          })
          .where(eq(siteSettings.key, 'seoConfig'));
      } else if (!Array.isArray(seoVal.routes) || seoVal.routes.length === 0) {
        await db
          .update(siteSettings)
          .set({
            value: {
              ...DEFAULT_SEO_CONFIG,
              ...seoVal,
              routes: DEFAULT_SEO_CONFIG.routes,
            },
            updatedAt: new Date(),
          })
          .where(eq(siteSettings.key, 'seoConfig'));
      }
    }

    // Backfill structured team_members table from existing aboutTeam or DEFAULT_TEAM_MEMBERS_SEED if empty
    const [{ value: teamCount }] = await db.select({ value: count() }).from(teamMembers);
    if (teamCount === 0) {
      const [existingAboutTeamRow] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'aboutTeam'))
        .limit(1);
      const sourceTeam =
        existingAboutTeamRow && Array.isArray(existingAboutTeamRow.value)
          ? (existingAboutTeamRow.value as any[])
          : DEFAULT_TEAM_MEMBERS_SEED;

      for (let i = 0; i < sourceTeam.length; i++) {
        const m = sourceTeam[i];
        const name = String(m.name || `Team Member ${i + 1}`).trim();
        const slugKey = String(m.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `member-${i + 1}`);
        const seedMatch = DEFAULT_TEAM_MEMBERS_SEED.find((d) => d.id === slugKey);
        await db
          .insert(teamMembers)
          .values({
            slugKey,
            fullName: name,
            designation: String(m.designation || seedMatch?.designation || 'Engineering & Innovation'),
            department: String(m.department || seedMatch?.department || (slugKey.includes('sahil') ? 'Executive Leadership' : 'Engineering & Innovation')),
            professionalCategory: String(
              m.professionalCategory || seedMatch?.professionalCategory || (slugKey.includes('sahil') ? 'Executive Leadership' : 'Engineering & Innovation')
            ),
            profilePhotoUrl: String(m.photoUrl || seedMatch?.photoUrl || pickNeutralAvatar(slugKey)),
            photoAlt: String(m.photoAlt || seedMatch?.photoAlt || `${name} — ${m.designation || 'NexusTekFusion'}`),
            shortBiography: String(m.biography || seedMatch?.biography || ''),
            detailedBiography: String(m.detailedBiography || seedMatch?.detailedBiography || ''),
            qualifications: String(m.qualifications || seedMatch?.qualifications || ''),
            experience: String(m.experience || seedMatch?.experience || ''),
            responsibilities: String(m.responsibilities || seedMatch?.responsibilities || ''),
            skills: Array.isArray(m.skills) ? m.skills : seedMatch?.skills || [],
            linkedinUrl: String(m.linkedinUrl || ''),
            displayOrder: Number(m.displayOrder ?? i + 1),
            status: m.status === 'draft' ? 'draft' : 'published',
            isFeatured: m.isFeatured !== undefined ? Boolean(m.isFeatured) : slugKey.includes('sahil'),
            isActive: m.isActive !== false,
            updatedBy: 'system',
          })
          .onConflictDoNothing({ target: teamMembers.slugKey });
      }
    }

    // Backfill structured website_banners table if empty
    const [{ value: bannerCount }] = await db.select({ value: count() }).from(websiteBanners);
    if (bannerCount === 0) {
      for (const banner of DEFAULT_WEBSITE_BANNERS_SEED) {
        await db
          .insert(websiteBanners)
          .values({
            bannerKey: banner.bannerKey,
            title: banner.title,
            subtitle: banner.subtitle,
            placement: banner.placement,
            imageUrl: banner.imageUrl,
            videoUrl: banner.videoUrl || '',
            ctaLabel: banner.ctaLabel,
            ctaLink: banner.ctaLink,
            sortOrder: banner.sortOrder,
            isActive: banner.isActive,
            status: banner.status,
            updatedBy: 'system',
          })
          .onConflictDoNothing({ target: websiteBanners.bannerKey });
      }
    }

    // 2. Brands
    for (const br of [
      {
        name: 'KRASHIVANTRI',
        slug: 'krashivantri',
        logoUrl: '/assets/aistudio/image_1a5ac752.png',
        description: 'Indigenous agricultural drone & field telemetry product line by NexusTekFusion Private Limited.',
        isActive: true,
      },
      {
        name: 'NexusTekFusion',
        slug: 'nexustekfusion',
        logoUrl: '/assets/aistudio/image_1a5ac752.png',
        description: 'Industrial electronics, UAV avionics, robotics chassis, and precision additive hardware.',
        isActive: true,
      },
    ]) {
      await db.insert(brands).values(br).onConflictDoNothing({ target: brands.slug });
    }

    // 3. 3D Printing Materials & Machines
    const [{ value: matCount }] = await db.select({ value: count() }).from(printingMaterials);
    if (matCount === 0) {
      await db.insert(printingMaterials).values([
        {
          name: 'PLA+',
          technology: 'FDM',
          densityGcm3: 1.24,
          ratePerGramInr: 6,
          availableColors: [
            { name: 'Black', hex: '#18181b' },
            { name: 'White', hex: '#f8fafc' },
            { name: 'Slate Grey', hex: '#64748b' },
            { name: 'Tech Blue', hex: '#2563eb' },
            { name: 'Signal Red', hex: '#dc2626' },
            { name: 'Natural', hex: '#e2e8f0' },
          ],
          layerHeightsMm: [0.1, 0.15, 0.2, 0.3],
          description: 'High-stiffness engineering PLA+ ideal for enclosures, brackets, and rapid prototypes.',
          isActive: true,
        },
        {
          name: 'PETG',
          technology: 'FDM',
          densityGcm3: 1.27,
          ratePerGramInr: 7.5,
          availableColors: [
            { name: 'Black', hex: '#18181b' },
            { name: 'White', hex: '#f8fafc' },
            { name: 'Tech Blue', hex: '#2563eb' },
            { name: 'Natural', hex: '#cbd5e1' },
          ],
          layerHeightsMm: [0.15, 0.2, 0.3],
          description: 'Impact-resistant and weatherproof polymer suited for drone mounts and outdoor IoT housings.',
          isActive: true,
        },
        {
          name: 'ABS',
          technology: 'FDM',
          densityGcm3: 1.04,
          ratePerGramInr: 8.5,
          availableColors: [
            { name: 'Black', hex: '#18181b' },
            { name: 'Slate Grey', hex: '#475569' },
            { name: 'White', hex: '#f8fafc' },
          ],
          layerHeightsMm: [0.15, 0.2, 0.3],
          description: 'High-temperature thermal stability for motor mounts, robotics chassis, and industrial jigs.',
          isActive: true,
        },
        {
          name: 'TPU 95A',
          technology: 'FDM',
          densityGcm3: 1.21,
          ratePerGramInr: 10,
          availableColors: [
            { name: 'Black', hex: '#18181b' },
            { name: 'Signal Red', hex: '#dc2626' },
            { name: 'Tech Blue', hex: '#2563eb' },
          ],
          layerHeightsMm: [0.2, 0.3],
          description: 'Flexible vibration-damping elastomer for UAV camera mounts, bumpers, and gaskets.',
          isActive: true,
        },
        {
          name: 'Nylon PA12-CF',
          technology: 'FDM',
          densityGcm3: 1.18,
          ratePerGramInr: 18,
          availableColors: [{ name: 'Carbon Black', hex: '#0f172a' }],
          layerHeightsMm: [0.15, 0.2],
          description: 'Carbon-fiber reinforced structural nylon for load-bearing drone arms and mechanical gears.',
          isActive: true,
        },
        {
          name: 'Engineering Tough Resin',
          technology: 'SLA',
          densityGcm3: 1.15,
          ratePerGramInr: 15,
          availableColors: [
            { name: 'Matte Grey', hex: '#64748b' },
            { name: 'Clear Natural', hex: '#e2e8f0' },
            { name: 'Obsidian Black', hex: '#0f172a' },
          ],
          layerHeightsMm: [0.05, 0.1],
          description: 'High-resolution photopolymer for intricate microfluidic, dental, and precision fitment parts.',
          isActive: true,
        },
      ]);
    }

    const [{ value: machineCount }] = await db.select({ value: count() }).from(printingMachines);
    if (machineCount === 0) {
      await db.insert(printingMachines).values([
        {
          name: 'NTF-FDM CoreXY 300',
          technology: 'FDM',
          buildVolumeX: 300,
          buildVolumeY: 300,
          buildVolumeZ: 300,
          hourlyRateInr: 120,
          minOrderInr: 250,
          wastagePercent: 8,
          labourFeeInr: 60,
          finishingFeeInr: 140,
          isActive: true,
        },
        {
          name: 'NTF-SLA Precision 8K',
          technology: 'SLA',
          buildVolumeX: 218,
          buildVolumeY: 123,
          buildVolumeZ: 240,
          hourlyRateInr: 180,
          minOrderInr: 450,
          wastagePercent: 12,
          labourFeeInr: 90,
          finishingFeeInr: 180,
          isActive: true,
        },
      ]);
    }

    // 4. Ensure all 14 Drone & Electronics categories + 3d_printed exist cleanly (and sync sortOrder/name)
    const coreSlugSet = new Set(CORE_CATEGORIES.map((c) => c.slug));
    for (const cat of CORE_CATEGORIES) {
      await db
        .insert(productCategories)
        .values({ ...cat, isActive: true })
        .onConflictDoUpdate({
          target: productCategories.slug,
          set: {
            name: cat.name,
            description: cat.description,
            storeScope: cat.storeScope,
            sortOrder: cat.sortOrder,
            isActive: true,
          },
        });
    }

    // Deactivate removed legacy categories so the 14 required drone/electronics categories render cleanly
    const existingCats = await db.select().from(productCategories);
    for (const existing of existingCats) {
      if (!coreSlugSet.has(existing.slug) && existing.isActive) {
        await db
          .update(productCategories)
          .set({ isActive: false })
          .where(eq(productCategories.id, existing.id));
      }
    }

    const allCats = await db.select().from(productCategories);
    const catMap = Object.fromEntries(allCats.map((c) => [c.slug, c.id]));

    // 5. Guarantee KRASHIVANTRI Flagship Products (₹4,50,000 & ₹5,60,000, HSN 8806, 6 editable briefing specs)
    const agriDroneCatId = catMap['agricultural-drones'] || null;
    const defaultKrashiSpecs: Record<string, string> = {
      'Payload Capacity': 'Official Specification on Briefing',
      'Flight Time': 'Official Specification on Briefing',
      'Tank Capacity': 'Official Specification on Briefing',
      'Spraying Width': 'Official Specification on Briefing',
      'Battery Specifications': 'Official Specification on Briefing',
      'Navigation Capabilities': 'Official Specification on Briefing',
    };
    const flagshipProducts: Array<typeof products.$inferInsert> = [
      {
        categoryId: agriDroneCatId,
        sku: 'KRASH-X-01',
        name: 'KRASHIVANTRI X',
        slug: 'krashivantri-x',
        brand: 'KRASHIVANTRI',
        productType: 'variable',
        modelNumber: 'KRASHIVANTRI-X',
        subcategory: 'KRASHIVANTRI Agricultural Drones',
        shortDescription: 'Smart Agriculture. Precision Spraying.',
        storeScope: 'general',
        description:
          'KRASHIVANTRI X is NexusTekFusion’s flagship modular agricultural spraying UAV architecture built for precision agricultural crop spraying, FPO fleet operations, and institutional agritech research and development. Technical briefing specifications are maintained directly by authorized administrators.',
        technicalSpecs: { ...defaultKrashiSpecs },
        features: [
          'Modular agricultural UAV airframe engineered for rapid field deployment and servicing',
          'Supports automated mission boundary planning and uniform crop spraying coverage',
          'Compatible with KRASHIVANTRI Farmer Spraying & Drone Pilot Portal workflows',
          'Backed by Nagpur engineering support, installation onboarding, and genuine spares',
        ],
        priceInr: 450000,
        discountPriceInr: null,
        gstPercent: 18,
        hsnCode: '8806',
        stockQty: 5,
        dimensions: 'Modular Foldable Agricultural Airframe',
        weightGrams: 0,
        deliveryInfo: 'Pan-India insured freight delivery, installation, and operator commissioning from Nagpur within 7–14 business days.',
        material: '3K Carbon Fiber & CNC 7075-T6 Aerospace Aluminum',
        availableColors: ['Dark Charcoal & Agricultural Green'],
        availableVariants: ['Standard Agricultural Package', 'With Field Telemetry Kit'],
        productionTimeDays: 10,
        warrantyInfo: '1-Year Manufacturer Warranty + Authorized Nagpur Service & Spare Support',
        imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
        galleryUrls: [
          '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
          '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
          '/src/assets/images/service_drone_repair_1794987205295.jpg',
          '/src/assets/images/service_agri_drone_1794981061744.jpg',
        ],
        applications: 'Precision agricultural crop spraying, FPO fleet operations, Institutional agritech research and development',
        packageContents: [
          'KRASHIVANTRI X Agricultural UAV Airframe Assembly',
          'Precision Agricultural Spraying Manifold & Tank Assembly',
          'Ground Control & Mission Telemetry Interface',
          'Operator Onboarding Documentation & Safety Manual',
          'Standard Maintenance Tool Kit & Warranty Card',
        ],
        productFaqs: [
          {
            q: 'Where can I receive verified official technical specifications for KRASHIVANTRI X?',
            a: 'Use the Enquire Now form or Download Brochure on this page. As specifications are finalized and published by NexusTekFusion engineering, they appear immediately in the Key System Specifications table.',
          },
          {
            q: 'Is installation and operator orientation included with delivery?',
            a: 'Yes. Every KRASHIVANTRI X unit includes commissioning inspection, GST tax invoice billing, and operational onboarding from our Nagpur engineering team.',
          },
          {
            q: 'Can FPOs and agricultural universities order multiple units or request custom configurations?',
            a: 'Yes. You can place an instant order online or submit a bulk institutional enquiry specifying your required quantity and state/district.',
          },
        ],
        tags: ['KRASHIVANTRI', 'KRASHIVANTRI X', 'Agricultural Drone', 'UAV', 'Flagship'],
        seoTitle: 'KRASHIVANTRI X Agricultural Drone (₹4,50,000) | NexusTekFusion',
        seoDescription: 'KRASHIVANTRI X — Smart Agriculture. Precision Spraying. Official price ₹4,50,000 with online ordering, GST invoice, and verified technical briefing from NexusTekFusion.',
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
        sortOrder: 1,
      },
      {
        categoryId: agriDroneCatId,
        sku: 'KRASH-XPRO-01',
        name: 'KRASHIVANTRI X PRO',
        slug: 'krashivantri-x-pro',
        brand: 'KRASHIVANTRI',
        productType: 'variable',
        modelNumber: 'KRASHIVANTRI-X-PRO',
        subcategory: 'KRASHIVANTRI Agricultural Drones',
        shortDescription: 'Advanced Intelligence. Precision Agriculture.',
        storeScope: 'general',
        description:
          'KRASHIVANTRI X PRO is NexusTekFusion’s advanced agricultural drone platform engineered for commercial agricultural spraying contractors, university research and development, and large-acreage precision farming. Verified technical briefing metrics are managed directly by authorized administrators.',
        technicalSpecs: { ...defaultKrashiSpecs },
        features: [
          'Extended-capability multi-rotor platform built for high-uptime commercial spraying contractors',
          'Reinforced composite propulsion arms & industrial power distribution architecture',
          'Prepared for advanced autonomous intelligence, sensor integration, and fleet workflows',
          'Priority spare parts supply, commissioning support, and service diagnostics from Nagpur',
        ],
        priceInr: 560000,
        discountPriceInr: null,
        gstPercent: 18,
        hsnCode: '8806',
        stockQty: 5,
        dimensions: 'Heavy-Lift Commercial Agricultural Frame',
        weightGrams: 0,
        deliveryInfo: 'Pan-India insured commercial freight delivery, commissioning, and fleet onboarding from Nagpur within 7–14 business days.',
        material: 'Reinforced 3K Carbon Composite & CNC Alloy Hardware',
        availableColors: ['Dark Charcoal & Agricultural Green'],
        availableVariants: ['Commercial Fleet Configuration', 'University R&D Edition'],
        productionTimeDays: 12,
        warrantyInfo: '1-Year Commercial Manufacturer Warranty + Priority Nagpur Service Coverage',
        imageUrl: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
        galleryUrls: [
          '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
          '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
          '/src/assets/images/service_drone_repair_1794987205295.jpg',
          '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
        ],
        applications: 'Commercial agricultural spraying contractors, University research and development, Large-acreage precision farming',
        packageContents: [
          'KRASHIVANTRI X PRO Agricultural Drone Airframe',
          'Commercial-Grade Spraying & Pump Assembly',
          'Ground Control & Intelligent Mission Telemetry Kit',
          'Fleet Documentation, Calibration Checklist & Warranty Certificate',
        ],
        productFaqs: [
          {
            q: 'What distinguishes KRASHIVANTRI X PRO for commercial spraying contractors?',
            a: 'KRASHIVANTRI X PRO features an extended-capability reinforced airframe, commercial contractor fleet support, and priority servicing from Nagpur.',
          },
          {
            q: 'Can we compare KRASHIVANTRI X and KRASHIVANTRI X PRO side by side?',
            a: 'Yes, visit the KRASHIVANTRI Comparison page (/krashivantri/compare) to review pricing, applications, and live official briefing specifications side by side.',
          },
          {
            q: 'How is GST billing handled for companies, universities, and contractors?',
            a: 'Orders automatically calculate intra-state CGST+SGST (Maharashtra) or inter-state IGST and issue a downloadable Tax Invoice PDF with HSN code 8806 after payment verification.',
          },
        ],
        tags: ['KRASHIVANTRI X PRO', 'Agricultural Drone', 'Enterprise UAV', 'Flagship'],
        seoTitle: 'KRASHIVANTRI X PRO Agricultural Drone (₹5,60,000) | NexusTekFusion',
        seoDescription: 'KRASHIVANTRI X PRO — Advanced Intelligence. Precision Agriculture. Official price ₹5,60,000 with online ordering and technical briefing from NexusTekFusion.',
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
        sortOrder: 2,
      },
    ];
    for (const flagship of flagshipProducts) {
      const [existingFlag] = await db
        .select()
        .from(products)
        .where(eq(products.slug, flagship.slug))
        .limit(1);
      if (!existingFlag) {
        await db.insert(products).values(flagship);
      } else {
        const currentSpecs = (existingFlag.technicalSpecs as Record<string, string>) || {};
        const mergedSpecs: Record<string, string> = { ...defaultKrashiSpecs };
        for (const [k, v] of Object.entries(currentSpecs)) {
          if (Object.prototype.hasOwnProperty.call(defaultKrashiSpecs, k) && v && v.trim()) {
            mergedSpecs[k] = v;
          }
        }
        const needsPriceUpgrade = existingFlag.priceInr <= 0 || existingFlag.productType === 'quote_only';
        await db
          .update(products)
          .set({
            categoryId: flagship.categoryId,
            imageUrl: flagship.imageUrl,
            galleryUrls: flagship.galleryUrls,
            hsnCode: flagship.hsnCode || '8806',
            technicalSpecs: mergedSpecs,
            ...(needsPriceUpgrade
              ? {
                  priceInr: flagship.priceInr,
                  productType: flagship.productType,
                  applications: flagship.applications,
                  packageContents: flagship.packageContents,
                  productFaqs: flagship.productFaqs,
                  deliveryInfo: flagship.deliveryInfo,
                  warrantyInfo: flagship.warrantyInfo,
                  description: flagship.description,
                }
              : {}),
          })
          .where(eq(products.id, existingFlag.id));
      }
    }

    // 6. Seed Real Engineering Catalog Across All 14 Drone & Electronics Categories (idempotent by SKU)
    const catalogProducts: Array<typeof products.$inferInsert> = [
      {
        categoryId: catMap['drone-frames-mechanical'] || agriDroneCatId,
        sku: 'NTF-UAV-AG10',
        name: '10L Carbon-Fiber Agri-UAV Frame Kit',
        slug: '10l-carbon-fiber-agri-uav-frame-kit',
        brand: 'KRASHIVANTRI',
        productType: 'variable',
        modelNumber: 'AG-10L-CF',
        shortDescription: 'Foldable 3K carbon-fiber frame kit with CNC 7075 alloy joints.',
        storeScope: 'general',
        description: 'Foldable 3K twill carbon-fiber agricultural frame engineered for 10L payload capacity with CNC 7075 aluminum joints.',
        technicalSpecs: { Wheelbase: '1420 mm', Payload: 'Up to 10 kg', Material: '3K Carbon + 7075-T6 Alloy', FoldedSize: '680 × 680 × 410 mm' },
        features: ['Quick-fold 7075-T6 aluminum arm locks', '3K twill carbon booms for high stiffness', 'Pre-drilled spray pump mounting deck'],
        compatibility: 'Supports 30 mm / 35 mm motor mounts, 6S–12S power systems, and diaphragm spray pumps',
        packageContents: ['Carbon Center Plates & Folding Arms', 'CNC 7075 Landing Gear', '10L Tank Mounting Cradle', 'SS304 Fastener Kit'],
        applications: 'Agricultural spraying drones, custom research UAV airframes',
        tags: ['Agri Drone', 'Carbon Frame', 'KRASHIVANTRI'],
        priceInr: 34500,
        discountPriceInr: 31900,
        gstPercent: 18,
        stockQty: 6,
        dimensions: '1420 × 1420 × 450 mm',
        weightGrams: 4200,
        deliveryInfo: 'Dispatches within 2–3 business days from Nagpur',
        material: '3K Carbon Fiber & 7075 Alloy',
        availableColors: ['Carbon Black'],
        availableVariants: ['Quadcopter 10L', 'Hexacopter 16L'],
        productionTimeDays: 3,
        warrantyInfo: '1-year structural warranty',
        imageUrl: '/src/assets/images/service_agri_drone_1794981061744.jpg',
        galleryUrls: [
          '/src/assets/images/service_agri_drone_1794981061744.jpg',
          '/src/assets/images/service_drone_repair_1794987205295.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: false,
        isPublished: true,
      },
      {
        categoryId: catMap['escs-flight-controllers'] || null,
        sku: 'NTF-FC-H743',
        name: 'NTF-H743 Dual-IMU Flight Controller',
        slug: 'ntf-h743-dual-imu-flight-controller',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-FC-H743-V2',
        shortDescription: 'STM32H743 flight controller with dual redundant IMUs and dual CAN bus.',
        storeScope: 'general',
        description: 'Industrial-grade STM32H743 flight controller with dual redundant IMUs, dual CAN bus, and isolated barometer for autonomous UAVs and FPV rigs.',
        technicalSpecs: { MCU: 'STM32H743VI 480MHz', IMU: 'Dual ICM-42688-P', Interfaces: '2x CAN, 7x UART, I2C', Input: '2S–12S LiPo via PMU' },
        features: ['Dual redundant low-noise IMUs', 'Dual CAN bus for DroneCAN peripherals', 'Integrated barometer & OSD chip'],
        compatibility: 'ArduPilot, PX4, Betaflight, iNav · 30.5×30.5 mm mounting pattern',
        packageContents: ['1x NTF-H743 Flight Controller', '1x Silicone Vibration Grommet Set', '2x JST-GH Telemetry Cables'],
        applications: 'Autonomous agricultural UAVs, long-range survey drones, custom FPV builds',
        productFaqs: [{ q: 'Does it support ArduPilot and PX4 out of the box?', a: 'Yes, it ships with a verified bootloader compatible with ArduPilot and PX4 firmware targets.' }],
        tags: ['Flight Controller', 'STM32H743', 'ArduPilot', 'UAV'],
        priceInr: 12499,
        discountPriceInr: 10999,
        gstPercent: 18,
        stockQty: 18,
        dimensions: '54 × 38 × 12 mm',
        weightGrams: 34,
        deliveryInfo: 'Dispatches within 24–48 hours from Nagpur',
        material: '6-Layer ENIG FR4 PCB',
        availableColors: ['Dark Charcoal PCB'],
        availableVariants: ['Standard Stack', 'With PMU + GPS Kit'],
        productionTimeDays: 1,
        warrantyInfo: '6-month manufacturing warranty',
        imageUrl: '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
        galleryUrls: [
          '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
          '/src/assets/images/service_pcb_single_double_1794987204677.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: false,
        isPublished: true,
      },
      {
        categoryId: catMap['custom-drone-hardware'] || null,
        sku: 'NTF-DEV-HEX800',
        name: 'X800 Custom Mapping & Survey Hexacopter Kit',
        slug: 'x800-custom-mapping-survey-hexacopter-kit',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-HEX-800',
        shortDescription: 'Modular hexacopter airframe with dual battery trays and gimbal rails.',
        storeScope: 'general',
        description: 'Custom R&D hexacopter development platform engineered for RTK photogrammetry, LiDAR mapping, and university aerial robotics projects.',
        technicalSpecs: { Wheelbase: '800 mm Hexacopter', PayloadBay: 'Universal 12 mm Gimbal Rail', Propulsion: '6S / 12S Brushless Compatible', Weight: '2.4 kg Airframe' },
        features: ['Tool-free folding carbon booms', 'Isolated avionics bay for NTF-H743 / Pixhawk', 'Modular dual-rail payload mount'],
        compatibility: 'PX4 / ArduPilot stacks, Sony/thermal survey cameras, RTK GNSS pucks',
        packageContents: ['Hexacopter Carbon Frame', 'Retractable Skids', 'CNC Aluminum Motor Mounts'],
        applications: 'Aerial photogrammetry, LiDAR research, autonomous inspection',
        tags: ['Custom Drone', 'Hexacopter', 'Survey UAV'],
        priceInr: 28900,
        discountPriceInr: 25499,
        gstPercent: 18,
        stockQty: 9,
        dimensions: '800 × 800 × 310 mm',
        weightGrams: 2400,
        deliveryInfo: 'Dispatches within 2–4 business days',
        material: '3K Matte Carbon & 6061 Aluminum',
        availableColors: ['Matte Carbon'],
        availableVariants: ['Airframe Only', 'Airframe + Power & Motor Bundle'],
        productionTimeDays: 3,
        warrantyInfo: '6-month structural warranty',
        imageUrl: '/src/assets/images/service_drone_repair_1794987205295.jpg',
        galleryUrls: [
          '/src/assets/images/service_drone_repair_1794987205295.jpg',
          '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: false,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['drone-motors-propulsion'] || null,
        sku: 'NTF-MTR-X8318',
        name: 'NTF-X8 120KV Heavy-Lift Agricultural Brushless Motor & Folding Prop Set',
        slug: 'ntf-x8-120kv-heavy-lift-agri-brushless-motor',
        brand: 'KRASHIVANTRI',
        productType: 'variable',
        modelNumber: 'NTF-X8-120KV',
        shortDescription: 'IPX6-sealed 12S brushless agricultural propulsion motor with 30-inch carbon folding blades.',
        storeScope: 'general',
        description: 'High-torque IPX6 waterproof brushless motor engineered for continuous agricultural spraying missions with integrated CNC 30 mm / 35 mm tube mount.',
        technicalSpecs: { KVRating: '120 KV', Voltage: '12S LiPo (44.4V–50.4V)', IngressRating: 'IPX6 Chemical & Dust Sealed', PropSize: '30×9.5 inch Folding CF' },
        features: ['Corrosion-resistant anodized bell and windings', 'IPX6 water & agrochemical splash protection', 'Precision dynamic rotor balancing'],
        compatibility: 'Supports 80A–120A 12S FOC ESCs and 30mm / 35mm carbon booms',
        packageContents: ['1x NTF-X8 120KV Motor', '1x Pair 30-inch Folding Props', 'Motor Mount Screws'],
        applications: 'Agricultural spraying drones, heavy-lift cargo & industrial hexacopters',
        tags: ['Brushless Motor', 'Propulsion', 'Agri Drone'],
        priceInr: 14800,
        discountPriceInr: 13490,
        gstPercent: 18,
        stockQty: 16,
        dimensions: '108 × 108 × 52 mm',
        weightGrams: 720,
        deliveryInfo: 'Ships within 24–48 hours from Nagpur',
        material: '7075 CNC Aluminum & 3K Carbon Blades',
        availableColors: ['Matte Charcoal & Green'],
        availableVariants: ['CW Propulsion Pair', 'CCW Propulsion Pair'],
        productionTimeDays: 1,
        warrantyInfo: '6-month coil & bearing warranty',
        imageUrl: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
        galleryUrls: ['/src/assets/images/krashivantri_x_pro_1795013371537.jpg'],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['batteries-power-systems'] || null,
        sku: 'NTF-PMU-12S',
        name: '12S Smart UAV Power Distribution & Current Sensor',
        slug: '12s-smart-uav-power-distribution-sensor',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-PMU-12S',
        shortDescription: '4oz heavy-copper 6S–14S PDB with CAN/I2C current telemetry.',
        storeScope: 'general',
        description: 'High-current 4oz copper power distribution board supporting 6S–14S LiPo packs with I2C/CAN voltage-current telemetry for flight controllers.',
        technicalSpecs: { VoltageRange: '18V–60V (6S–14S)', PeakCurrent: '240A Continuous / 360A Burst', RegulatedOutputs: '5V/5A + 12V/4A BEC', Telemetry: 'CAN & I2C INA238' },
        features: ['240A continuous heavy-copper bus bars', 'Dual regulated 5V & 12V BEC outputs', 'DroneCAN & I2C real-time telemetry'],
        compatibility: 'Pixhawk, CubePilot, NTF-H743, ArduPilot UAV power ports',
        packageContents: ['1x 12S Smart PMU Board', 'XT90-S Input Pigtail', 'GH 6-Pin Telemetry Lead'],
        applications: 'Agricultural spraying drones, heavy-lift multirotors, robotics power buses',
        tags: ['Power', 'PMU', '12S', 'Batteries & Power Systems'],
        priceInr: 4800,
        discountPriceInr: 4350,
        gstPercent: 18,
        stockQty: 22,
        dimensions: '68 × 68 × 14 mm',
        weightGrams: 112,
        deliveryInfo: 'Ships within 24 hours',
        material: '4oz Heavy Copper FR4',
        availableColors: ['Matte Black'],
        availableVariants: ['XT90-S Input', 'AS150 Anti-Spark Input'],
        productionTimeDays: 1,
        warrantyInfo: '6-month warranty',
        imageUrl: '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
        galleryUrls: [
          '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
          '/src/assets/images/service_pcb_single_double_1794987204677.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: false,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['embedded-electronics'] || null,
        sku: 'NTF-IOT-ESP32S3',
        name: 'NTF Industrial ESP32-S3 Telemetry & RS485 Node',
        slug: 'ntf-industrial-esp32s3-telemetry-rs485-node',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-IOT-S3',
        shortDescription: 'DIN-rail ESP32-S3 controller with isolated RS485, CAN, and dual relays.',
        storeScope: 'general',
        description: 'DIN-rail and field-enclosure compatible ESP32-S3 industrial IoT controller with isolated RS485 Modbus, CAN bus, and dual relay outputs.',
        technicalSpecs: { MCU: 'ESP32-S3 Dual-Core 240MHz', Comms: 'Wi-Fi, BLE 5, Isolated RS485, CAN', PowerInput: '9V–36V DC Isolated', Protection: 'TVS Surge & Reverse Polarity' },
        features: ['9V–36V wide DC industrial power stage', 'Galvanically isolated RS485 Modbus RTU transceiver', 'Dual industrial relay outputs'],
        compatibility: 'Arduino IDE, ESP-IDF, MicroPython, MQTT / Modbus RTU',
        packageContents: ['1x NTF ESP32-S3 Industrial Node', '1x External 2.4GHz Antenna', 'Screw Terminal Plugs'],
        applications: 'Smart agriculture telemetry, factory sensor acquisition, edge automation',
        tags: ['ESP32', 'Embedded Electronics', 'RS485'],
        priceInr: 2850,
        discountPriceInr: 2499,
        gstPercent: 18,
        stockQty: 32,
        dimensions: '90 × 58 × 26 mm',
        weightGrams: 95,
        deliveryInfo: 'Ships same or next business day',
        material: '4-Layer FR4 + ABS Enclosure',
        availableColors: ['Industrial Grey'],
        availableVariants: ['Board Only', 'With DIN-Rail Enclosure'],
        productionTimeDays: 1,
        warrantyInfo: '6-month replacement warranty',
        imageUrl: '/src/assets/images/service_pcb_single_double_1794987204677.jpg',
        galleryUrls: [
          '/src/assets/images/service_pcb_single_double_1794987204677.jpg',
          '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['spraying-pumps-nozzles'] || null,
        sku: 'NTF-NOZ-SPRAY4',
        name: 'High-Pressure Agricultural UAV Brushless Pump & Nozzle Kit',
        slug: 'high-pressure-agri-uav-brushless-pump-nozzle-kit',
        brand: 'KRASHIVANTRI',
        productType: 'variable',
        modelNumber: 'NTF-SPRAY-5LPM',
        shortDescription: '5 L/min chemical-resistant brushless diaphragm pump + 4x flat-fan nozzles.',
        storeScope: 'general',
        description: 'Field-serviceable high-pressure agricultural drone spraying pump assembly with PWM flow control, inline mesh filter, and 4 precision flat-fan atomizing nozzles.',
        technicalSpecs: { FlowRate: '5.0 L/min Max', InputVoltage: '22V–52V (6S–12S)', Control: 'PWM 1000–2000 µs', Nozzles: '4x Flat-Fan Spray Heads' },
        features: ['Viton chemical-resistant seals for agrochemicals', 'PWM speed modulation from flight controller', 'Quick-disconnect pneumatic push fittings'],
        compatibility: 'KRASHIVANTRI X / X PRO, standard 10L–20L agricultural UAV platforms',
        packageContents: ['1x Brushless Spray Pump', '4x Atomizing Nozzles + Holders', '3m PU Tubing & Mesh Filter'],
        applications: 'Agricultural spraying drone maintenance, custom spray retrofits',
        tags: ['Agri Nozzle', 'Spray Pump', 'Spraying Pumps'],
        priceInr: 6490,
        discountPriceInr: 5790,
        gstPercent: 18,
        stockQty: 28,
        dimensions: '140 × 85 × 65 mm',
        weightGrams: 460,
        deliveryInfo: 'Dispatches same day before 4 PM IST',
        material: 'Chemical-Resistant Polymer & SS316',
        availableColors: ['Matte Black'],
        availableVariants: ['Single Pump + 4 Nozzles', 'Dual Pump Commercial Pack'],
        productionTimeDays: 1,
        warrantyInfo: '6-month pump warranty',
        imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
        galleryUrls: [
          '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
          '/src/assets/images/service_drone_repair_1794987205295.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['drone-sensors-gps'] || null,
        sku: 'NTF-GPS-RTKM9',
        name: 'NTF Dual-Band RTK GNSS & Terrain Radar Module',
        slug: 'ntf-dual-band-rtk-gnss-terrain-radar-module',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-GNSS-RTK2',
        shortDescription: 'Centimeter-level L1/L2 RTK positioning puck with CAN + IST8310 compass.',
        storeScope: 'general',
        description: 'High-precision multi-constellation GNSS receiver featuring DroneCAN bus output, integrated safety switch, and CNC folding mast.',
        technicalSpecs: { Bands: 'GPS L1/L2, GLONASS, BeiDou, Galileo', Bus: 'DroneCAN + UART', Compass: 'IST8310 Integrated', Mounting: 'Carbon Mast Included' },
        features: ['Sub-decimeter RTK positioning readiness', 'EMI-shielded ground plane enclosure', 'Plug-and-play DroneCAN JST-GH interface'],
        compatibility: 'ArduPilot, PX4, CubePilot, NTF-H743',
        packageContents: ['1x RTK GNSS Module', '1x Folding Mast', '2x CAN Cables'],
        applications: 'Precision agricultural crop rows, survey mapping UAVs',
        tags: ['RTK GPS', 'Sensors', 'UAV GNSS'],
        priceInr: 15900,
        discountPriceInr: 14490,
        gstPercent: 18,
        stockQty: 14,
        dimensions: '62 × 62 × 18 mm',
        weightGrams: 78,
        deliveryInfo: 'Ships within 24 hours from Nagpur',
        material: 'CNC Anodized Housing & High-Gain Patch Antenna',
        availableColors: ['Dark Charcoal'],
        availableVariants: ['Rover GNSS Unit', 'Rover + Base Telemetry Pair'],
        productionTimeDays: 1,
        warrantyInfo: '6-month hardware warranty',
        imageUrl: '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
        galleryUrls: ['/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg'],
        status: 'published',
        isFeatured: false,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['agricultural-drone-parts'] || null,
        sku: 'NTF-AGPART-16TANK',
        name: '16L Quick-Lock Agricultural Drone Tank & Baffle Assembly',
        slug: '16l-quick-lock-agri-drone-tank-assembly',
        brand: 'KRASHIVANTRI',
        productType: 'simple',
        modelNumber: 'NTF-TNK-16L',
        shortDescription: 'UV-stabilized HDPE 16L quick-release agricultural drone spray tank with level sensor port.',
        storeScope: 'general',
        description: 'Heavy-duty rotationally molded HDPE pesticide spray tank featuring internal anti-slosh baffling, tool-free quick latch rails, and empty-tank float sensor socket.',
        technicalSpecs: { Capacity: '16 Liters', Material: 'Chemical-Resistant HDPE', LatchSystem: 'Dual Slide Rail Lock', SensorPort: 'M12 Float / Ultrasonic' },
        features: ['Anti-slosh internal baffling for stable hover', 'Tool-free quick swap rail system', 'Corrosion-proof bottom suction bulkhead'],
        compatibility: 'KRASHIVANTRI X PRO & standard 16L agricultural UAV frames',
        packageContents: ['1x 16L Tank Shell', '1x Strainer Basket Cap', '1x Bulkhead Seal Kit'],
        applications: 'Agricultural spraying fleets, spare field tanks',
        tags: ['Agri Parts', 'Spray Tank', 'KRASHIVANTRI'],
        priceInr: 5490,
        discountPriceInr: 4990,
        gstPercent: 18,
        stockQty: 19,
        dimensions: '380 × 280 × 260 mm',
        weightGrams: 1180,
        deliveryInfo: 'Dispatches within 24–48 hours',
        material: 'UV-Stabilized Chemical HDPE',
        availableColors: ['Agricultural Green'],
        availableVariants: ['Standard 16L Tank'],
        productionTimeDays: 1,
        warrantyInfo: '6-month seal & shell warranty',
        imageUrl: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
        galleryUrls: ['/src/assets/images/krashivantri_x_pro_1795013371537.jpg'],
        status: 'published',
        isFeatured: false,
        isBestseller: false,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['communication-telemetry'] || null,
        sku: 'NTF-TEL-SIK900',
        name: 'Long-Range 900MHz / 2.4GHz Dual UAV Telemetry Radio Set',
        slug: 'long-range-uav-telemetry-radio-set',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-TEL-LR2',
        shortDescription: 'Low-latency MAVLink telemetry radio pair for ArduPilot & PX4 ground control.',
        storeScope: 'general',
        description: 'Matched air + ground MAVLink telemetry transceiver kit featuring AES-ready encrypted link, SMA high-gain omni antennas, and USB-C ground station plug.',
        technicalSpecs: { Protocol: 'MAVLink v1/v2 Transparent', PowerOutput: '1W Adjustable', Interfaces: 'UART JST-GH + USB-C', Range: 'Up to 15 km Line of Sight' },
        features: ['Matched Air & Ground Unit Pair', 'Pre-configured 57600 baud MAVLink link', 'CNC aluminum heatsink enclosure'],
        compatibility: 'ArduPilot Mission Planner, QGroundControl, NTF-H743',
        packageContents: ['1x Air Unit', '1x Ground USB-C Unit', '2x High-Gain SMA Antennas'],
        applications: 'Agricultural spraying telemetry, BVLOS R&D ground stations',
        tags: ['Telemetry', 'MAVLink', 'Communication'],
        priceInr: 8900,
        discountPriceInr: 7990,
        gstPercent: 18,
        stockQty: 12,
        dimensions: '54 × 32 × 14 mm',
        weightGrams: 58,
        deliveryInfo: 'Ships within 24 hours',
        material: 'Anodized CNC Aluminum',
        availableColors: ['Matte Black'],
        availableVariants: ['2.4GHz ISM Set', '865–915MHz Long Range Set'],
        productionTimeDays: 1,
        warrantyInfo: '6-month warranty',
        imageUrl: '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
        galleryUrls: ['/src/assets/images/service_pcb_electronics_1794981062614.jpg'],
        status: 'published',
        isFeatured: false,
        isBestseller: false,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['microcontrollers-dev-boards'] || null,
        sku: 'NTF-KIT-ROVER01',
        name: 'Autonomous IoT & STM32 / ESP32-S3 Robotics Development Board Kit',
        slug: 'autonomous-iot-ros2-vision-robotics-starter-kit',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-EDU-ROS2',
        shortDescription: 'Dual-processor STM32 + ESP32-S3 robotics & embedded engineering development kit.',
        storeScope: 'general',
        description: 'Turnkey robotics and embedded development kit complete with dual-layer motor driver PCB, 4WD encoder base, ESP32-S3 + STM32 control node, ultrasonic array, and full documentation.',
        technicalSpecs: { Controller: 'ESP32-S3 + STM32 Co-Processor', Sensors: 'IMU + Ultrasonic + Optical Encoders', Bus: 'UART, SPI, I2C, CAN', Firmware: 'C++ / MicroPython / ROS2 Bridge' },
        features: ['Pre-tested dual-layer power & motor carrier PCB', 'Full wiring diagram & codebase documentation included', 'Expandable top deck for LiDAR or SBC'],
        compatibility: 'Arduino, ESP-IDF, STM32CubeIDE, ROS2 Serial Bridge',
        packageContents: ['4WD Aluminum Base & Motors', 'STM32 + ESP32 Dev Boards', 'Li-Ion Smart BMS Pack', 'Wiring Guide PDF'],
        applications: 'Engineering prototyping, robotics R&D, embedded systems labs',
        tags: ['STM32', 'ESP32', 'Microcontrollers', 'Development Board'],
        priceInr: 14999,
        discountPriceInr: 12999,
        gstPercent: 18,
        stockQty: 15,
        dimensions: '320 × 260 × 150 mm',
        weightGrams: 2150,
        deliveryInfo: 'Dispatches within 48 hours with lab documentation',
        material: 'Anodized Aluminum & ENIG FR4',
        availableColors: ['Dark Charcoal & Silver'],
        availableVariants: ['Standard Dev Kit', 'With Jetson/Pi Compute Carrier'],
        productionTimeDays: 2,
        warrantyInfo: '6-month component warranty + email support',
        imageUrl: '/src/assets/images/service_robotics_automation_1794981063545.jpg',
        galleryUrls: [
          '/src/assets/images/service_robotics_automation_1794981063545.jpg',
          '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
        ],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['wiring-connectors-components'] || null,
        sku: 'NTF-WIR-AS150KIT',
        name: 'AS150 & XT90-S Anti-Spark Heavy Silicone UAV Wiring Harness Kit',
        slug: 'as150-xt90s-anti-spark-uav-wiring-kit',
        brand: 'NexusTekFusion',
        productType: 'variable',
        modelNumber: 'NTF-WIR-HV12S',
        shortDescription: '8AWG/10AWG ultra-flexible 200°C silicone harnesses with anti-spark XT90-S & AS150 plugs.',
        storeScope: 'general',
        description: 'Complete field-service high-current drone wiring & connector assortment featuring genuine anti-spark XT90-S, AS150 gold-plated bullets, and JST-GH avionics crimps.',
        technicalSpecs: { WireGauge: '8 AWG & 10 AWG Silicone', TempRating: '200°C Silicone Jacket', Connectors: 'AS150 + XT90-S + JST-GH', CurrentRating: '150A Continuous' },
        features: ['Zero-arc anti-spark resistor tip on XT90-S / AS150', 'High-strand count flexible tinned copper', 'Color-coded heat-shrink sleeves included'],
        compatibility: '12S agricultural drones, ESC power rails, BMS battery packs',
        packageContents: ['2x AS150 Pairs', '4x XT90-S Pairs', '2m 8AWG Red/Black Silicone Wire', 'JST-GH 6-Pin Leads'],
        applications: 'UAV assembly, drone repair workbench, high-current power electronics',
        tags: ['Wiring', 'Connectors', 'XT90-S', 'AS150'],
        priceInr: 1950,
        discountPriceInr: 1690,
        gstPercent: 18,
        stockQty: 45,
        dimensions: '180 × 120 × 45 mm',
        weightGrams: 340,
        deliveryInfo: 'Ships same business day',
        material: 'Tinned Oxygen-Free Copper & Silicone',
        availableColors: ['Red & Black'],
        availableVariants: ['8AWG AS150 Kit', '10AWG XT90-S Kit'],
        productionTimeDays: 1,
        warrantyInfo: '6-month connector defect replacement',
        imageUrl: '/src/assets/images/service_pcb_single_double_1794987204677.jpg',
        galleryUrls: ['/src/assets/images/service_pcb_single_double_1794987204677.jpg'],
        status: 'published',
        isFeatured: false,
        isBestseller: true,
        isNewArrival: false,
        isPublished: true,
      },
      {
        categoryId: catMap['drone-accessories-spare-parts'] || null,
        sku: 'NTF-ACC-ARM30',
        name: 'CNC 7075 Folding Boom Joint & Vibration Damper Field Spares Kit',
        slug: 'cnc-7075-folding-boom-joint-field-spares-kit',
        brand: 'KRASHIVANTRI',
        productType: 'simple',
        modelNumber: 'NTF-ARM-30MM',
        shortDescription: '30 mm CNC alloy folding boom hinge with stainless locking pin and silicone dampeners.',
        storeScope: 'general',
        description: 'Rapid-replacement folding arm hinge and vibration isolation kit machined from 7075-T6 aluminum for agricultural multi-rotor booms.',
        technicalSpecs: { TubeDiameter: '30 mm Carbon Boom', Alloy: '7075-T6 CNC Anodized', LockMechanism: 'Knurled Quick Latch', Weight: '142 g' },
        features: ['Zero-play precision bore tolerance', 'Integrated wire-routing channel', 'Chemical-resistant black anodizing'],
        compatibility: '30 mm agricultural UAV arms including KRASHIVANTRI X series',
        packageContents: ['1x CNC 30mm Folding Joint', 'SS304 Hardware Kit', '4x TPU Dampeners'],
        applications: 'Agricultural drone field repairs, custom airframe folding',
        tags: ['Drone Accessories', 'Folding Joint', 'Spares'],
        priceInr: 2290,
        discountPriceInr: 1990,
        gstPercent: 18,
        stockQty: 30,
        dimensions: '110 × 65 × 48 mm',
        weightGrams: 142,
        deliveryInfo: 'Ships within 24 hours',
        material: '7075-T6 Aluminum',
        availableColors: ['Dark Charcoal'],
        availableVariants: ['30 mm Tube Clamp'],
        productionTimeDays: 1,
        warrantyInfo: '6-month replacement warranty',
        imageUrl: '/src/assets/images/service_drone_repair_1794987205295.jpg',
        galleryUrls: ['/src/assets/images/service_drone_repair_1794987205295.jpg'],
        status: 'published',
        isFeatured: false,
        isBestseller: false,
        isNewArrival: true,
        isPublished: true,
      },
      {
        categoryId: catMap['3d-printed-products'] || null,
        sku: 'NTF-3DP-GEAR01',
        name: 'PA12-CF Planetary Gearbox Prototype Assembly',
        slug: 'pa12-cf-planetary-gearbox-prototype',
        brand: 'NexusTekFusion',
        productType: 'made_to_order',
        modelNumber: '3DP-PG51',
        shortDescription: '5:1 planetary gearbox printed in carbon-reinforced Nylon PA12.',
        storeScope: '3d_printed',
        description: 'Precision 3D printed 5:1 planetary reduction gearbox in carbon-fiber reinforced Nylon PA12 for robotics actuators and educational demos.',
        technicalSpecs: { Ratio: '5:1 Single Stage', Material: 'PA12 Carbon Fiber', Bore: '8 mm D-Shaft', LayerHeight: '0.15 mm' },
        features: ['Carbon-fiber reinforced wear-resistant gear teeth', '0.15 mm precision layer resolution', 'Ready-to-mount NEMA 17 / 23 pattern'],
        compatibility: 'NEMA 17 / NEMA 23 stepper flanges & 8 mm D-shaft couplers',
        packageContents: ['1x Pre-Assembled PA12-CF Gearbox', 'M3 Mounting Bolts'],
        applications: 'Robotic joints, educational cutaways, custom automation actuators',
        tags: ['3D Printed', 'Gearbox', 'PA12-CF'],
        priceInr: 1850,
        discountPriceInr: 1490,
        gstPercent: 18,
        stockQty: 24,
        dimensions: '98 × 98 × 42 mm',
        weightGrams: 165,
        deliveryInfo: 'Printed to order in 2 business days',
        material: 'Nylon PA12-CF',
        availableColors: ['Carbon Black', 'Slate Grey'],
        availableVariants: ['5:1 Ratio', '10:1 Compound'],
        productionTimeDays: 2,
        warrantyInfo: 'Replacement on transit damage',
        imageUrl: '/src/assets/images/service_3d_printing_1794981063445.jpg',
        galleryUrls: ['/src/assets/images/service_3d_printing_1794981063445.jpg'],
        status: 'published',
        isFeatured: true,
        isBestseller: true,
        isNewArrival: false,
        isPublished: true,
      },
      {
        categoryId: catMap['3d-printed-products'] || null,
        sku: 'NTF-3DP-GPSMNT',
        name: 'TPU Vibration-Isolated RTK GPS & Telemetry Mast',
        slug: 'tpu-vibration-isolated-rtk-gps-mast',
        brand: 'KRASHIVANTRI',
        productType: 'customizable',
        modelNumber: '3DP-GPS-ISO',
        shortDescription: 'Foldable UAV GNSS mast with TPU 95A shock isolator collar.',
        storeScope: '3d_printed',
        description: 'Lightweight carbon-reinforced base with 95A TPU shock-absorbing collar designed for agricultural and survey drone GNSS pucks.',
        technicalSpecs: { Mount: '25 mm Tube Clamp', Dampener: 'TPU 95A', Hardware: 'M3 SS304 Inserts', Height: '140 mm' },
        features: ['Dual-durometer vibration isolation collar', 'SS304 brass heat-set threaded inserts', 'Tool-free foldable hinge'],
        compatibility: 'Fits standard 22 mm and 25 mm carbon fiber UAV booms',
        packageContents: ['1x Foldable Mast Assembly', '1x TPU 95A Isolator Ring', 'M3 Hardware Pack'],
        applications: 'Agricultural drones, RTK survey UAVs',
        tags: ['3D Printed', 'GPS Mast', 'UAV'],
        priceInr: 890,
        discountPriceInr: null,
        gstPercent: 18,
        stockQty: 40,
        dimensions: '75 × 55 × 140 mm',
        weightGrams: 62,
        deliveryInfo: 'Ships within 1–2 business days',
        material: 'PETG + TPU 95A',
        availableColors: ['Black', 'Tech Blue'],
        availableVariants: ['22 mm Boom', '25 mm Boom'],
        productionTimeDays: 1,
        warrantyInfo: 'Replacement on transit damage',
        imageUrl: '/src/assets/images/service_3d_printing_1794981063445.jpg',
        galleryUrls: ['/src/assets/images/service_3d_printing_1794981063445.jpg'],
        status: 'published',
        isFeatured: false,
        isBestseller: false,
        isNewArrival: true,
        isPublished: true,
      },
    ];

    for (const item of catalogProducts) {
      await db
        .insert(products)
        .values(item)
        .onConflictDoUpdate({
          target: products.sku,
          set: { categoryId: item.categoryId },
        });
    }

    // 7. Starter Coupons
    const [{ value: couponCount }] = await db.select({ value: count() }).from(coupons);
    if (couponCount === 0) {
      await db.insert(coupons).values([
        { code: 'NTFWELCOME', discountType: 'percent', discountValue: 5, minOrderInr: 1000, isActive: true },
      ]);
    }

    // 8. Starter Engineering Blogs (4 target SEO categories, idempotent by slug + migrate legacy category names)
    await db
      .update(blogs)
      .set({ category: 'Agricultural Drone Technology' })
      .where(eq(blogs.category, 'Drone Technology'));
    await db
      .update(blogs)
      .set({ category: 'Engineering & Robotics' })
      .where(eq(blogs.category, 'PCB & Embedded'));

    const starterBlogs = [
      {
        title: 'Designing High-Vibration Agricultural UAV Frames with Carbon-Nylon Composites',
        slug: 'designing-agricultural-uav-frames-carbon-nylon',
        category: 'Agricultural Drone Technology',
        tags: ['Agricultural Drones', 'KRASHIVANTRI', 'Carbon Fiber'],
        excerpt: 'How topological bracket optimization and TPU damping improve IMU stability on heavy-lift agricultural spraying platforms.',
        content:
          'Heavy-lift agricultural drones operate under sustained rotor vibration and field exposure. At NexusTekFusion in Nagpur, combining 3K twill carbon booms with PA12-CF printed junction brackets and TPU 95A isolator collars reduces resonant noise reaching the flight controller IMU.\n\nKey engineering considerations include keeping resonant modes away from blade-pass frequencies, sealing ESC bays against agrochemical mist, and selecting fasteners with nylon-insert locknuts for reliable FPO fleet spraying across Vidarbha and Maharashtra.',
        coverImageUrl: '/src/assets/images/service_agri_drone_1794981061744.jpg',
        seoTitle: 'Agricultural UAV Frame Engineering | NexusTekFusion Nagpur',
        seoDescription: 'Engineering guide on vibration damping and carbon-nylon composite brackets for agricultural drones.',
        isPublished: true,
      },
      {
        title: 'FDM vs SLA 3D Printing for Functional UAV Brackets & Engineering Prototypes',
        slug: 'fdm-vs-sla-3d-printing-uav-engineering-prototypes',
        category: '3D Printing & Manufacturing',
        tags: ['3D Printing', 'PA12-CF', 'Rapid Prototyping'],
        excerpt: 'Selecting PETG, PA12-CF carbon-nylon, TPU 95A, or 8K Tough Resin for aerospace mounts, enclosures, and precision mechanical tolerances.',
        content:
          'Rapid prototyping accelerates hardware iteration when engineers choose the right polymer and infill orientation for mechanical loads.\n\nFor agricultural drone nozzle clamps and structural brackets exposed to sunlight and vibration, PA12-CF and annealed PETG provide superior thermal deflection compared to standard PLA. When optical surface finish or thin microfluidic channels are required, 8K SLA resin delivers crisp tolerances before CNC or injection molding commitments.',
        coverImageUrl: '/src/assets/images/service_3d_printing_1794981063445.jpg',
        seoTitle: '3D Printing Materials for UAV & Mechanical Prototypes | NexusTekFusion',
        seoDescription: 'Material engineering comparison between PA12-CF, PETG, TPU, and SLA resins for functional rapid prototyping in Nagpur.',
        isPublished: true,
      },
      {
        title: 'Single & Double-Layer PCB Layout Practices for Reliable Power & Sensor Boards',
        slug: 'double-layer-pcb-layout-best-practices',
        category: 'Engineering & Robotics',
        tags: ['PCB Design', 'Single Layer PCB', 'Double Layer PCB', 'Robotics'],
        excerpt: 'Optimizing trace clearance, ground return paths, and Gerber DFM checks for single-layer and double-layer prototype boards.',
        content:
          'When prototyping controller boards, telemetry carriers, or robotics power distribution accessories in single-layer or double-layer FR4, clean trace widths and solid ground pours minimize voltage drop and EMI.\n\nBefore exporting Gerber RS-274X and Excellon drill files, verify minimum annular rings, solder mask expansion, and clear silkscreen polarity markings for fast fabrication turnaround.',
        coverImageUrl: '/src/assets/images/service_pcb_single_double_1794987204677.jpg',
        seoTitle: 'Single & Double-Layer PCB Design Guide | NexusTekFusion',
        seoDescription: 'DFM layout guidelines for single-layer and double-layer PCB fabrication and robotics electronics.',
        isPublished: true,
      },
      {
        title: 'Preventive Maintenance Checklist for Agricultural Spraying Drones After Monsoon Sorties',
        slug: 'preventive-maintenance-checklist-agricultural-drones',
        category: 'Drone Maintenance',
        tags: ['Drone Maintenance', 'UAV Calibration', 'Agricultural Drones'],
        excerpt: 'Step-by-step inspection of brushless motor bearings, diaphragm pump seals, ESC solder joints, and compass calibration after intensive field operations.',
        content:
          'Agricultural spraying platforms endure high humidity, dust, and agrochemical residue. Structured post-sortie inspection keeps fleets airworthy throughout peak Kharif and Rabi spraying windows.\n\nFlush tank manifolds and flat-fan nozzles with clean water after every session, inspect 3K carbon arm folding pins for micro-play, verify LiPo cell internal resistance balance, and schedule bench thrust and IMU recalibration at NexusTekFusion’s Nagpur diagnostics workshop.',
        coverImageUrl: '/src/assets/images/service_drone_repair_1794987205295.jpg',
        seoTitle: 'Agricultural Drone Preventive Maintenance Checklist | NexusTekFusion',
        seoDescription: 'Practical drone maintenance, pump flushing, and flight controller calibration checklist for agricultural UAV operators.',
        isPublished: true,
      },
    ];

    for (const post of starterBlogs) {
      await db.insert(blogs).values(post).onConflictDoNothing({ target: blogs.slug });
    }

    // 9. Starter Engineering R&D & Academic Projects (Case Studies)
    const [{ value: caseCount }] = await db.select({ value: count() }).from(caseStudies);
    if (caseCount === 0) {
      await db.insert(caseStudies).values([
        {
          title: 'KRASHIVANTRI Agricultural Spraying UAV Architecture',
          slug: 'krashivantri-agricultural-spraying-uav',
          technologyUsed: 'Autonomous Flight Control, Brushless Propulsion, Telemetry Link, Carbon-Alloy Airframe',
          applications: 'Precision crop spraying, field boundary mapping, automated mission waypoints',
          outcomes: 'Modular airframe architecture designed for rapid field servicing and configurable payload tanks.',
          relatedServices: ['Drone Repair & Diagnostics', 'PCB Fabrication', '3D Printing'],
          description: 'An integrated agricultural UAV engineering platform combining custom power distribution PCBs, ruggedized landing assemblies, and automated mission planning workflows.',
          imageUrl: '/src/assets/images/service_agri_drone_1794981061744.jpg',
          videoUrl: '',
          isPublished: true,
        },
        {
          title: 'ROS2 Autonomous Inspection Rover with 6-DOF Manipulator',
          slug: 'ros2-autonomous-inspection-rover',
          technologyUsed: 'ROS2, 360° LiDAR SLAM, STM32 Motor Control, PA12-CF Actuators',
          applications: 'Warehouse navigation, laboratory automation, academic robotics research',
          outcomes: 'Unified hardware-software testbed combining omnidirectional mobility with precision end-effector actuation.',
          relatedServices: ['Custom Engineering', 'Double Layer PCB', '3D Printing'],
          description: 'Custom mobile robotics chassis integrating encoder feedback, LiDAR localization, and modular gripper tooling for research and industrial prototyping.',
          imageUrl: '/src/assets/images/service_robotics_automation_1794981063545.jpg',
          videoUrl: '',
          isPublished: true,
        },
      ]);
    }

    seededOnce = true;
  } catch (error) {
    console.error('Error during ensureInitialSeed:', error);
  }
}
