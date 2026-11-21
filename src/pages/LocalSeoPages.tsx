import React, { useEffect } from 'react';
import { ArrowRight, CheckCircle2, Cpu, MapPin, Plane, Printer, ShieldCheck, Wrench } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { buildBreadcrumbSchema, buildServiceSchema } from '../lib/seo';

export const NagpurPage: React.FC = () => {
  const { navigate, settings, setDynamicSeo } = usePlatform();
  const company = settings.companyInfo;
  const email = company?.email || 'info@nexustekfusion.in';
  const address =
    company?.address ||
    'H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, Maharashtra, India';

  useEffect(() => {
    setDynamicSeo({
      title: 'Agricultural Drones, 3D Printing & Engineering Services in Nagpur | NexusTekFusion',
      description:
        'Visit NexusTekFusion Private Limited in Ganjipeth, Nagpur for KRASHIVANTRI agricultural spraying drones, drone repair & diagnostics, FDM/SLA 3D printing, and engineering R&D projects.',
      keywords:
        'drone company in Nagpur, agricultural drone Nagpur, 3D printing service Nagpur, drone repair Nagpur, custom engineering projects Nagpur',
      canonicalUrl: '/nagpur',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Nagpur Hub', url: '/nagpur' },
      ],
      schemas: [
        buildServiceSchema({
          name: 'NexusTekFusion Nagpur UAV, 3D Printing & Engineering Operations',
          serviceType: 'Agricultural Drone Manufacturing, 3D Printing & Drone Diagnostics',
          description:
            'Local Nagpur facility providing KRASHIVANTRI agricultural drones, drone repair, rapid 3D prototyping, and hardware components.',
          url: '/nagpur',
          areaServed: ['Nagpur', 'Hingna', 'MIHAN', 'Wardha', 'Bhandara', 'Kamptee', 'Vidarbha'],
        }),
        buildBreadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Nagpur Hub', url: '/nagpur' },
        ]),
      ],
    });
  }, [setDynamicSeo]);

  return (
    <div className="bg-[#FFFFFF] text-[#263746]">
      <section className="bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] border-b border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 space-y-6">
          <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
            REGISTERED HEADQUARTERS &amp; WORKSHOP · NAGPUR, MAHARASHTRA
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight max-w-4xl text-[#123B5D]">
            Agricultural Drone Manufacturing, 3D Printing &amp; Engineering Services in Nagpur
          </h1>
          <p className="text-[#263746] text-base sm:text-lg max-w-3xl leading-relaxed">
            Headquartered at Ganjipeth, Nagpur (440018), NexusTekFusion Private Limited serves progressive farmers,
            FPOs, engineering colleges, researchers, and industrial teams across Nagpur and Central India.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={() => navigate('/krashivantri')}
              className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              Explore KRASHIVANTRI Drones <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/services/3d-printing')}
              className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              3D Printing Quote in Nagpur <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/services/drone-repair')}
              className="px-5 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#64B5F6] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
            >
              Book Drone Repair
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: Plane,
              title: 'KRASHIVANTRI Agricultural UAVs',
              body: 'Sales, FPO fleet demonstrations, and spares for KRASHIVANTRI X and KRASHIVANTRI X PRO spraying drones.',
              link: '/krashivantri',
              cta: 'View KRASHIVANTRI',
            },
            {
              icon: Printer,
              title: 'Nagpur 3D Printing Studio',
              body: 'Upload STL, OBJ, 3MF, STEP, or IGES files for fast FDM & SLA functional prototypes, drone mounts, and enclosures.',
              link: '/services/3d-printing',
              cta: 'Upload CAD Model',
            },
            {
              icon: Wrench,
              title: 'Nagpur Drone Repair Workshop',
              body: 'Bench diagnostics, flight controller PID/IMU calibration, ESC/motor replacement, and field support visits.',
              link: '/services/drone-repair',
              cta: 'Schedule Diagnostics',
            },
            {
              icon: Cpu,
              title: 'Engineering & Robotics R&D',
              body: 'Custom embedded electronics, single & double-layer PCBs, IoT, AI/ML, and academic or industrial prototypes.',
              link: '/register-project',
              cta: 'Register Project',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-xl border border-[#DCEAF5] bg-white p-6 flex flex-col justify-between space-y-5 shadow-sm hover:border-[#90CAF9] transition-colors"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] text-[#64B5F6] flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">{card.title}</h2>
                  <p className="text-sm text-[#263746] leading-relaxed">{card.body}</p>
                </div>
                <button
                  onClick={() => navigate(card.link)}
                  className="text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D] inline-flex items-center gap-1"
                >
                  {card.cta} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 rounded-2xl border border-[#DCEAF5] bg-white p-7 space-y-4 shadow-sm">
            <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase">
              LOCAL ENGINEERING SUPPORT · NAGPUR &amp; VIDARBHA
            </div>
            <h2 className="font-display text-2xl font-bold text-[#123B5D]">
              Why Clients in Nagpur Choose Our Direct Workshop &amp; Dispatch
            </h2>
            <ul className="space-y-2.5 text-sm text-[#263746]">
              {[
                'Direct engineering review for CAD 3D prints, Gerber PCBs, and custom embedded builds without middlemen.',
                'Local workshop drop-off in Ganjipeth plus mobile field diagnostics for agricultural spraying drones across Nagpur district.',
                'Verified GST tax invoices, Razorpay digital settlements, and structured 50% + 50% milestone tracking.',
                'Immediate stock dispatch of brushless UAV motors, FOC ESCs, flat-fan spraying nozzles, and LiPo power hardware.',
              ].map((pt) => (
                <li key={pt} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-[#90CAF9] bg-[#F0F8FF] text-[#263746] p-7 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#64B5F6] text-xs font-mono font-semibold uppercase">
              <MapPin className="w-4 h-4" /> Nagpur Office &amp; Lab
            </div>
            <h3 className="font-display text-xl font-bold text-[#123B5D]">NEXUSTEKFUSION PRIVATE LIMITED</h3>
            <p className="text-sm text-[#263746] leading-relaxed">{address}</p>
            <div className="text-xs font-mono text-[#263746] space-y-1 pt-2 border-t border-[#DCEAF5]">
              <div>CIN: {company?.cin || 'U30305ME2026PTC474052'}</div>
              <div>Email: {email}</div>
              <div>Hours: {company?.businessHours || 'Monday – Saturday, 10:00 AM – 7:00 PM IST'}</div>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => navigate('/contact')}
                className="px-4 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
              >
                Open Contact Desk <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigate('/maharashtra')}
                className="px-4 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
              >
                Maharashtra Coverage
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export const MaharashtraPage: React.FC = () => {
  const { navigate, setDynamicSeo } = usePlatform();

  useEffect(() => {
    setDynamicSeo({
      title: 'Agricultural Drone Manufacturer & Engineering Partner Across Maharashtra | NexusTekFusion',
      description:
        'Serving Nagpur, Vidarbha, Amravati, Wardha, Akola, Nashik, Pune, and pan-Maharashtra with KRASHIVANTRI spraying drones, drone spare parts, 3D printing, and engineering R&D.',
      keywords:
        'agricultural drone Maharashtra, Vidarbha drone spraying, KRASHIVANTRI Maharashtra, drone hardware Maharashtra, 3D printing shipping Maharashtra',
      canonicalUrl: '/maharashtra',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Maharashtra Coverage', url: '/maharashtra' },
      ],
      schemas: [
        buildServiceSchema({
          name: 'Maharashtra Agricultural Drone & Engineering Delivery Network',
          serviceType: 'Agricultural UAV Manufacturing, DaaS Platform & Hardware Dispatch',
          description:
            'Agricultural spraying drones, spare parts, 3D prototyping, and project engineering delivered across Maharashtra from Nagpur headquarters.',
          url: '/maharashtra',
          areaServed: [
            'Nagpur',
            'Amravati',
            'Wardha',
            'Akola',
            'Yavatmal',
            'Chandrapur',
            'Nashik',
            'Pune',
            'Chhatrapati Sambhajinagar',
            'Kolhapur',
            'Maharashtra',
          ],
        }),
        buildBreadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Maharashtra Coverage', url: '/maharashtra' },
        ]),
      ],
    });
  }, [setDynamicSeo]);

  return (
    <div className="bg-[#FFFFFF] text-[#263746]">
      <section className="bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] border-b border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 space-y-6">
          <div className="text-xs font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
            PAN-MAHARASHTRA AGRITECH &amp; ENGINEERING NETWORK
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight max-w-4xl text-[#123B5D]">
            Agricultural Drones &amp; Engineering Manufacturing Across Maharashtra
          </h1>
          <p className="text-[#263746] text-base sm:text-lg max-w-3xl leading-relaxed">
            From our Nagpur manufacturing and R&amp;D headquarters, NexusTekFusion equips farmers, FPOs,
            certified drone pilots, universities, and hardware startups throughout Vidarbha, Marathwada,
            Western Maharashtra, and Konkan.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={() => navigate('/krashivantri/enquiry')}
              className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              Request Fleet Briefing <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/store')}
              className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              Visit Engineering Store <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: 'Vidarbha & Central Maharashtra',
              districts: 'Nagpur · Wardha · Amravati · Yavatmal · Akola · Bhandara · Chandrapur',
              focus:
                'Direct field support, agricultural spraying missions via KRASHIVANTRI Farmer & Pilot Portals, and same/next-day workshop turnaround from Nagpur.',
            },
            {
              title: 'Pune, Nashik & Western Maharashtra',
              districts: 'Pune · Nashik · Ahmednagar · Satara · Kolhapur · Sangli',
              focus:
                'High-density horticulture & sugarcane spraying UAV procurement, PA12-CF rapid 3D prototypes, single/double-layer PCBs, and R&D components.',
            },
            {
              title: 'Marathwada & Institutional Corridor',
              districts: 'Chhatrapati Sambhajinagar · Jalna · Latur · Nanded · Parbhani',
              focus:
                'FPO drone fleet onboarding, B2B institutional robotics/UAV labs, and milestone-backed engineering project execution.',
            },
          ].map((region) => (
            <div key={region.title} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
              <div className="text-xs font-mono font-semibold text-[#64B5F6]">{region.districts}</div>
              <h2 className="font-display text-xl font-bold text-[#123B5D]">{region.title}</h2>
              <p className="text-sm text-[#263746] leading-relaxed">{region.focus}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#DCEAF5] bg-[#F0F8FF] p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#64B5F6] uppercase">
              <ShieldCheck className="w-4 h-4" /> Institutional, FPO &amp; Commercial Procurement
            </div>
            <h3 className="font-display text-2xl font-bold text-[#123B5D]">
              Deploy KRASHIVANTRI Drones or Source Hardware Anywhere in Maharashtra
            </h3>
            <p className="text-sm text-[#263746]">
              Compare KRASHIVANTRI X and KRASHIVANTRI X PRO, submit bulk B2B institutional quotes, or register an academic/industrial prototype build online.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              onClick={() => navigate('/krashivantri/compare')}
              className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Compare Drones
            </button>
            <button
              onClick={() => navigate('/b2b')}
              className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
            >
              B2B &amp; FPO Portal
            </button>
            <button
              onClick={() => navigate('/nagpur')}
              className="px-5 py-2.5 border border-[#DCEAF5] bg-white hover:border-[#64B5F6] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
            >
              Nagpur Headquarters
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
