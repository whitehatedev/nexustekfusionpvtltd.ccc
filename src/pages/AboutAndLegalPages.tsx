import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  CircuitBoard,
  Compass,
  Cpu,
  ExternalLink,
  Factory,
  Film,
  FlaskConical,
  Globe,
  GraduationCap,
  Layers,
  Leaf,
  Mail,
  MapPin,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Target,
  User,
  Users,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { Product, TeamMemberProfile } from '../types/platform';

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const SafeEditorialImage: React.FC<{
  src: string;
  alt: string;
  fallbackTitle: string;
  fallbackSubtitle?: string;
  className?: string;
}> = ({ src, alt, fallbackTitle, fallbackSubtitle, className = 'w-full h-full object-cover' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full min-h-[220px] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] flex flex-col items-center justify-center p-6 text-center text-[#263746] space-y-2 border border-[#DCEAF5]">
        <Plane className="w-7 h-7 text-[#64B5F6]" />
        <div className="font-display font-semibold text-sm text-[#123B5D]">{fallbackTitle}</div>
        {fallbackSubtitle && <div className="text-xs text-[#263746]/80">{fallbackSubtitle}</div>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

const PortraitStage: React.FC<{
  member: TeamMemberProfile;
  size?: 'founder' | 'team';
}> = ({ member, size = 'team' }) => {
  const [imgError, setImgError] = useState(false);
  const isFounder = size === 'founder';
  const resolvedUrl = member.profilePhotoUrl || member.photoUrl || '';
  const isSvg = /\.svg(\?|$)/i.test(resolvedUrl);

  if (resolvedUrl && !imgError) {
    return (
      <div
        className={`relative overflow-hidden bg-[#F0F8FF] border border-[#DCEAF5] ${
          isFounder
            ? 'w-full h-full min-h-[360px] lg:min-h-[460px] rounded-xl'
            : 'w-28 h-32 sm:w-32 sm:h-36 rounded-xl shrink-0'
        }`}
      >
        <img
          src={resolvedUrl}
          alt={member.photoAlt || member.fullName || member.name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={isSvg ? 'w-full h-full object-contain p-3 bg-[#F0F8FF]' : 'w-full h-full object-cover object-top'}
        />
      </div>
    );
  }

  const displayName = member.fullName || member.name;
  return (
    <div
      aria-label={`${displayName} portrait placeholder`}
      className={`relative overflow-hidden bg-gradient-to-b from-[#FFFFFF] to-[#F0F8FF] text-[#123B5D] border border-[#90CAF9] flex flex-col items-center justify-center text-center ${
        isFounder
          ? 'w-full h-full min-h-[340px] lg:min-h-[440px] rounded-xl p-8'
          : 'w-28 h-32 sm:w-32 sm:h-36 rounded-xl p-4 shrink-0'
      }`}
    >
      <div
        className={`rounded-full bg-[#E3F2FD] border border-[#90CAF9] flex items-center justify-center font-display font-bold tracking-wider text-[#123B5D] ${
          isFounder ? 'w-24 h-24 text-2xl mb-4' : 'w-12 h-12 text-base mb-2'
        }`}
      >
        {displayName ? getInitials(displayName) : <User className="w-6 h-6" />}
      </div>
      <div className={isFounder ? 'space-y-1' : 'space-y-0.5'}>
        <div className={`font-display font-semibold text-[#123B5D] ${isFounder ? 'text-base' : 'text-xs'}`}>
          {displayName}
        </div>
        <div className={`text-[#263746]/70 ${isFounder ? 'text-xs' : 'text-[10px]'}`}>
          {member.designation || (isFounder ? 'Leadership Profile' : 'Engineering Profile')}
        </div>
      </div>
    </div>
  );
};

export const AboutPage: React.FC = () => {
  const { settings, banners, navigate, apiFetch, addToCart } = usePlatform();
  const company = settings.companyInfo;
  const aboutCms = settings.cmsContent?.aboutUs;
  const [krashiProducts, setKrashiProducts] = useState<Record<string, Product | null>>({});
  const [selectedProfile, setSelectedProfile] = useState<TeamMemberProfile | null>(null);

  useEffect(() => {
    let active = true;
    const loadKrashivantriModels = async () => {
      try {
        const [resX, resPro] = await Promise.allSettled([
          apiFetch<{ product: Product }>('/api/products/krashivantri-x'),
          apiFetch<{ product: Product }>('/api/products/krashivantri-x-pro'),
        ]);
        if (!active) return;
        setKrashiProducts({
          'krashivantri-x': resX.status === 'fulfilled' ? resX.value.product : null,
          'krashivantri-x-pro': resPro.status === 'fulfilled' ? resPro.value.product : null,
        });
      } catch {
        // Catalog fallback remains intact when single-product lookup is unavailable
      }
    };
    loadKrashivantriModels();
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const rawTeam = (settings.aboutTeam || [])
    .filter((m) => m.isActive !== false && m.status !== 'draft')
    .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));

  const founderProfile: TeamMemberProfile | null =
    rawTeam.find((m) => /founder|chief executive|\bceo\b/i.test(m.designation)) ||
    rawTeam.find((m) => m.isFeatured && /executive|leadership/i.test(m.professionalCategory || '')) ||
    null;

  const founderEducationList = (founderProfile?.qualifications || '')
    .split(/\s*[·•|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const founderResponsibilityList = (founderProfile?.responsibilities || '')
    .split(/\s*[·•;\n]+\s*/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean);

  const engineeringTeam = rawTeam.filter((m) => !founderProfile || String(m.id) !== String(founderProfile.id));
  const aboutBanners = (banners || []).filter(
    (b) => b.placement === 'about' && b.isActive && b.status === 'published'
  );

  const catalogModels = settings.krashivantriCatalog?.models || [];
  const krashiCards = [
    {
      slug: 'krashivantri-x',
      fallbackName: 'KRASHIVANTRI X',
      fallbackTagline: 'Smart Agriculture. Precision Spraying.',
      fallbackImage: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
      fallbackSummary:
        'Modular agricultural spraying drone built for rapid field deployment, precision nozzle coverage, and dependable everyday farm operations.',
    },
    {
      slug: 'krashivantri-x-pro',
      fallbackName: 'KRASHIVANTRI X PRO',
      fallbackTagline: 'Advanced Intelligence. Precision Agriculture.',
      fallbackImage: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
      fallbackSummary:
        'High-endurance intelligent agricultural UAV engineered for commercial fleet spraying operators, FPOs, and autonomous mission telemetry.',
    },
  ].map((card) => {
    const dbProduct = krashiProducts[card.slug] || null;
    const cmsModel = catalogModels.find((m) => m.id === card.slug);
    const dbSpecPairs = Object.entries(dbProduct?.technicalSpecs || {}).map(([label, value]) => ({
      label,
      value: String(value),
    }));
    const cmsSpecPairs = (cmsModel?.specs || []).filter((s) => s.label && s.value);
    const verifiedSpecs = dbSpecPairs.length > 0 ? dbSpecPairs : cmsSpecPairs;
    const features = (
      dbProduct?.features && dbProduct.features.length > 0
        ? dbProduct.features
        : cmsModel?.highlights || []
    ).slice(0, 4);

    return {
      slug: card.slug,
      dbProduct,
      name: dbProduct?.name || cmsModel?.name || card.fallbackName,
      tagline: cmsModel?.tagline || card.fallbackTagline,
      imageUrl: dbProduct?.imageUrl || cmsModel?.imageUrl || card.fallbackImage,
      summary: dbProduct?.shortDescription || cmsModel?.summary || card.fallbackSummary,
      verifiedSpecs: verifiedSpecs.slice(0, 6),
      features,
    };
  });

  const heroCapabilities =
    aboutCms?.heroCapabilities && aboutCms.heroCapabilities.length > 0
      ? aboutCms.heroCapabilities
      : [
          {
            num: '01',
            title: 'AGRICULTURAL DRONE MANUFACTURING',
            detail: 'Indigenous KRASHIVANTRI UAV assembly, avionics, and custom airframes.',
          },
          {
            num: '02',
            title: 'DRONE-AS-A-SERVICE (DaaS)',
            detail: 'Precision crop spraying, surveying, and scalable service partner operations.',
          },
          {
            num: '03',
            title: 'ENGINEERING & TECHNOLOGY INNOVATION',
            detail: 'AI, robotics, IoT, embedded hardware, PCB design, and rapid prototyping.',
          },
        ];

  const corporateFields = [
    {
      label: 'Company',
      value: company?.legalName || 'NexusTekFusion Private Limited',
      mono: false,
    },
    ...(founderProfile?.fullName || founderProfile?.name || company?.founderCeo
      ? [
          {
            label: 'Leadership',
            value: founderProfile?.fullName || founderProfile?.name || company?.founderCeo || '',
            mono: false,
          },
        ]
      : []),
    {
      label: 'Established',
      value: company?.established || '2026',
      mono: true,
    },
    {
      label: 'CIN',
      value: company?.cin || 'U30305ME2026PTC474052',
      mono: true,
    },
    {
      label: 'Headquarters',
      value: 'Nagpur, Maharashtra, India',
      mono: false,
    },
    {
      label: 'Website',
      value: company?.website || 'https://nexustekfusion.in',
      href: company?.website || 'https://nexustekfusion.in',
      mono: true,
    },
    {
      label: 'Email',
      value: company?.email || 'info@nexustekfusion.in',
      href: `mailto:${company?.email || 'info@nexustekfusion.in'}`,
      mono: true,
    },
  ].filter((item) => Boolean(item.value));

  const missionPoints =
    aboutCms?.missionPoints && aboutCms.missionPoints.length > 0
      ? aboutCms.missionPoints
      : [
          'Establishing nationwide agricultural Drone-as-a-Service operations.',
          'Manufacturing indigenous KRASHIVANTRI agricultural drones.',
          'Making precision spraying and crop monitoring accessible to farmers.',
          'Developing AI-powered agriculture and autonomous technologies.',
          'Promoting Indian engineering, research, and product innovation.',
          'Creating employment and rural entrepreneurship opportunities.',
        ];

  const verticalIcons = [
    <Plane className="w-4 h-4 text-[#42A5F5]" />,
    <Sprout className="w-4 h-4 text-[#42A5F5]" />,
    <Cpu className="w-4 h-4 text-[#42A5F5]" />,
    <Wrench className="w-4 h-4 text-[#42A5F5]" />,
  ];

  const businessVerticals =
    aboutCms?.verticals && aboutCms.verticals.length > 0
      ? aboutCms.verticals.map((v, idx) => ({
          ...v,
          icon: verticalIcons[idx % verticalIcons.length],
        }))
      : [
          {
            num: '01',
            title: 'AGRICULTURAL DRONE MANUFACTURING',
            description: 'Designing and developing indigenous agricultural UAV platforms.',
            imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
            icon: verticalIcons[0],
            groupLabel: 'Capabilities',
            items: [
              'KRASHIVANTRI X and X PRO',
              'Agricultural drone assembly',
              'Custom UAV engineering',
              'Payload integration',
              'Drone electronics and hardware',
              'OEM and customized manufacturing',
            ],
          },
          {
            num: '02',
            title: 'DRONE-AS-A-SERVICE (DaaS)',
            description:
              'Making agricultural drone technology accessible through a scalable service network across India.',
            imageUrl: '/src/assets/images/service_agri_drone_1794981061744.jpg',
            icon: verticalIcons[1],
            groupLabel: 'Services',
            items: [
              'Agricultural drone spraying',
              'Crop monitoring and surveying',
              'Precision agriculture',
              'Drone pilot services',
              'Regional service partner network',
              'Farmer-focused booking and service management',
            ],
            highlightNote:
              'Built with a clear expansion roadmap to scale agricultural drone spraying and field operations throughout India.',
          },
          {
            num: '03',
            title: 'ENGINEERING & TECHNOLOGY INNOVATION',
            description: 'Turning engineering concepts into practical technology products.',
            imageUrl: '/src/assets/images/service_robotics_automation_1794981063545.jpg',
            icon: verticalIcons[2],
            groupLabel: 'Capabilities',
            items: [
              'Artificial Intelligence and Machine Learning',
              'Robotics and Autonomous Systems',
              'IoT and Embedded Electronics',
              'PCB Design and Hardware Development',
              '3D Printing and Rapid Prototyping',
              'Industrial Automation',
              'Custom Engineering and Product Development',
            ],
          },
        ];

  const techIcons = [
    <BrainCircuit className="w-5 h-5 text-[#42A5F5]" />,
    <Plane className="w-5 h-5 text-[#42A5F5]" />,
    <Bot className="w-5 h-5 text-[#42A5F5]" />,
    <Wifi className="w-5 h-5 text-[#42A5F5]" />,
    <Cpu className="w-5 h-5 text-[#42A5F5]" />,
    <CircuitBoard className="w-5 h-5 text-[#42A5F5]" />,
    <Layers className="w-5 h-5 text-[#42A5F5]" />,
    <Factory className="w-5 h-5 text-[#42A5F5]" />,
  ];

  const techCapabilities =
    aboutCms?.techCapabilities && aboutCms.techCapabilities.length > 0
      ? aboutCms.techCapabilities.map((tc, idx) => ({
          ...tc,
          icon: techIcons[idx % techIcons.length],
        }))
      : [
          {
            icon: techIcons[0],
            title: 'Artificial Intelligence & Machine Learning',
            desc: 'Applied computer vision, crop health analytics, predictive field diagnostics, and intelligent decision pipelines.',
          },
          {
            icon: techIcons[1],
            title: 'Agricultural Drones & UAV Systems',
            desc: 'Complete airframe design, heavy-lift propulsion calibration, spraying fluid dynamics, and avionics integration.',
          },
          {
            icon: techIcons[2],
            title: 'Robotics & Autonomous Platforms',
            desc: 'Autonomous path navigation, sensor-fused obstacle avoidance, mechatronic actuation, and field robotics.',
          },
          {
            icon: techIcons[3],
            title: 'IoT & Smart Devices',
            desc: 'Connected agricultural telemetry nodes, low-power wireless gateways, and field-ready connected instrumentation.',
          },
          {
            icon: techIcons[4],
            title: 'Embedded Systems – ESP32, STM32, Raspberry Pi',
            desc: 'Real-time firmware engineering, CAN/UART industrial bus control, edge compute boards, and actuator controllers.',
          },
          {
            icon: techIcons[5],
            title: 'PCB Design & Electronics Assembly',
            desc: 'Multi-layer schematic capture, power-distribution boards, signal-integrity routing, and hardware bring-up.',
          },
          {
            icon: techIcons[6],
            title: '3D Printing & Rapid Prototyping',
            desc: 'Functional polymer enclosures, nozzle brackets, custom drone mounts, and iterative mechanical validation.',
          },
          {
            icon: techIcons[7],
            title: 'Industrial Automation & Product Engineering',
            desc: 'End-to-end R&D from concept feasibility and hardware prototypes to repeatable production workflows.',
          },
        ];

  const daasHighlights =
    aboutCms?.daasHighlights && aboutCms.daasHighlights.length > 0
      ? aboutCms.daasHighlights
      : [
          'Agricultural drone spraying',
          'Crop monitoring and surveying',
          'Farmer-focused services',
          'Trained drone operators',
          'Regional service partners',
          'Precision farming',
          'Rural entrepreneurship',
        ];

  const valueIcons = [
    <Compass className="w-5 h-5 text-[#42A5F5]" />,
    <Award className="w-5 h-5 text-[#42A5F5]" />,
    <Factory className="w-5 h-5 text-[#42A5F5]" />,
    <ShieldCheck className="w-5 h-5 text-[#42A5F5]" />,
    <FlaskConical className="w-5 h-5 text-[#42A5F5]" />,
    <Users className="w-5 h-5 text-[#42A5F5]" />,
    <Leaf className="w-5 h-5 text-[#42A5F5]" />,
    <Sprout className="w-5 h-5 text-[#42A5F5]" />,
  ];

  const coreValues =
    aboutCms?.coreValues && aboutCms.coreValues.length > 0
      ? aboutCms.coreValues.map((cv, idx) => ({
          ...cv,
          icon: valueIcons[idx % valueIcons.length],
        }))
      : [
          {
            icon: valueIcons[0],
            title: 'Innovation',
            desc: 'Applying aerospace engineering, AI, and embedded intelligence to solve practical agricultural and industrial problems.',
          },
          {
            icon: valueIcons[1],
            title: 'Engineering Excellence',
            desc: 'Disciplined mechanical, electronic, and software validation across every drone platform and hardware system we build.',
          },
          {
            icon: valueIcons[2],
            title: 'Indigenous Manufacturing',
            desc: 'Designing, assembling, and calibrating KRASHIVANTRI UAVs and core hardware systems within India.',
          },
          {
            icon: valueIcons[3],
            title: 'Quality & Reliability',
            desc: 'Field-hardened components and repeatable inspection standards built for demanding rural operating conditions.',
          },
        ];

  const overviewParagraphs =
    aboutCms?.overviewParagraphs && aboutCms.overviewParagraphs.length > 0
      ? aboutCms.overviewParagraphs
      : [
          'NexusTekFusion Private Limited is headquartered in Nagpur, Maharashtra, India. We specialize in agricultural drone manufacturing, UAV engineering, artificial intelligence, robotics, embedded electronics, IoT, industrial automation, and advanced product development.',
          'Our approach combines engineering research, hardware development, software intelligence, prototyping, and manufacturing to transform innovative ideas into practical products.',
          'We are building an integrated technology ecosystem focused on indigenous agricultural drone manufacturing, nationwide Drone-as-a-Service operations, and intelligent engineering solutions.',
        ];

  const companyMediaGallery = aboutCms?.companyMediaGallery || [];

  const scrollToCapabilities = () => {
    const el = document.getElementById('about-capabilities');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="bg-[#FFFFFF] text-[#263746]">
      {/* SECTION 3: HERO SECTION – COMPANY IDENTITY */}
      <section className="relative bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] border-b border-[#DCEAF5] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <motion.div
              initial={{ opacity: 0.92, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="lg:col-span-7 flex flex-col justify-between space-y-7"
            >
              <div className="space-y-5">
                <div className="text-xs font-semibold text-[#42A5F5] tracking-wide">
                  {aboutCms?.heroKicker || `Company Profile · Nagpur, Maharashtra, India · Est. ${company?.established || '2026'}`}
                </div>

                <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#123B5D] text-balance leading-[1.08]">
                  {aboutCms?.heroTitle || company?.legalName || 'NEXUSTEKFUSION PRIVATE LIMITED'}
                </h1>

                <p className="font-display text-lg sm:text-2xl font-semibold text-[#42A5F5] text-balance leading-snug">
                  {company?.primaryTagline || 'Transforming Ideas into Reality — Engineering the Future with Intelligence.'}
                </p>

                <p className="text-sm sm:text-base text-[#263746] leading-relaxed max-w-2xl">
                  {aboutCms?.heroDescription ||
                    'An Indian engineering, agricultural drone manufacturing, and technology innovation company building intelligent solutions for agriculture, industry, and emerging technologies.'}
                </p>
              </div>

              {/* Three Primary Capabilities */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#DCEAF5] pt-6">
                {heroCapabilities.map((cap) => (
                  <div key={cap.title} className="space-y-1.5">
                    <div className="font-mono text-xs font-bold text-[#64B5F6] tabular-nums">
                      {cap.num}.
                    </div>
                    <div className="font-display text-xs font-bold tracking-wide text-[#123B5D] leading-snug">
                      {cap.title}
                    </div>
                    <p className="text-xs text-[#263746]/80 leading-relaxed">{cap.detail}</p>
                  </div>
                ))}
              </div>

              {/* Three Hero CTA Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/krashivantri')}
                  className="px-5 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  Explore KRASHIVANTRI <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={scrollToCapabilities}
                  className="px-5 py-3 bg-white border border-[#90CAF9] text-[#123B5D] hover:bg-[#F0F8FF] text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  Our Capabilities
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/contact')}
                  className="px-5 py-3 border border-[#DCEAF5] bg-white text-[#123B5D] hover:bg-[#F0F8FF] text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  Contact Our Team
                </button>
              </div>
            </motion.div>

            {/* Right Dominant Aerospace Visual */}
            <div className="lg:col-span-5 flex">
              <div className="w-full min-h-[280px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] relative shadow-sm">
                {aboutCms?.heroVideoUrl ? (
                  <video
                    src={aboutCms.heroVideoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    poster={aboutCms.heroImageUrl || '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <SafeEditorialImage
                    src={aboutCms?.heroImageUrl || '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg'}
                    alt="NexusTekFusion Agricultural Drone Manufacturing Facility in Nagpur"
                    fallbackTitle="NexusTekFusion Agricultural UAV Manufacturing"
                    fallbackSubtitle="Nagpur, Maharashtra, India"
                  />
                )}
                {!aboutCms?.heroVideoUrl && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#123B5D]/90 via-[#123B5D]/45 to-transparent p-6">
                    <div className="text-xs font-medium text-[#90CAF9]">
                      Indigenous UAV &amp; Robotics Engineering
                    </div>
                    <div className="font-display text-base font-bold text-white mt-0.5">
                      KRASHIVANTRI Manufacturing &amp; R&amp;D Hub — Nagpur
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {aboutBanners.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 space-y-4">
          {aboutBanners.map((ban) => (
            <div
              key={ban.bannerKey}
              className="rounded-2xl border border-[#DCEAF5] bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center shadow-xs"
            >
              {(ban.videoUrl || ban.imageUrl) && (
                <div className="lg:col-span-5 aspect-[16/9] lg:aspect-auto lg:h-full bg-[#F0F8FF]">
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
              <div className={`${ban.videoUrl || ban.imageUrl ? 'lg:col-span-7' : 'lg:col-span-12'} p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="space-y-1.5">
                  <div className="font-display text-xl font-bold text-[#123B5D]">{ban.title}</div>
                  {ban.subtitle && <p className="text-sm text-[#263746]">{ban.subtitle}</p>}
                </div>
                {ban.ctaLabel && ban.ctaLink && (
                  <button
                    type="button"
                    onClick={() => navigate(ban.ctaLink)}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors"
                  >
                    {ban.ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* SECTION 4: ABOUT OUR COMPANY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="flex-1 min-h-[280px] rounded-2xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF] relative shadow-xs">
              <SafeEditorialImage
                src="/src/assets/images/hero_nexustek_engineering_1794981062404.jpg"
                alt="NexusTekFusion Engineering & Hardware Prototyping Lab"
                fallbackTitle="NexusTekFusion Engineering Lab"
                fallbackSubtitle="AI, Robotics, Embedded Systems & UAV Hardware"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#123B5D]/85 via-[#123B5D]/35 to-transparent p-5">
                <div className="text-xs text-[#E3F2FD]">
                  Hardware Engineering · Avionics · Prototyping
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[#64B5F6]">
                {aboutCms?.overviewSubtitle || 'About Our Company'}
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance leading-tight">
                {aboutCms?.overviewTitle || 'Engineering Innovation. Manufacturing Intelligence. Empowering Agriculture.'}
              </h2>
              <div className="space-y-3.5 text-sm sm:text-base text-[#263746] leading-relaxed">
                {overviewParagraphs.map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
              {aboutCms?.historyDescription && (
                <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-1">
                  <div className="text-xs font-semibold text-[#42A5F5]">
                    {aboutCms.historyTitle || 'Company Evolution'}
                  </div>
                  <p className="text-xs sm:text-sm text-[#263746] leading-relaxed">{aboutCms.historyDescription}</p>
                </div>
              )}
            </div>

            {/* Corporate Information Panel */}
            <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-7 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#123B5D]">
                  <Building2 className="w-4 h-4 text-[#64B5F6]" /> Corporate Information
                </div>
                <span className="text-xs text-[#263746]/70">Registered Indian Private Limited Entity</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {corporateFields.map((item) => (
                  <div key={item.label} className="space-y-0.5 min-w-0">
                    <div className="text-xs text-[#263746]/70">{item.label}</div>
                    {item.href ? (
                      <a
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                        className={`block text-sm font-semibold text-[#42A5F5] hover:text-[#123B5D] break-all ${
                          item.mono ? 'font-mono tabular-nums' : ''
                        }`}
                      >
                        {item.value}
                      </a>
                    ) : (
                      <div
                        className={`text-sm font-semibold text-[#123B5D] ${
                          item.mono ? 'font-mono tabular-nums' : ''
                        }`}
                      >
                        {item.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: VISION & MISSION (Two Visually Distinct Sections) */}
      <section className="bg-[#F0F8FF] border-y border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-8">
          <div className="max-w-3xl space-y-2">
            <div className="text-xs font-semibold text-[#64B5F6]">Strategic Purpose</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance">
              Vision &amp; Mission
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* OUR VISION - Crisp Editorial Surface */}
            <div className="lg:col-span-5 rounded-2xl border border-[#DCEAF5] bg-white p-8 sm:p-10 flex flex-col justify-between space-y-8 shadow-xs">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#42A5F5]">
                  <Target className="w-4 h-4" /> OUR VISION
                </div>
                <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D] text-balance leading-snug">
                  {aboutCms?.visionTitle || 'Leading Indigenous Agricultural Drones & Autonomous Engineering'}
                </h3>
                <p className="text-base text-[#263746] leading-relaxed">
                  {aboutCms?.visionDescription ||
                    'To become a leading Indian engineering and technology company developing indigenous agricultural drones, autonomous systems, robotics, and intelligent engineering products that contribute to a smarter and more sustainable future.'}
                </p>
              </div>

              <div className="border-t border-[#DCEAF5] pt-5 text-xs text-[#263746]/80 flex items-center justify-between gap-4">
                <span>Indigenous R&amp;D · Nagpur, India</span>
                <span className="font-mono text-[#42A5F5] font-semibold">Make in India UAVs</span>
              </div>
            </div>

            {/* OUR MISSION - Soft Sky Gradient Aerospace Surface */}
            <div className="lg:col-span-7 rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-8 sm:p-10 flex flex-col justify-between space-y-7 shadow-xs">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#42A5F5]">
                  <Compass className="w-4 h-4" /> OUR MISSION
                </div>
                <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D] text-balance leading-snug">
                  {aboutCms?.missionTitle || 'Accessible Agricultural Drone Technology & Nationwide DaaS'}
                </h3>
                <p className="text-sm sm:text-base text-[#263746] leading-relaxed">
                  To manufacture innovative agricultural drone technologies, develop advanced engineering products, and make modern drone-based agricultural services accessible to farmers across India.
                </p>
              </div>

              <div className="border-t border-[#DCEAF5] pt-6 space-y-4">
                <div className="text-xs font-semibold text-[#123B5D]">Our mission focuses on:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {missionPoints.map((point, idx) => (
                    <div
                      key={point}
                      className="rounded-xl border border-[#DCEAF5] bg-white p-4 flex items-start gap-3 shadow-xs"
                    >
                      <span className="font-mono text-xs font-bold text-[#64B5F6] tabular-nums shrink-0 mt-0.5">
                        0{idx + 1}
                      </span>
                      <span className="text-xs sm:text-sm text-[#263746] leading-snug">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: CORE BUSINESS VERTICALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-10">
        <div className="max-w-3xl space-y-2">
          <div className="text-xs font-semibold text-[#64B5F6]">Core Business Verticals</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance">
            {aboutCms?.verticalsSectionTitle || 'Three Pillars of NexusTekFusion Operations'}
          </h2>
          <p className="text-sm sm:text-base text-[#263746] leading-relaxed">
            Integrating indigenous drone production, nationwide field spraying operations, and cross-disciplinary hardware and software engineering.
          </p>
        </div>

        <div className={`grid grid-cols-1 ${businessVerticals.length >= 4 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-8 items-stretch`}>
          {businessVerticals.map((vert) => (
            <article
              key={vert.title}
              className="rounded-2xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between transition-colors duration-200 hover:border-[#64B5F6] shadow-xs"
            >
              <div>
                <div className="aspect-[16/10] bg-[#F0F8FF] overflow-hidden relative">
                  <SafeEditorialImage
                    src={vert.imageUrl}
                    alt={vert.title}
                    fallbackTitle={vert.title}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                  />
                </div>

                <div className="p-6 sm:p-7 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#42A5F5] tabular-nums">
                      {vert.num} · Business Vertical
                    </span>
                    {vert.icon}
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="font-display text-lg font-bold text-[#123B5D] leading-snug">
                      {vert.title}
                    </h3>
                    <p className="text-sm text-[#263746] leading-relaxed">{vert.description}</p>
                  </div>

                  <div className="border-t border-[#DCEAF5] pt-4 space-y-2.5">
                    <div className="text-xs font-semibold text-[#263746]/70">{vert.groupLabel}</div>
                    <ul className="space-y-2 text-sm text-[#263746]">
                      {vert.items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {vert.highlightNote && (
                <div className="px-6 sm:px-7 pb-6">
                  <div className="rounded-xl bg-[#F0F8FF] border border-[#DCEAF5] p-3.5 text-xs text-[#263746] leading-relaxed">
                    {vert.highlightNote}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* SECTION 7 & SECTION 8: LEADERSHIP + ENGINEERING & INNOVATION TEAM (100% Dynamic Admin CMS) */}
      {(founderProfile || engineeringTeam.length > 0) && (
        <section className="bg-[#F0F8FF] border-y border-[#DCEAF5]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-12">
            {founderProfile && (
              <>
                <div className="max-w-3xl space-y-2">
                  <div className="text-xs font-semibold text-[#64B5F6]">Leadership &amp; Engineering</div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance">
                    {aboutCms?.leadershipTitle || 'Founder & Leadership'}
                  </h2>
                  {aboutCms?.leadershipSubtitle && (
                    <p className="text-sm text-[#263746]">{aboutCms.leadershipSubtitle}</p>
                  )}
                </div>

                {/* SECTION 7: Large-Format Dynamic Founder / Leadership Profile */}
                <article className="rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-6 sm:p-10 lg:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch shadow-xs">
                  <div className="lg:col-span-4 flex">
                    <PortraitStage member={founderProfile} size="founder" />
                  </div>

                  <div className="lg:col-span-8 flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-[#42A5F5]">
                          {[founderProfile.professionalCategory, founderProfile.department].filter(Boolean).join(' · ') || 'Executive Leadership · Nagpur Headquarters'}
                        </div>
                        <h3 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#123B5D]">
                          {founderProfile.fullName || founderProfile.name}
                        </h3>
                        <div className="text-base font-semibold text-[#263746]">
                          {founderProfile.designation}
                        </div>
                        {founderProfile.experience && (
                          <div className="text-xs text-[#263746]/70 font-mono">{founderProfile.experience}</div>
                        )}
                      </div>

                      {founderEducationList.length > 0 && (
                        <div className="border-t border-[#DCEAF5] pt-4 space-y-2">
                          <div className="text-xs font-semibold text-[#123B5D] flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5 text-[#42A5F5]" /> Education &amp; Credentials
                          </div>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm text-[#263746]">
                            {founderEducationList.map((edu) => (
                              <li key={edu} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                                <span>{edu}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(founderProfile.detailedBiography || founderProfile.biography || founderProfile.shortBiography) && (
                        <div className="border-t border-[#DCEAF5] pt-4 space-y-2">
                          <div className="text-xs font-semibold text-[#123B5D]">Executive Profile</div>
                          <p className="text-sm sm:text-base text-[#263746] leading-relaxed whitespace-pre-line">
                            {founderProfile.detailedBiography || founderProfile.biography || founderProfile.shortBiography}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[#DCEAF5] pt-5 space-y-4">
                      {founderResponsibilityList.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-xs font-semibold text-[#42A5F5]">Key Responsibilities</div>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-sm text-[#263746]">
                            {founderResponsibilityList.map((resp) => (
                              <li key={resp} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                                <span>{resp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-4 pt-1">
                        {founderProfile.skills && (
                          <span className="text-xs text-[#263746]/80">
                            Expertise: <span className="text-[#123B5D] font-medium">{founderProfile.skills}</span>
                          </span>
                        )}
                        {founderProfile.linkedinUrl && (
                          <a
                            href={founderProfile.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D]"
                          >
                            LinkedIn <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </>
            )}

            {/* SECTION 8: Dynamic Team Profiles */}
            {engineeringTeam.length > 0 && (
              <div className="space-y-6 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#DCEAF5] pb-4">
                  <div>
                    <div className="text-xs font-semibold text-[#64B5F6]">Engineering &amp; Innovation</div>
                    <h3 className="font-display text-2xl font-bold text-[#123B5D]">
                      {aboutCms?.teamSectionTitle || 'Engineering & Innovation Team'}
                    </h3>
                    {aboutCms?.teamSectionSubtitle && (
                      <p className="text-xs text-[#263746] mt-0.5">{aboutCms.teamSectionSubtitle}</p>
                    )}
                  </div>
                </div>

                <div
                  className={`grid grid-cols-1 ${
                    engineeringTeam.length > 1 ? 'lg:grid-cols-2' : 'lg:grid-cols-1 max-w-3xl'
                  } gap-6`}
                >
                  {engineeringTeam.map((member) => (
                    <article
                      key={member.id}
                      className="rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start transition-colors duration-200 hover:border-[#64B5F6] shadow-xs"
                    >
                      <PortraitStage member={member} size="team" />

                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-display text-xl font-bold text-[#123B5D]">
                              {member.fullName || member.name}
                            </h4>
                            {member.department && (
                              <span className="text-[11px] font-mono text-[#263746]/70">{member.department}</span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-[#42A5F5]">{member.designation}</div>
                          {member.experience && (
                            <div className="text-xs text-[#263746]/70 font-mono">{member.experience}</div>
                          )}
                        </div>

                        {member.qualifications && (
                          <div className="text-xs sm:text-sm text-[#263746] border-t border-[#DCEAF5] pt-2.5 leading-relaxed">
                            <span className="font-semibold text-[#123B5D]">Qualifications: </span>
                            {member.qualifications}
                          </div>
                        )}

                        {(member.shortBiography || member.biography) && (
                          <p className="text-sm text-[#263746] leading-relaxed">
                            {member.shortBiography || member.biography}
                          </p>
                        )}

                        {member.skills && (
                          <div className="text-xs text-[#263746]">
                            <span className="font-semibold text-[#123B5D]">Expertise: </span>
                            {member.skills}
                          </div>
                        )}

                        {member.responsibilities && (
                          <div className="text-xs sm:text-sm text-[#263746] border-t border-[#DCEAF5] pt-2.5 leading-relaxed">
                            <span className="font-semibold text-[#123B5D]">Responsibilities: </span>
                            {member.responsibilities}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-4 pt-1">
                          {(member.detailedBiography || member.biography) && (
                            <button
                              type="button"
                              onClick={() => setSelectedProfile(member)}
                              className="text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1"
                            >
                              Full Profile <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {member.linkedinUrl && (
                            <a
                              href={member.linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-[#263746] hover:text-[#123B5D] inline-flex items-center gap-1"
                            >
                              LinkedIn <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 9: TECHNOLOGY & ENGINEERING CAPABILITIES */}
      <section id="about-capabilities" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7 space-y-2">
            <div className="text-xs font-semibold text-[#64B5F6]">
              Technical Capabilities &amp; Domains
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance">
              {aboutCms?.techSectionTitle || 'Technology & Engineering Capabilities'}
            </h2>
            <p className="text-sm sm:text-base text-[#263746] leading-relaxed max-w-2xl">
              Multi-disciplinary capabilities spanning embedded firmware, multi-layer PCB design, autonomous robotics, additive prototyping, and heavy-lift agricultural UAVs.
            </p>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <div className="aspect-[16/10] rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF]">
              <SafeEditorialImage
                src="/src/assets/images/service_pcb_electronics_1794981062614.jpg"
                alt="PCB Design and Embedded Electronics Engineering"
                fallbackTitle="PCB & Embedded Systems"
              />
            </div>
            <div className="aspect-[16/10] rounded-xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF]">
              <SafeEditorialImage
                src="/src/assets/images/service_3d_printing_1794981063445.jpg"
                alt="3D Printing and Rapid Mechanical Prototyping"
                fallbackTitle="Rapid Prototyping"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {techCapabilities.map((item, idx) => (
            <div
              key={item.title}
              className="rounded-2xl border border-[#DCEAF5] bg-white p-6 space-y-3 transition-colors duration-200 hover:border-[#64B5F6] shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#F0F8FF] border border-[#DCEAF5] flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="font-mono text-xs font-semibold text-[#64B5F6] tabular-nums">
                  0{idx + 1}
                </span>
              </div>
              <h3 className="font-display text-base font-bold text-[#123B5D] leading-snug">
                {item.title}
              </h3>
              <p className="text-xs text-[#263746] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 10: FLAGSHIP INNOVATION – KRASHIVANTRI */}
      <section className="bg-[#F0F8FF] text-[#263746] border-y border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#DCEAF5] pb-7">
            <div className="space-y-2.5 max-w-3xl">
              <div className="text-xs font-semibold text-[#64B5F6]">Flagship Innovation</div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance">
                {aboutCms?.krashiShowcaseTitle || 'KRASHIVANTRI – Intelligent Agricultural Drone Technology'}
              </h2>
              <p className="text-sm sm:text-base text-[#263746] leading-relaxed">
                {aboutCms?.krashiShowcaseSubtitle ||
                  'KRASHIVANTRI is the agricultural drone product family developed by NexusTekFusion to support modern farming through precision spraying, intelligent UAV technology, and efficient agricultural operations.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/krashivantri')}
              className="px-5 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 transition-colors whitespace-nowrap"
            >
              View KRASHIVANTRI Hub <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {krashiCards.map((model) => (
              <article
                key={model.slug}
                className="rounded-2xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="aspect-[16/9] bg-[#F0F8FF] overflow-hidden">
                    <SafeEditorialImage
                      src={model.imageUrl}
                      alt={model.name}
                      fallbackTitle={model.name}
                      fallbackSubtitle={model.tagline}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                    />
                  </div>

                  <div className="p-6 sm:p-8 space-y-5">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#42A5F5]">{model.tagline}</div>
                      <h3 className="font-display text-2xl font-bold text-[#123B5D]">{model.name}</h3>
                    </div>

                    <p className="text-sm text-[#263746] leading-relaxed">{model.summary}</p>

                    {model.features.length > 0 && (
                      <div className="border-t border-[#DCEAF5] pt-4 space-y-2">
                        <div className="text-xs font-semibold text-[#123B5D]">Key Features</div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#263746]">
                          {model.features.map((feat) => (
                            <li key={feat} className="flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#64B5F6] shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {model.verifiedSpecs.length > 0 ? (
                      <div className="border-t border-[#DCEAF5] pt-4 space-y-2">
                        <div className="text-xs font-semibold text-[#123B5D]">
                          Verified Specifications
                        </div>
                        <div className="divide-y divide-[#DCEAF5] text-xs">
                          {model.verifiedSpecs.map((sp) => (
                            <div key={sp.label} className="py-2 flex justify-between gap-4">
                              <span className="text-[#263746]/70">{sp.label}</span>
                              <span className="font-mono text-[#123B5D] font-medium text-right tabular-nums">
                                {sp.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-[#DCEAF5] pt-4 text-xs text-[#263746]/70">
                        Verified platform specifications are published on the dedicated {model.name} product page.
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6 sm:px-8 pb-6 sm:pb-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/product/${model.slug}`)}
                    className="px-5 py-2.5 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    Explore Product <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (model.dbProduct && model.dbProduct.stockQty > 0) {
                        addToCart(model.dbProduct, 1);
                        navigate('/checkout');
                      } else {
                        navigate(`/product/${model.slug}`);
                      }
                    }}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" /> Buy Now
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 11: NATIONWIDE AGRICULTURAL DRONE VISION */}
      <section className="bg-white border-b border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#64B5F6]">
                  Nationwide DaaS Roadmap · India
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance leading-tight">
                  {aboutCms?.daasTitle || 'EMPOWERING INDIAN AGRICULTURE THROUGH DRONE TECHNOLOGY'}
                </h2>
                <p className="text-sm sm:text-base text-[#263746] leading-relaxed">
                  {aboutCms?.daasDescription ||
                    'Our vision is to make agricultural drone services accessible to farmers throughout India through a connected ecosystem of indigenous drone manufacturing, trained operators, regional service partners, and intelligent agricultural technology.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {daasHighlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] px-4 py-3 flex items-center gap-2.5 text-sm font-medium text-[#123B5D]"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* Explicit Distinction: Active HQ vs Planned Expansion */}
              <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="font-semibold text-[#123B5D]">Current Operational Hub</div>
                  <p className="text-[#263746] leading-relaxed">
                    Headquarters, UAV engineering, manufacturing, and pilot coordination based in Nagpur, Maharashtra.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-[#42A5F5]">Planned Nationwide Expansion</div>
                  <p className="text-[#263746] leading-relaxed">
                    Phased onboarding of certified drone pilots and regional agricultural service partners across Indian farming belts.
                  </p>
                </div>
              </div>
            </div>

            {/* Refined Architectural India Expansion Map Visual */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-6 sm:p-8 space-y-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-4">
                  <div>
                    <div className="text-xs font-semibold text-[#42A5F5]">
                      Ecosystem Architecture
                    </div>
                    <div className="font-display text-lg font-bold text-[#123B5D]">
                      Nagpur Hub &amp; Planned Pan-India Corridors
                    </div>
                  </div>
                  <div className="text-xs text-[#263746]/70 font-mono">
                    HQ: 21.1458° N, 79.0882° E
                  </div>
                </div>

                <div className="relative rounded-xl border border-[#DCEAF5] bg-white p-4 sm:p-6 flex items-center justify-center">
                  <svg
                    viewBox="0 0 420 460"
                    role="img"
                    aria-label="Map of India showing NexusTekFusion headquarters in Nagpur and planned Drone-as-a-Service expansion regions"
                    className="w-full max-w-[360px] h-auto"
                  >
                    {/* Subtle Coordinate Grid */}
                    <g stroke="#90CAF9" strokeOpacity="0.25" strokeWidth="1">
                      <line x1="0" y1="92" x2="420" y2="92" />
                      <line x1="0" y1="184" x2="420" y2="184" />
                      <line x1="0" y1="276" x2="420" y2="276" />
                      <line x1="0" y1="368" x2="420" y2="368" />
                      <line x1="105" y1="0" x2="105" y2="460" />
                      <line x1="210" y1="0" x2="210" y2="460" />
                      <line x1="315" y1="0" x2="315" y2="460" />
                    </g>

                    {/* Refined Geometric Silhouette of India */}
                    <path
                      d="M178,24 L208,34 L224,52 L218,74 L240,94 L274,116 L310,126 L340,122 L374,116 L388,136 L364,158 L372,178 L346,192 L332,164 L310,164 L298,194 L278,214 L256,246 L230,276 L206,314 L188,368 L172,422 L152,434 L138,402 L122,356 L104,310 L92,260 L72,226 L44,206 L46,178 L72,166 L64,142 L94,112 L124,90 L146,56 L160,34 Z"
                      fill="#E3F2FD"
                      stroke="#64B5F6"
                      strokeOpacity="0.8"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />

                    {/* Planned Expansion Corridors from Nagpur Central Hub (182, 224) */}
                    <g stroke="#42A5F5" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="4 4">
                      <line x1="182" y1="224" x2="165" y2="115" />
                      <line x1="182" y1="224" x2="94" y2="218" />
                      <line x1="182" y1="224" x2="275" y2="178" />
                      <line x1="182" y1="224" x2="166" y2="348" />
                    </g>

                    {/* Planned Regional Corridor Nodes */}
                    {[
                      { x: 165, y: 115, label: 'North Corridor (Planned)' },
                      { x: 94, y: 218, label: 'West Corridor (Planned)' },
                      { x: 275, y: 178, label: 'East Corridor (Planned)' },
                      { x: 166, y: 348, label: 'South Corridor (Planned)' },
                    ].map((node) => (
                      <g key={node.label}>
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r="5"
                          fill="#FFFFFF"
                          stroke="#64B5F6"
                          strokeWidth="1.75"
                        />
                        <text
                          x={node.x}
                          y={node.y - 10}
                          textAnchor="middle"
                          fill="#123B5D"
                          fontSize="9"
                          fontWeight="600"
                          fontFamily="ui-monospace, monospace"
                        >
                          {node.label}
                        </text>
                      </g>
                    ))}

                    {/* Nagpur Operational Headquarters Anchor */}
                    <g>
                      <circle cx="182" cy="224" r="14" fill="#64B5F6" fillOpacity="0.22" />
                      <circle cx="182" cy="224" r="6" fill="#42A5F5" stroke="#FFFFFF" strokeWidth="2" />
                      <rect
                        x="194"
                        y="209"
                        width="132"
                        height="26"
                        rx="6"
                        fill="#FFFFFF"
                        stroke="#64B5F6"
                        strokeOpacity="0.9"
                      />
                      <text
                        x="202"
                        y="225"
                        fill="#123B5D"
                        fontSize="10"
                        fontWeight="700"
                        fontFamily="ui-sans-serif, sans-serif"
                      >
                        Nagpur HQ · Operational
                      </text>
                    </g>
                  </svg>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#263746]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#42A5F5] border border-white inline-block shadow-xs" />
                    <span>Operational Headquarters (Nagpur, MH)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-white border-2 border-[#64B5F6] inline-block" />
                    <span>Planned Partner &amp; Operator Expansion</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 12: OUR CORE VALUES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-10">
        <div className="max-w-3xl space-y-2">
          <div className="text-xs font-semibold text-[#64B5F6]">Guiding Standards</div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D]">
            {aboutCms?.coreValuesTitle || 'Our Core Values'}
          </h2>
          <p className="text-sm sm:text-base text-[#263746] leading-relaxed">
            Foundational principles governing our engineering architecture, manufacturing discipline, and agricultural service partnerships.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {coreValues.map((val, idx) => (
            <div
              key={val.title}
              className="rounded-2xl border border-[#DCEAF5] bg-white p-6 space-y-3 transition-colors duration-200 hover:border-[#64B5F6] shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] flex items-center justify-center">
                  {val.icon}
                </div>
                <span className="font-mono text-xs font-bold text-[#64B5F6] tabular-nums">
                  0{idx + 1}
                </span>
              </div>
              <h3 className="font-display text-base font-bold text-[#123B5D]">{val.title}</h3>
              <p className="text-xs sm:text-sm text-[#263746] leading-relaxed">{val.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 12B: COMPANY PHOTOGRAPHS & VIDEO GALLERY (CMS Managed) */}
      {companyMediaGallery.length > 0 && (
        <section className="bg-[#F0F8FF] border-y border-[#DCEAF5]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-8">
            <div className="max-w-3xl space-y-2">
              <div className="text-xs font-semibold text-[#64B5F6] inline-flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5" /> Engineering &amp; Field Showcase
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#123B5D]">
                Facility, Manufacturing &amp; Flight Testing Gallery
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companyMediaGallery.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col shadow-xs"
                >
                  <div className="aspect-[16/10] bg-[#F0F8FF] overflow-hidden">
                    {item.mediaType === 'video' ? (
                      <video
                        src={item.url}
                        controls
                        playsInline
                        preload="metadata"
                        poster={item.thumbnailUrl || undefined}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <SafeEditorialImage
                        src={item.url}
                        alt={item.title}
                        fallbackTitle={item.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-5 space-y-1.5">
                    <h3 className="font-display text-base font-bold text-[#123B5D]">{item.title}</h3>
                    {item.caption && <p className="text-xs text-[#263746] leading-relaxed">{item.caption}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 13: CONTACT & PARTNERSHIPS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 pb-20">
        <div className="rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-8 sm:p-12 lg:p-14 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center shadow-xs">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-semibold text-[#42A5F5]">Contact &amp; Partnerships</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D] text-balance">
              {aboutCms?.ctaHeading || 'LET’S BUILD THE FUTURE TOGETHER'}
            </h2>
            <p className="text-sm sm:text-base text-[#263746] leading-relaxed max-w-2xl">
              {aboutCms?.ctaBody ||
                'We welcome partnerships with farmers, agricultural businesses, engineering institutions, startups, researchers, investors, manufacturers, and technology innovators.'}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-xs text-[#263746]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#64B5F6]" /> Nagpur, Maharashtra, India
              </span>
              <a
                href={`mailto:${company?.email || 'info@nexustekfusion.in'}`}
                className="inline-flex items-center gap-1.5 font-mono hover:text-[#42A5F5]"
              >
                <Mail className="w-3.5 h-3.5 text-[#64B5F6]" />{' '}
                {company?.email || 'info@nexustekfusion.in'}
              </a>
              <a
                href={company?.website || 'https://nexustekfusion.in'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono hover:text-[#42A5F5]"
              >
                <Globe className="w-3.5 h-3.5 text-[#64B5F6]" />{' '}
                {company?.website || 'https://nexustekfusion.in'}
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate(aboutCms?.ctaPrimaryLink || '/contact')}
              className="px-5 py-3.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {aboutCms?.ctaPrimaryLabel || 'Contact Our Team'} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/b2b')}
              className="px-5 py-3.5 bg-white border border-[#90CAF9] text-[#123B5D] hover:bg-[#F0F8FF] text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              Partner With Us <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate(aboutCms?.ctaSecondaryLink || '/krashivantri')}
              className="px-5 py-3.5 border border-[#DCEAF5] bg-white text-[#123B5D] hover:bg-[#F0F8FF] text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {aboutCms?.ctaSecondaryLabel || 'Explore KRASHIVANTRI'} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/register-project')}
              className="px-5 py-3.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] hover:bg-[#E3F2FD] text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Wrench className="w-4 h-4 text-[#42A5F5]" /> Register Your Project
            </button>
          </div>
        </div>
      </section>

      {/* Team Member Full Profile Modal */}
      {selectedProfile && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-[#DCEAF5] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#DCEAF5] pb-4">
              <div className="flex items-center gap-4">
                <PortraitStage member={selectedProfile} size="team" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#64B5F6]">
                    {[selectedProfile.professionalCategory, selectedProfile.department].filter(Boolean).join(' · ') || 'Team Member'}
                  </div>
                  <h3 className="font-display text-2xl font-bold text-[#123B5D]">
                    {selectedProfile.fullName || selectedProfile.name}
                  </h3>
                  <div className="text-sm font-semibold text-[#263746]">{selectedProfile.designation}</div>
                  {selectedProfile.experience && (
                    <div className="text-xs font-mono text-[#263746]/70">{selectedProfile.experience}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                aria-label="Close profile dialog"
                className="p-2 rounded-lg border border-[#DCEAF5] text-[#263746] hover:bg-[#F0F8FF] hover:text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(selectedProfile.detailedBiography || selectedProfile.biography || selectedProfile.shortBiography) && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#263746]/70">Biography</div>
                <p className="text-sm text-[#263746] leading-relaxed whitespace-pre-line">
                  {selectedProfile.detailedBiography || selectedProfile.biography || selectedProfile.shortBiography}
                </p>
              </div>
            )}

            {selectedProfile.qualifications && (
              <div className="space-y-1 border-t border-[#DCEAF5] pt-3">
                <div className="text-xs font-semibold text-[#263746]/70">Educational Qualifications</div>
                <p className="text-sm text-[#123B5D]">{selectedProfile.qualifications}</p>
              </div>
            )}

            {selectedProfile.responsibilities && (
              <div className="space-y-1 border-t border-[#DCEAF5] pt-3">
                <div className="text-xs font-semibold text-[#263746]/70">Responsibilities</div>
                <p className="text-sm text-[#263746] leading-relaxed">{selectedProfile.responsibilities}</p>
              </div>
            )}

            {selectedProfile.skills && (
              <div className="space-y-1 border-t border-[#DCEAF5] pt-3">
                <div className="text-xs font-semibold text-[#263746]/70">Skills &amp; Expertise</div>
                <p className="text-sm text-[#123B5D]">{selectedProfile.skills}</p>
              </div>
            )}

            {selectedProfile.linkedinUrl && (
              <div className="border-t border-[#DCEAF5] pt-3">
                <a
                  href={selectedProfile.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  LinkedIn Profile <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FaqPage: React.FC = () => {
  const { settings } = usePlatform();
  const faqs = settings.faqs || [];

  return (
    <div className="bg-[#FFFFFF]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 space-y-8">
        <div className="space-y-2 border-b border-[#DCEAF5] pb-6">
          <div className="text-xs font-semibold text-[#64B5F6]">Help Center</div>
          <h1 className="font-display text-3xl font-bold text-[#123B5D]">Frequently Asked Questions</h1>
        </div>
        <div className="space-y-4">
          {faqs.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-2 shadow-xs">
              <h3 className="font-display font-semibold text-[#123B5D]">{item.q}</h3>
              <p className="text-sm text-[#263746] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PolicyPage: React.FC<{
  type: 'shipping' | 'returnRefund' | 'privacy' | 'terms';
  title: string;
}> = ({ type, title }) => {
  const { settings } = usePlatform();
  const content = settings.policies?.[type] || '';
  const company = settings.companyInfo;

  return (
    <div className="bg-[#FFFFFF]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 space-y-6">
        <div className="border-b border-[#DCEAF5] pb-6 space-y-1">
          <div className="text-xs font-semibold text-[#64B5F6]">Legal &amp; Compliance</div>
          <h1 className="font-display text-3xl font-bold text-[#123B5D]">{title}</h1>
          <div className="text-xs text-[#263746]/70 font-mono">
            {company?.legalName} · CIN {company?.cin}
          </div>
        </div>
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746] leading-relaxed whitespace-pre-line shadow-xs">
          {content}
        </div>
      </div>
    </div>
  );
};
