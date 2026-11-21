import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileDown,
  Heart,
  MapPin,
  MessageSquarePlus,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  Wrench,
  X,
  ZoomIn,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { downloadDroneBrochurePdf } from '../lib/pdf';
import { Product } from '../types/platform';

export const KRASHIVANTRI_SPEC_KEYS = [
  'Payload Capacity',
  'Flight Time',
  'Tank Capacity',
  'Spraying Width',
  'Battery Specifications',
  'Navigation Capabilities',
] as const;

let inMemoryRecentlyViewedDrones: Array<{
  id: number;
  slug: string;
  name: string;
  sku: string;
  imageUrl: string;
  priceInr: number;
  discountPriceInr: number | null;
  productType?: string;
}> = [];

const DEFAULT_FALLBACK_PRODUCT: Record<'krashivantri-x' | 'krashivantri-x-pro', {
  name: string;
  tagline: string;
  sku: string;
  priceInr: number;
  imageUrl: string;
  galleryUrls: string[];
  shortDescription: string;
  description: string;
  features: string[];
  applicationsList: Array<{ title: string; detail: string }>;
  packageContents: string[];
  warrantyInfo: string;
  deliveryInfo: string;
  faqs: Array<{ q: string; a: string }>;
}> = {
  'krashivantri-x': {
    name: 'KRASHIVANTRI X',
    tagline: 'Smart Agriculture. Precision Spraying.',
    sku: 'NTF-KRV-X',
    priceInr: 450000,
    imageUrl: '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
    galleryUrls: [
      '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
      '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
      '/src/assets/images/service_agri_drone_1794981061744.jpg',
      '/src/assets/images/service_drone_repair_1794987205295.jpg',
    ],
    shortDescription: 'Smart Agriculture. Precision Spraying.',
    description:
      'KRASHIVANTRI X is an industrial-grade precision agricultural spraying UAV engineered by NexusTekFusion Private Limited in Nagpur for dependable field performance, uniform droplet coverage, and seamless integration with the KRASHIVANTRI Farmer, Pilot & Buyer digital ecosystem.',
    features: [
      'Rugged field airframe built for Indian crop protection operations',
      'Integrated flow-control and precision spraying nozzle manifold',
      'Seamless telemetry readiness for KRASHIVANTRI Pilot & Farmer Portals',
      'Modular arms & field-serviceable assemblies for rapid turnaround',
      'Direct service, training, and spare parts pipeline from Nagpur lab',
    ],
    applicationsList: [
      {
        title: 'Precision Agricultural Crop Spraying',
        detail: 'Targeted foliar spray application across row crops, horticulture, cotton, soybean, paddy, and orchards with reduced chemical drift.',
      },
      {
        title: 'FPO Fleet Operations',
        detail: 'Built for Farmer Producer Organizations operating shared village-level spraying services with standardized pilot workflows.',
      },
      {
        title: 'Institutional Agritech R&D',
        detail: 'Configured for agricultural universities, KVK centres, and crop-science institutes evaluating UAV spraying trials.',
      },
    ],
    packageContents: [
      'KRASHIVANTRI X Agricultural Drone Airframe Assembly',
      'Integrated Precision Spraying Tank & Nozzle Kit',
      'Ground Control Station & Telemetry Link',
      'Smart Battery Charger & Field Tool Kit',
      'Operator Manual, Safety Checklist & DGCA Compliance Guide',
    ],
    warrantyInfo:
      '1-Year Manufacturer Structural & Electronics Warranty backed by NexusTekFusion Nagpur Service Centre with nationwide spares dispatch.',
    deliveryInfo:
      'Pan-India insured freight dispatch in custom protective flight case. On-site commissioning, flight handover briefing, and pilot orientation scheduled upon delivery.',
    faqs: [
      {
        q: 'When will verified flight and payload numbers be shared?',
        a: 'Official verified system specification sheets are shared during formal technical briefing and updated live in this specification table by authorized NexusTekFusion administrators.',
      },
      {
        q: 'Does purchase include operator training and onboarding?',
        a: 'Yes. Every KRASHIVANTRI X handover includes structured ground-control briefing, pre-flight inspection training, and KRASHIVANTRI Pilot Portal onboarding.',
      },
      {
        q: 'Is GST tax invoicing provided for institutional and FPO buyers?',
        a: 'Yes. Verified purchases unlock a downloadable Tax Invoice with HSN 8806, company CIN, and applicable Intra-State (CGST+SGST) or Inter-State (IGST) breakup.',
      },
    ],
  },
  'krashivantri-x-pro': {
    name: 'KRASHIVANTRI X PRO',
    tagline: 'Advanced Intelligence. Precision Agriculture.',
    sku: 'NTF-KRV-XPRO',
    priceInr: 560000,
    imageUrl: '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
    galleryUrls: [
      '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
      '/src/assets/images/hero_agri_drone_mfg_1795013369288.jpg',
      '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
      '/src/assets/images/service_drone_repair_1794987205295.jpg',
    ],
    shortDescription: 'Advanced Intelligence. Precision Agriculture.',
    description:
      'KRASHIVANTRI X PRO is NexusTekFusion Private Limited’s flagship high-intelligence agricultural UAV designed for commercial spraying contractors, multi-acreage agribusinesses, and university agritech research fleets requiring advanced telemetry and high-duty endurance.',
    features: [
      'Advanced mission intelligence & automated field-boundary execution readiness',
      'High-durability composite airframe engineered for intensive daily commercial sorties',
      'Dual-telemetry health diagnostics synced with KRASHIVANTRI Operations Desk',
      'Enterprise fleet readiness for multi-operator contractors & research stations',
      'Priority spares & technical engineering support from Nagpur hub',
    ],
    applicationsList: [
      {
        title: 'Commercial Agricultural Spraying Contractors',
        detail: 'Engineered for high-utilization service providers executing scheduled multi-village spraying contracts across peak crop seasons.',
      },
      {
        title: 'University Research & Development',
        detail: 'Supports multi-sensor agritech experiments, variable-rate application studies, and telemetry logging for academic R&D.',
      },
      {
        title: 'Large-Acreage Precision Farming',
        detail: 'Optimized for commercial estates, sugarcane cooperatives, and large consolidated farms needing repeatable flight missions.',
      },
    ],
    packageContents: [
      'KRASHIVANTRI X PRO Enterprise UAV Platform',
      'High-Precision Commercial Spraying System & Flow Manifold',
      'Long-Range Ground Control Station & Telemetry Console',
      'Heavy-Duty Charging Station & Field Maintenance Kit',
      'Enterprise Commissioning Dossier, Logbooks & Pilot Checklist',
    ],
    warrantyInfo:
      '1-Year Enterprise Manufacturer Warranty with priority diagnostics, loaner spares evaluation, and Nagpur Service Hub priority SLA.',
    deliveryInfo:
      'Dedicated insured logistics delivery across India in shock-proof transport crate with scheduled technical briefing, field calibration, and fleet onboarding.',
    faqs: [
      {
        q: 'How does KRASHIVANTRI X PRO differ from KRASHIVANTRI X?',
        a: 'KRASHIVANTRI X PRO targets commercial high-utilization spraying fleets, universities, and large-acreage precision operators with upgraded mission intelligence and enterprise support.',
      },
      {
        q: 'Can universities or FPOs request custom quotations for multiple units?',
        a: 'Yes. Submit the structured enquiry form below with your fleet quantity and state/district details to receive an official institutional proposal with reference ID.',
      },
      {
        q: 'Are spare parts and maintenance services available after purchase?',
        a: 'Yes. All motors, propellers, nozzles, pumps, and avionics modules are stocked and serviced by NexusTekFusion Private Limited.',
      },
    ],
  },
};

export interface DroneEnquiryFormProps {
  defaultProduct?: 'KRASHIVANTRI X' | 'KRASHIVANTRI X PRO';
  heading?: string;
  subheading?: string;
}

export const DroneEnquiryForm: React.FC<DroneEnquiryFormProps> = ({
  defaultProduct = 'KRASHIVANTRI X',
  heading = 'Request Official Briefing, Demo or Fleet Quote',
  subheading = 'Submit your operational requirements to receive verified specifications, official quotation, and commissioning timelines from NexusTekFusion Private Limited.',
}) => {
  const { apiFetch, dbUser, isSignedIn, navigate, notify } = usePlatform();
  const [form, setForm] = useState({
    fullName: dbUser?.fullName || '',
    mobile: dbUser?.mobile || '',
    email: dbUser?.email || '',
    state: '',
    district: '',
    organizationOrFarmName: dbUser?.companyOrCollege || '',
    interestedProduct: defaultProduct,
    quantity: 1,
    intendedApplication: 'Precision agricultural crop spraying',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      interestedProduct: defaultProduct,
    }));
  }, [defaultProduct]);

  useEffect(() => {
    if (dbUser) {
      setForm((prev) => ({
        ...prev,
        fullName: prev.fullName || dbUser.fullName || '',
        mobile: prev.mobile || dbUser.mobile || '',
        email: prev.email || dbUser.email || '',
        organizationOrFarmName: prev.organizationOrFarmName || dbUser.companyOrCollege || '',
      }));
    }
  }, [dbUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; referenceNumber: string }>('/api/product-enquiries', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSubmittedRef(res.referenceNumber);
      notify(`Drone enquiry ${res.referenceNumber} submitted successfully.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to submit enquiry.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-6 shadow-xs">
      <div className="space-y-1.5 border-b border-[#DCEAF5] pb-4">
        <div className="text-xs font-semibold text-[#64B5F6]">Official Product Enquiry Desk</div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D] text-balance">{heading}</h2>
        <p className="text-sm text-[#263746] max-w-2xl">{subheading}</p>
      </div>

      {submittedRef ? (
        <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-[#42A5F5] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-display text-xl font-bold text-[#123B5D]">
                Enquiry Logged — <span className="font-mono">{submittedRef}</span>
              </div>
              <p className="text-sm text-[#263746]">
                Your enquiry for <span className="font-semibold">{form.interestedProduct}</span> (Qty{' '}
                <span className="font-mono">{form.quantity}</span>) in {form.district}, {form.state} has been sent to our Nagpur UAV engineering &amp; sales team.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {isSignedIn && (
              <button
                type="button"
                onClick={() => navigate('/my-account/enquiries')}
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                View in My Account Enquiries
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSubmittedRef('');
                setForm((prev) => ({ ...prev, message: '', quantity: 1 }));
              }}
              className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
            >
              Submit Another Enquiry
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Full Name *</label>
              <input
                required
                placeholder="Full Name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Mobile / WhatsApp Number *</label>
              <input
                required
                placeholder="+91 XXXXX XXXXX"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Email Address *</label>
              <input
                required
                type="email"
                placeholder="you@organization.in"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">State *</label>
              <input
                required
                placeholder="e.g. Maharashtra"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">District *</label>
              <input
                required
                placeholder="e.g. Nagpur"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Organization / Farm / University Name</label>
              <input
                placeholder="FPO, Agribusiness, or Farm Name"
                value={form.organizationOrFarmName}
                onChange={(e) => setForm({ ...form, organizationOrFarmName: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Interested Product *</label>
              <select
                value={form.interestedProduct}
                onChange={(e) => setForm({ ...form, interestedProduct: e.target.value as any })}
                className="w-full rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 bg-white text-[#123B5D] font-semibold focus:outline-none focus:border-[#64B5F6]"
              >
                <option value="KRASHIVANTRI X">KRASHIVANTRI X (₹4,50,000)</option>
                <option value="KRASHIVANTRI X PRO">KRASHIVANTRI X PRO (₹5,60,000)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Unit Quantity *</label>
              <input
                required
                type="number"
                min={1}
                max={500}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 font-mono tabular-nums focus:outline-none focus:border-[#64B5F6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#123B5D]">Intended Application *</label>
              <select
                value={form.intendedApplication}
                onChange={(e) => setForm({ ...form, intendedApplication: e.target.value })}
                className="w-full rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              >
                <option value="Precision agricultural crop spraying">Precision agricultural crop spraying</option>
                <option value="FPO fleet operations">FPO fleet operations</option>
                <option value="Commercial agricultural spraying contractor">Commercial agricultural spraying contractor</option>
                <option value="Institutional / University agritech R&D">Institutional / University agritech R&amp;D</option>
                <option value="Large-acreage precision farming">Large-acreage precision farming</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#123B5D]">Operational Notes / Custom Requirements</label>
            <textarea
              rows={3}
              placeholder="Mention target crops, total acreage, preferred demonstration timeline, or dealer/institutional tender questions..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 focus:outline-none focus:border-[#64B5F6]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 text-xs text-[#263746]">
              <ShieldCheck className="w-4 h-4 text-[#64B5F6] shrink-0" />
              <span>Official response with briefing dossier &amp; GST quotation from Nagpur headquarters.</span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
            >
              <Wrench className="w-4 h-4" />
              {submitting ? 'Submitting Enquiry...' : 'Submit Drone Enquiry'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export const KrashivantriProductPage: React.FC<{ slug: 'krashivantri-x' | 'krashivantri-x-pro' }> = ({ slug }) => {
  const { apiFetch, addToCart, navigate, isSignedIn, notify, settings } = usePlatform();
  const fallback = DEFAULT_FALLBACK_PRODUCT[slug];
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<
    Array<{ id: number; authorName: string; rating: number; comment: string; verifiedPurchase: boolean; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(fallback.imageUrl);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // PIN code checker
  const [pinCode, setPinCode] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinResult, setPinResult] = useState<{
    serviceable: boolean;
    pinCode: string;
    estimatedDays: string;
    shippingFeeInr: number;
    qualifiesFreeShipping: boolean;
  } | null>(null);
  const [pinError, setPinError] = useState('');

  const loadProduct = async () => {
    setLoading(true);
    setPinResult(null);
    setPinError('');
    try {
      const res = await apiFetch<{ product: Product; reviews: any[] }>(`/api/products/${slug}`);
      setProduct(res.product);
      setReviews(res.reviews || []);
      setActiveImage(res.product.imageUrl || fallback.imageUrl);

      const snap = {
        id: res.product.id,
        slug: res.product.slug,
        name: res.product.name,
        sku: res.product.sku,
        imageUrl: res.product.imageUrl || fallback.imageUrl,
        priceInr: res.product.priceInr || fallback.priceInr,
        discountPriceInr: res.product.discountPriceInr,
        productType: res.product.productType,
      };
      inMemoryRecentlyViewedDrones = [
        snap,
        ...inMemoryRecentlyViewedDrones.filter((x) => x.slug !== slug),
      ].slice(0, 10);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
    if (window.location.hash) {
      setTimeout(() => {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      }, 180);
    }
  }, [slug]);

  const effectiveProduct: Product = useMemo(() => {
    if (product) return product;
    return {
      id: slug === 'krashivantri-x-pro' ? 2 : 1,
      categoryId: null,
      sku: fallback.sku,
      hsnCode: '8806',
      name: fallback.name,
      slug,
      brand: 'KRASHIVANTRI',
      productType: 'simple',
      storeScope: 'general',
      shortDescription: fallback.tagline,
      description: fallback.description,
      technicalSpecs: Object.fromEntries(KRASHIVANTRI_SPEC_KEYS.map((k) => [k, 'Official Specification on Briefing'])),
      features: fallback.features,
      priceInr: fallback.priceInr,
      discountPriceInr: null,
      gstPercent: 18,
      stockQty: 5,
      dimensions: '',
      weightGrams: 0,
      material: 'Aerospace Carbon Composite',
      availableColors: [],
      availableVariants: [],
      productionTimeDays: 7,
      warrantyInfo: fallback.warrantyInfo,
      deliveryInfo: fallback.deliveryInfo,
      imageUrl: fallback.imageUrl,
      galleryUrls: fallback.galleryUrls,
      datasheetUrl: '',
      brochureUrl: '',
      packageContents: fallback.packageContents,
      applications: fallback.applicationsList.map((a) => a.title).join('; '),
      productFaqs: fallback.faqs,
      isFeatured: true,
      isPublished: true,
    };
  }, [product, slug, fallback]);

  const galleryImages = useMemo(() => {
    const raw = [
      effectiveProduct.imageUrl || fallback.imageUrl,
      ...(effectiveProduct.galleryUrls || []),
      ...fallback.galleryUrls,
    ].filter(Boolean);
    return Array.from(new Set(raw)).slice(0, 6);
  }, [effectiveProduct, fallback]);

  const activePrice =
    effectiveProduct.discountPriceInr !== null &&
    effectiveProduct.discountPriceInr < effectiveProduct.priceInr &&
    effectiveProduct.priceInr > 0
      ? effectiveProduct.discountPriceInr
      : effectiveProduct.priceInr || fallback.priceInr;

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : effectiveProduct.ratingAvg
      ? effectiveProduct.ratingAvg.toFixed(1)
      : null;

  const featuresList =
    effectiveProduct.features && effectiveProduct.features.length > 0
      ? effectiveProduct.features
      : fallback.features;

  const packageList =
    effectiveProduct.packageContents && effectiveProduct.packageContents.length > 0
      ? effectiveProduct.packageContents
      : fallback.packageContents;

  const faqList =
    effectiveProduct.productFaqs && effectiveProduct.productFaqs.length > 0
      ? effectiveProduct.productFaqs
      : fallback.faqs;

  const handleCheckPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinResult(null);
    setPinLoading(true);
    try {
      const res = await apiFetch<typeof pinResult>('/api/shipping/check-pin', {
        method: 'POST',
        body: JSON.stringify({ pinCode: pinCode.trim(), subtotalInr: activePrice * qty }),
      });
      setPinResult(res);
    } catch (err: any) {
      setPinError(err?.message || 'Enter a valid 6-digit Indian PIN code.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleDownloadBrochure = () => {
    if (effectiveProduct.brochureUrl) {
      const a = document.createElement('a');
      a.href = effectiveProduct.brochureUrl;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.click();
      return;
    }
    downloadDroneBrochurePdf({
      name: effectiveProduct.name,
      sku: effectiveProduct.sku,
      hsnCode: effectiveProduct.hsnCode || '8806',
      priceInr: activePrice,
      shortDescription: fallback.tagline,
      description: effectiveProduct.description || fallback.description,
      technicalSpecs: effectiveProduct.technicalSpecs,
      features: featuresList,
      applications: effectiveProduct.applications || fallback.applicationsList.map((a) => a.title).join(' · '),
      packageContents: packageList,
      warrantyInfo: effectiveProduct.warrantyInfo || fallback.warrantyInfo,
      deliveryInfo: effectiveProduct.deliveryInfo || fallback.deliveryInfo,
    });
    notify(`Downloaded ${effectiveProduct.name} official brochure PDF.`, 'success');
  };

  const handleWishlist = async () => {
    if (!isSignedIn) {
      notify('Please sign in to save this drone to your wishlist.', 'info');
      return;
    }
    try {
      const res = await apiFetch<{ wishlisted: boolean }>('/api/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId: effectiveProduct.id }),
      });
      notify(res.wishlisted ? 'Saved to wishlist.' : 'Removed from wishlist.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Could not update wishlist.', 'error');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) return;
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: effectiveProduct.id,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      setReviewComment('');
      notify('Verified-purchase review published.', 'success');
      loadProduct();
    } catch (err: any) {
      notify(err?.message || 'Verified purchase required to post a review.', 'error');
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-[#FFFFFF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-14">
        {/* Breadcrumb */}
        <nav className="text-xs text-[#263746]/70 flex flex-wrap items-center gap-2">
          <button onClick={() => navigate('/')} className="hover:text-[#42A5F5]">Home</button>
          <span aria-hidden="true">/</span>
          <button onClick={() => navigate('/krashivantri')} className="hover:text-[#42A5F5]">KRASHIVANTRI</button>
          <span aria-hidden="true">/</span>
          <span className="text-[#123B5D] font-semibold">{effectiveProduct.name}</span>
          <span className="ml-auto flex items-center gap-4">
            <button
              onClick={() => navigate('/krashivantri/compare')}
              className="text-[#42A5F5] font-semibold hover:text-[#123B5D] hover:underline whitespace-nowrap"
            >
              Compare X vs X PRO
            </button>
            <button
              onClick={() => navigate(slug === 'krashivantri-x' ? '/krashivantri-x-pro' : '/krashivantri-x')}
              className="text-[#123B5D] font-semibold hover:text-[#42A5F5] hover:underline whitespace-nowrap"
            >
              Switch to {slug === 'krashivantri-x' ? 'KRASHIVANTRI X PRO' : 'KRASHIVANTRI X'}
            </button>
          </span>
        </nav>

        {/* Primary Contiguous Hero Product Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sticky Multi-Image Gallery */}
          <div className="lg:col-span-6 lg:sticky lg:top-24 space-y-4">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-[#DCEAF5] bg-white shadow-xs">
              <img
                src={activeImage || fallback.imageUrl}
                alt={`${effectiveProduct.name} — ${fallback.tagline}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-[#FFFFFF]/95 hover:bg-[#F0F8FF] text-[#123B5D] border border-[#90CAF9] text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5 text-[#42A5F5]" /> Zoom Image
              </button>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {galleryImages.map((imgUrl, idx) => (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => setActiveImage(imgUrl)}
                  className={`aspect-[4/3] rounded-xl overflow-hidden border-2 bg-white transition-colors ${
                    (activeImage || fallback.imageUrl) === imgUrl
                      ? 'border-[#64B5F6]'
                      : 'border-[#DCEAF5] hover:border-[#90CAF9]'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={`${effectiveProduct.name} gallery view ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Right Contiguous Product Buy & Briefing Module */}
          <div className="lg:col-span-6 rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="space-y-2 border-b border-[#DCEAF5] pb-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#263746]/70">
                <span className="font-semibold text-[#64B5F6]">KRASHIVANTRI Agricultural UAV</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">SKU: {effectiveProduct.sku}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">HSN: {effectiveProduct.hsnCode || '8806'}</span>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#123B5D] tracking-tight text-balance">
                {effectiveProduct.name}
              </h1>
              <p className="text-base font-medium text-[#42A5F5]">{fallback.tagline}</p>

              <div className="flex flex-wrap items-center gap-3 text-xs pt-1 text-[#263746]">
                {avgRating ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                    <Star className="w-3.5 h-3.5 fill-amber-500" />
                    <span className="tabular-nums">{avgRating}</span>
                    <span className="text-[#263746]/70 font-normal">({reviews.length} customer reviews)</span>
                  </span>
                ) : (
                  <span>Awaiting initial field reviews</span>
                )}
                <span aria-hidden="true">·</span>
                <span className={effectiveProduct.stockQty > 0 ? 'text-[#42A5F5] font-semibold' : 'text-red-700 font-semibold'}>
                  {effectiveProduct.stockQty > 0
                    ? `In Stock (${effectiveProduct.stockQty} units ready)`
                    : 'Built to Order — Contact Desk'}
                </span>
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-1">
              <div className="text-xs text-[#263746]/70">Official Selling Price (Excl. GST 18%)</div>
              <div className="flex items-baseline gap-3 font-mono tabular-nums">
                <span className="text-3xl font-bold text-[#123B5D]">
                  ₹{activePrice.toLocaleString('en-IN')}
                </span>
                {effectiveProduct.discountPriceInr !== null &&
                  effectiveProduct.discountPriceInr < effectiveProduct.priceInr && (
                    <span className="text-sm text-slate-400 line-through">
                      ₹{effectiveProduct.priceInr.toLocaleString('en-IN')}
                    </span>
                  )}
              </div>
              <div className="text-xs text-[#263746]/70">
                GST ({effectiveProduct.gstPercent ?? 18}%) calculated transparently at checkout · Official Tax Invoice issued on payment.
              </div>
            </div>

            {/* Product Overview */}
            <p className="text-sm text-[#263746] leading-relaxed">
              {effectiveProduct.description || fallback.description}
            </p>

            {/* Quick Spec Highlight Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {KRASHIVANTRI_SPEC_KEYS.slice(0, 3).map((k) => (
                <div key={k} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-3 space-y-0.5">
                  <div className="text-[#263746]/70">{k}</div>
                  <div className="font-semibold text-[#123B5D] truncate">
                    {effectiveProduct.technicalSpecs?.[k] || 'Official Specification on Briefing'}
                  </div>
                </div>
              ))}
            </div>

            {/* Quantity & Primary 5 Required Action Buttons */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3 text-xs">
                <label className="font-semibold text-[#123B5D]">Order Quantity:</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, effectiveProduct.stockQty || 20)}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] px-3 py-1.5 font-mono tabular-nums text-sm focus:outline-none focus:border-[#64B5F6]"
                />
                <button
                  type="button"
                  onClick={handleWishlist}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-[#263746] hover:text-[#42A5F5]"
                >
                  <Heart className="w-3.5 h-3.5" /> Save to Wishlist
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={loading || effectiveProduct.stockQty <= 0}
                  onClick={() => {
                    addToCart(effectiveProduct, qty);
                    navigate('/checkout');
                  }}
                  className="py-3 px-4 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-40 whitespace-nowrap shrink-0 transition-colors"
                >
                  Buy Now <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={loading || effectiveProduct.stockQty <= 0}
                  onClick={() => addToCart(effectiveProduct, qty)}
                  className="py-3 px-4 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-40 whitespace-nowrap shrink-0 transition-colors"
                >
                  <ShoppingBag className="w-4 h-4 text-[#42A5F5]" /> Add to Cart
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => scrollTo('drone-product-enquiry')}
                  className="py-2.5 px-3 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] hover:bg-[#E3F2FD] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[#42A5F5]" /> Enquire Now
                </button>

                <button
                  type="button"
                  onClick={() => scrollTo('key-specifications')}
                  className="py-2.5 px-3 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  View Specifications
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBrochure}
                  className="py-2.5 px-3 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5 text-[#42A5F5]" /> Download Brochure
                </button>
              </div>
            </div>

            {/* PIN Delivery Check */}
            <div className="border-t border-[#DCEAF5] pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-[#123B5D] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#64B5F6]" /> Check Freight &amp; Delivery Serviceability
              </div>
              <form onSubmit={handleCheckPin} className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit PIN code"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="flex-1 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#64B5F6]"
                />
                <button
                  type="submit"
                  disabled={pinLoading}
                  className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                >
                  {pinLoading ? 'Checking...' : 'Check PIN'}
                </button>
              </form>
              {pinError && <div className="text-xs text-red-700">{pinError}</div>}
              {pinResult && (
                <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3 text-xs text-[#123B5D]">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#42A5F5]" />
                    Serviceable at {pinResult.pinCode} · Dispatch ETA {pinResult.estimatedDays}
                  </div>
                  <div className="text-[#263746] mt-0.5">
                    {pinResult.qualifiesFreeShipping
                      ? 'Qualifies for FREE standard freight coverage.'
                      : `Logistics handling fee ₹${pinResult.shippingFeeInr.toLocaleString('en-IN')}.`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Key System Specifications & Technical Features */}
        <section id="key-specifications" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-4">
              <div>
                <div className="text-xs font-semibold text-[#64B5F6]">Official Specification Schedule</div>
                <h2 className="font-display text-2xl font-bold text-[#123B5D]">Key System Specifications</h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/krashivantri/compare')}
                className="text-xs font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline whitespace-nowrap"
              >
                Compare with {slug === 'krashivantri-x' ? 'X PRO' : 'KRASHIVANTRI X'} →
              </button>
            </div>

            <div className="divide-y divide-[#DCEAF5] text-sm">
              {KRASHIVANTRI_SPEC_KEYS.map((key, idx) => {
                const val = effectiveProduct.technicalSpecs?.[key] || 'Official Specification on Briefing';
                return (
                  <div key={key} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-semibold text-[#123B5D]">
                      {idx + 1}. {key}
                    </span>
                    <span className="font-mono text-xs sm:text-sm text-[#263746] sm:text-right">{val}</span>
                  </div>
                );
              })}
              <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-semibold text-[#123B5D]">HSN Classification</span>
                <span className="font-mono text-xs sm:text-sm text-[#263746] sm:text-right">
                  {effectiveProduct.hsnCode || '8806'}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-5 shadow-xs">
            <div className="border-b border-[#DCEAF5] pb-4">
              <div className="text-xs font-semibold text-[#64B5F6]">
                {slug === 'krashivantri-x-pro' ? 'Advanced Intelligence' : 'Engineering Architecture'}
              </div>
              <h2 className="font-display text-2xl font-bold text-[#123B5D]">
                {slug === 'krashivantri-x-pro' ? 'Advanced Features' : 'Technical Features'}
              </h2>
            </div>
            <ul className="space-y-3 text-sm text-[#263746]">
              {featuresList.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Applications Section */}
        <section className="space-y-6">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#64B5F6]">Deployment Domains</div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              Applications for {effectiveProduct.name}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {fallback.applicationsList.map((app, i) => (
              <div key={i} className="rounded-2xl border border-[#DCEAF5] bg-white p-6 space-y-2 shadow-xs">
                <div className="text-xs font-mono text-[#42A5F5] font-semibold">0{i + 1}.</div>
                <h3 className="font-display text-lg font-bold text-[#123B5D]">{app.title}</h3>
                <p className="text-sm text-[#263746] leading-relaxed">{app.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Package Contents, Warranty & Delivery Information */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-xs">
            <h2 className="font-display text-xl font-bold text-[#123B5D] flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-[#64B5F6]" /> What&apos;s Included in the Package
            </h2>
            <ul className="space-y-2 text-sm text-[#263746]">
              {packageList.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-xs">
            <h2 className="font-display text-xl font-bold text-[#123B5D] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#64B5F6]" /> Warranty &amp; Service Information
            </h2>
            <p className="text-sm text-[#263746] leading-relaxed">
              {effectiveProduct.warrantyInfo || fallback.warrantyInfo}
            </p>
            <p className="text-xs text-[#263746]/70">
              Authorized Nagpur Maintenance Hub: {settings.companyInfo?.address || 'Nagpur, Maharashtra, India'}.
            </p>
          </div>

          <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-xs">
            <h2 className="font-display text-xl font-bold text-[#123B5D] flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#64B5F6]" /> Delivery &amp; Installation
            </h2>
            <p className="text-sm text-[#263746] leading-relaxed">
              {effectiveProduct.deliveryInfo || fallback.deliveryInfo}
            </p>
            <p className="text-xs text-[#263746]/70">
              Dedicated commissioning schedule coordinated after Razorpay payment verification.
            </p>
          </div>
        </section>

        {/* FAQs & Customer Reviews */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-4 shadow-xs">
            <h2 className="font-display text-2xl font-bold text-[#123B5D]">Frequently Asked Questions</h2>
            <div className="divide-y divide-[#DCEAF5]">
              {faqList.map((faq, idx) => (
                <div key={idx} className="py-3.5">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(openFaqIdx === idx ? null : idx)}
                    className="w-full flex items-center justify-between text-left gap-4"
                  >
                    <span className="font-semibold text-sm text-[#123B5D]">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#64B5F6] shrink-0 transition-transform ${
                        openFaqIdx === idx ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaqIdx === idx && (
                    <p className="text-sm text-[#263746] mt-2 leading-relaxed">{faq.a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-[#123B5D]">Customer Reviews &amp; Ratings</h2>
              {avgRating && (
                <span className="text-sm font-mono font-bold text-amber-600 tabular-nums">
                  {avgRating} / 5 ({reviews.length})
                </span>
              )}
            </div>

            {reviews.length === 0 ? (
              <p className="text-sm text-[#263746]/70">
                No verified customer reviews published yet for {effectiveProduct.name}. Verified buyers can submit a review below.
              </p>
            ) : (
              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-[#DCEAF5] pb-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#123B5D]">
                        {r.authorName} {r.verifiedPurchase ? '· Verified Buyer' : ''}
                      </span>
                      <span className="font-mono text-amber-600 font-semibold">{r.rating}/5 ★</span>
                    </div>
                    <p className="text-sm text-[#263746]">{r.comment}</p>
                  </div>
                ))}
              </div>
            )}

            {isSignedIn ? (
              <form onSubmit={handleReviewSubmit} className="border-t border-[#DCEAF5] pt-4 space-y-3">
                <div className="text-xs font-semibold text-[#123B5D]">Post Verified Buyer Review</div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={reviewRating}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    className="rounded-lg border border-[#DCEAF5] px-3 py-2 text-xs bg-white text-[#123B5D] focus:outline-none focus:border-[#64B5F6]"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>{n} Stars</option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Share your field deployment feedback..."
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="flex-1 min-w-[200px] rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 text-xs focus:outline-none focus:border-[#64B5F6]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    Submit Review
                  </button>
                </div>
              </form>
            ) : (
              <div className="border-t border-[#DCEAF5] pt-3 text-xs text-[#263746]/70">
                Sign in with your buyer account to submit a verified-purchase review.
              </div>
            )}
          </div>
        </section>

        {/* Structured Drone Product Enquiry Anchor */}
        <section id="drone-product-enquiry">
          <DroneEnquiryForm
            defaultProduct={slug === 'krashivantri-x-pro' ? 'KRASHIVANTRI X PRO' : 'KRASHIVANTRI X'}
            heading={`Enquire About ${effectiveProduct.name}`}
          />
        </section>
      </div>

      {/* Lightbox Zoom Modal */}
      {zoomOpen && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/80 backdrop-blur-xs flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Close zoom lightbox"
            className="absolute top-5 right-5 p-2 rounded-lg bg-white border border-[#DCEAF5] text-[#123B5D] hover:bg-[#F0F8FF]"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={activeImage || fallback.imageUrl}
            alt={effectiveProduct.name}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[88vh] rounded-xl object-contain bg-white border border-[#DCEAF5]"
          />
        </div>
      )}
    </div>
  );
};

export const KrashivantriComparePage: React.FC = () => {
  const { apiFetch, addToCart, navigate } = usePlatform();
  const [prodX, setProdX] = useState<Product | null>(null);
  const [prodXPro, setProdXPro] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ product: Product }>('/api/products/krashivantri-x').catch(() => null),
      apiFetch<{ product: Product }>('/api/products/krashivantri-x-pro').catch(() => null),
    ]).then(([r1, r2]) => {
      if (active) {
        setProdX(r1?.product || null);
        setProdXPro(r2?.product || null);
      }
    });
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const formatCompareSpec = (prod: Product | null, key: string): string => {
    const raw = String(prod?.technicalSpecs?.[key] || '').trim();
    if (!raw || raw.toLowerCase() === 'official specification on briefing') {
      return 'Official specification pending';
    }
    return raw;
  };

  const priceX = prodX?.priceInr && prodX.priceInr > 0 ? prodX.priceInr : 450000;
  const pricePro = prodXPro?.priceInr && prodXPro.priceInr > 0 ? prodXPro.priceInr : 560000;

  return (
    <div className="bg-[#FFFFFF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-14">
        <div className="space-y-3 border-b border-[#DCEAF5] pb-6">
          <div className="text-xs font-semibold text-[#64B5F6]">Side-by-Side Technical Comparison</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#123B5D] text-balance">
            KRASHIVANTRI X vs KRASHIVANTRI X PRO
          </h1>
          <p className="text-sm text-[#263746] max-w-2xl">
            Compare pricing, official briefing specifications, target agricultural applications, and direct ordering options across both platforms.
          </p>
        </div>

        {/* Side-by-side summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              slug: 'krashivantri-x' as const,
              name: 'KRASHIVANTRI X',
              tagline: 'Smart Agriculture. Precision Spraying.',
              price: priceX,
              image: prodX?.imageUrl || '/src/assets/images/krashivantri_x_field_1795013369836.jpg',
              prod: prodX,
              apps: 'Precision agricultural crop spraying · FPO fleet operations · Institutional agritech R&D',
            },
            {
              slug: 'krashivantri-x-pro' as const,
              name: 'KRASHIVANTRI X PRO',
              tagline: 'Advanced Intelligence. Precision Agriculture.',
              price: pricePro,
              image: prodXPro?.imageUrl || '/src/assets/images/krashivantri_x_pro_1795013371537.jpg',
              prod: prodXPro,
              apps: 'Commercial spraying contractors · University R&D · Large-acreage precision farming',
            },
          ].map((item) => (
            <div key={item.slug} className="rounded-2xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col shadow-xs">
              <div className="aspect-[16/9] bg-[#F0F8FF]">
                <img src={item.image} alt={item.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#42A5F5]">{item.tagline}</div>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-2xl font-bold text-[#123B5D]">{item.name}</h2>
                    <span className="font-mono text-xl font-bold text-[#123B5D] tabular-nums">
                      ₹{item.price.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs text-[#263746]">{item.apps}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/${item.slug}`)}
                    className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    View Product Page
                  </button>
                  {item.prod && (
                    <button
                      type="button"
                      disabled={item.prod.stockQty <= 0}
                      onClick={() => {
                        addToCart(item.prod!, 1);
                        navigate('/checkout');
                      }}
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 disabled:opacity-40 transition-colors"
                    >
                      Buy Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Strict 7-Row Comparison Table */}
        <div className="rounded-2xl border border-[#DCEAF5] bg-white overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F0F8FF] text-[#123B5D] border-b border-[#DCEAF5]">
                <th className="py-4 px-5 font-display font-semibold text-xs uppercase tracking-wider w-1/4">Feature</th>
                <th className="py-4 px-5 font-display font-bold text-base w-[37.5%]">KRASHIVANTRI X</th>
                <th className="py-4 px-5 font-display font-bold text-base w-[37.5%]">KRASHIVANTRI X PRO</th>
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
              {[
                { label: 'Payload', key: 'Payload Capacity' },
                { label: 'Flight Time', key: 'Flight Time' },
                { label: 'Tank Capacity', key: 'Tank Capacity' },
                { label: 'Spraying Width', key: 'Spraying Width' },
                { label: 'Battery', key: 'Battery Specifications' },
                { label: 'Navigation', key: 'Navigation Capabilities' },
              ].map((row, idx) => {
                const valX = formatCompareSpec(prodX, row.key);
                const valPro = formatCompareSpec(prodXPro, row.key);
                return (
                  <tr key={row.key} className={idx % 2 === 0 ? 'bg-[#F0F8FF]/50' : 'bg-white'}>
                    <td className="py-3.5 px-5 font-semibold text-[#123B5D]">{row.label}</td>
                    <td className={`py-3.5 px-5 ${valX === 'Official specification pending' ? 'text-[#263746]/60 italic' : 'font-mono text-[#123B5D] font-medium'}`}>
                      {valX}
                    </td>
                    <td className={`py-3.5 px-5 ${valPro === 'Official specification pending' ? 'text-[#263746]/60 italic' : 'font-mono text-[#123B5D] font-medium'}`}>
                      {valPro}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DroneEnquiryForm heading="Request Side-by-Side Fleet Briefing" />
      </div>
    </div>
  );
};
