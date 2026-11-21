import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  AlertTriangle,
  CheckCircle2,
  Box,
  Layers,
  Clock,
  Scale,
  CreditCard,
  ChevronDown,
  Send,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ModelViewer3D } from '../components/ModelViewer3D';
import { AddressSelector } from '../components/AddressSelector';
import { RazorpayCheckoutModal } from '../components/RazorpayCheckoutModal';
import { AddressData } from '../types/platform';
import { buildFaqSchema, buildServiceSchema } from '../lib/seo';

interface SlicingResponse {
  upload: {
    fileName: string;
    fileSizeBytes: number;
    fileStoragePath: string;
    storageBucket?: string;
    uploadedAt?: string;
  };
  slicing: {
    fileFormat: string;
    triangleCount: number;
    boundingBoxMm: { x: number; y: number; z: number };
    volumeCm3: number;
    surfaceAreaCm2: number;
    estimatedWeightG: number;
    supportWeightG: number;
    estimatedPrintMinutes: number;
    layerCount: number;
    technicalReviewRequired: boolean;
    slicingStatus: string;
    warnings: string[];
    pricingBreakdown: {
      materialCostInr: number;
      machineCostInr: number;
      supportCostInr: number;
      wastageCostInr: number;
      labourCostInr: number;
      finishingCostInr: number;
      subtotalInr: number;
      deliveryInr: number;
      gstInr: number;
      discountInr: number;
      totalInr: number;
      technicalReviewRequired: boolean;
      warnings: string[];
    };
  };
  materialName: string;
  machineName: string;
  colorName?: string;
}

const ALLOWED_ORIGINAL_EXTS = ['stl', 'obj', '3mf', 'step', 'stp', 'iges', 'igs'];
const REJECTED_SLICED_EXTS = ['gcode', 'gco', 'g', 'bgcode', 'gx', 'x3g', 'ctb', 'goo', 'pwmo', 'sl1', 'photon', 'pws', 'pm3'];

const CAPABILITIES_3D = [
  'FDM 3D Printing',
  'Custom 3D Prototyping',
  'Functional Mechanical Parts',
  'Product Design & Development',
  'Engineering Models',
  'Customized Components',
  'Rapid Prototyping',
  'Mechanical Component Fabrication',
  'Prototype Testing & Iteration',
  'Small-Batch Manufacturing',
];

const WORKFLOW_STEPS_3D = [
  { step: '01', text: 'Upload your 3D CAD file.' },
  { step: '02', text: 'Select material and printing parameters.' },
  { step: '03', text: 'Configure infill, layer height, supports and quantity.' },
  { step: '04', text: 'Receive an estimated quotation.' },
  { step: '05', text: 'Complete payment.' },
  { step: '06', text: 'Track your printing order.' },
  { step: '07', text: 'Download your invoice and receive the finished product.' },
];

const FAQS_3D = [
  {
    q: 'Why are .GCODE or sliced printer files rejected?',
    a: 'Pre-sliced printer files vary widely across nozzle calibration, thermal profiles and hardware tolerances. Uploading original CAD formats (.STL, .OBJ, .3MF, .STEP/.STP, .IGES/.IGS) ensures our engineering pipeline slices with verified structural parameters.',
  },
  {
    q: 'How is instant quotation calculated for STL, OBJ and 3MF meshes?',
    a: 'Our volumetric slicing engine analyzes mesh facets, bounding dimensions, shell wall count, infill density, support volume, machine runtime and finishing selection to produce a line-by-line cost and GST breakdown.',
  },
  {
    q: 'What happens when I upload STEP/STP or IGES/IGS industrial CAD files?',
    a: 'Parametric STEP and IGES assemblies are queued for direct engineering inspection so critical bore tolerances, thread fits and wall thicknesses are verified before formal quotation and payment.',
  },
  {
    q: 'Can I order batch runs or request institutional billing for enclosures?',
    a: 'Yes. Set quantity up to 500 units directly in the configurator or submit a custom batch manufacturing enquiry below for volume pricing and GST invoicing.',
  },
];

export const Printing3DPage: React.FC = () => {
  const {
    isSignedIn,
    dbUser,
    openAuthModal,
    printingMaterials,
    printingMachines,
    apiFetch,
    notify,
    navigate,
    setDynamicSeo,
  } = usePlatform();

  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const [technology, setTechnology] = useState<'FDM' | 'SLA'>('FDM');
  const [materialId, setMaterialId] = useState<number>(0);
  const [colorName, setColorName] = useState<string>('Black');
  const [layerHeightMm, setLayerHeightMm] = useState<number>(0.2);
  const [infillPercent, setInfillPercent] = useState<number>(20);
  const [wallCount, setWallCount] = useState<number>(3);
  const [printSpeedMmS, setPrintSpeedMmS] = useState<number>(60);
  const [nozzleDiameterMm, setNozzleDiameterMm] = useState<number>(0.4);
  const [buildOrientation, setBuildOrientation] = useState<string>('Auto Optimal');
  const [scalePercent, setScalePercent] = useState<number>(100);
  const [supportEnabled, setSupportEnabled] = useState<boolean>(true);
  const [quantity, setQuantity] = useState<number>(1);
  const [finishingOption, setFinishingOption] = useState<string>('Standard As-Printed');
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  const [slicingData, setSlicingData] = useState<SlicingResponse | null>(null);
  const [slicingBusy, setSlicingBusy] = useState(false);

  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState<AddressData | null>(null);
  const [createdOrder, setCreatedOrder] = useState<{ id: number; orderNumber: string; totalInr: number; technicalReviewRequired: boolean } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  const [quoteForm, setQuoteForm] = useState({
    name: dbUser?.fullName || '',
    email: dbUser?.email || '',
    mobile: dbUser?.mobile || '',
    applicationType: 'Functional Mechanical Parts',
    materialPreference: 'PETG / ABS / Carbon-Nylon',
    quantityNote: '',
    brief: '',
  });
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteTicket, setQuoteTicket] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filteredMaterials = useMemo(
    () => printingMaterials.filter((m) => m.technology === technology),
    [printingMaterials, technology]
  );

  const activeMaterial = useMemo(
    () => filteredMaterials.find((m) => m.id === materialId) || filteredMaterials[0] || null,
    [filteredMaterials, materialId]
  );

  const activeMachine = useMemo(
    () => printingMachines.find((m) => m.technology === technology) || printingMachines[0] || null,
    [printingMachines, technology]
  );

  useEffect(() => {
    if (activeMaterial) {
      setMaterialId(activeMaterial.id);
      const colors = activeMaterial.availableColors || [];
      if (colors.length > 0) {
        const hasCurrent = colors.some((c) => c.name === colorName);
        if (!hasCurrent) setColorName(colors[0].name);
      }
      const heights = activeMaterial.layerHeightsMm || [];
      if (heights.length > 0 && !heights.includes(layerHeightMm)) {
        setLayerHeightMm(heights[0]);
      }
    }
  }, [activeMaterial, colorName, layerHeightMm]);

  const loadAddresses = async () => {
    if (!isSignedIn) return;
    try {
      const me = await apiFetch<{ addresses: AddressData[] }>('/api/me');
      setAddresses(me.addresses || []);
      if (!deliveryAddress && me.addresses?.length > 0) {
        setDeliveryAddress(me.addresses.find((a) => a.isDefault) || me.addresses[0]);
      }
    } catch (err: any) {
      notify(err?.message || 'Unable to synchronize saved delivery addresses from cloud.', 'error');
    }
  };

  useEffect(() => {
    loadAddresses();
  }, [isSignedIn]);

  useEffect(() => {
    if (isSignedIn && file && !slicingData && !slicingBusy && !uploadError) {
      runServerSlicing(file);
    }
  }, [isSignedIn, file]);

  useEffect(() => {
    setDynamicSeo({
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Services', url: '/services' },
        { name: '3D Printing & Rapid Prototyping', url: '/services/3d-printing' },
      ],
      schemas: [
        buildServiceSchema({
          name: '3D Printing & Rapid Prototyping Service',
          serviceType: 'Additive Manufacturing & Product Fabrication',
          description:
            'Professional FDM and SLA 3D printing, STL/OBJ volumetric slicing quote, rapid prototyping, and small-batch manufacturing in Nagpur, India.',
          url: '/services/3d-printing',
        }),
        buildFaqSchema(FAQS_3D),
      ],
    });
    return () => setDynamicSeo(null);
  }, [setDynamicSeo]);

  const activeColorHex = useMemo(() => {
    return (
      activeMaterial?.availableColors?.find((c) => c.name === colorName)?.hex || '#42A5F5'
    );
  }, [activeMaterial, colorName]);

  const runServerSlicing = async (targetFile: File) => {
    if (!isSignedIn) {
      notify('Please sign in to run server-side geometry slicing and pricing.', 'info');
      return;
    }
    setSlicingBusy(true);
    try {
      const fd = new FormData();
      fd.append('model', targetFile);
      fd.append('technology', technology);
      if (activeMaterial) fd.append('materialId', String(activeMaterial.id));
      fd.append('colorName', colorName);
      fd.append('layerHeightMm', String(layerHeightMm));
      fd.append('infillPercent', String(infillPercent));
      fd.append('wallCount', String(wallCount));
      fd.append('printSpeedMmS', String(printSpeedMmS));
      fd.append('nozzleDiameterMm', String(nozzleDiameterMm));
      fd.append('buildOrientation', buildOrientation);
      fd.append('scalePercent', String(scalePercent));
      fd.append('supportEnabled', String(supportEnabled));
      fd.append('quantity', String(quantity));
      fd.append('finishingOption', finishingOption);

      const res = await apiFetch<SlicingResponse>('/api/3d-printing/slice', {
        method: 'POST',
        body: fd,
      });
      if (!res || !res.slicing || !res.upload) {
        throw new Error('Unable to read slicing telemetry from server. Please try uploading again.');
      }
      setSlicingData(res);
      setUploadError('');
    } catch (err: any) {
      const msg = err?.message || 'Failed to slice uploaded model.';
      setSlicingData(null);
      setUploadError(msg);
      notify(msg, 'error');
    } finally {
      setSlicingBusy(false);
    }
  };

  const handleFileChange = (picked: File | null) => {
    if (!picked) return;
    const ext = picked.name.split('.').pop()?.toLowerCase() || '';
    if (REJECTED_SLICED_EXTS.includes(ext)) {
      const msg =
        'Sliced G-code / printer files (.gcode, .gx, .bgcode, .ctb) are not accepted. Please upload an original 3D CAD design file (.STL, .OBJ, .3MF, .STEP/.STP, .IGES/.IGS).';
      setUploadError(msg);
      notify(msg, 'error');
      return;
    }
    if (!ALLOWED_ORIGINAL_EXTS.includes(ext)) {
      const msg =
        'Unsupported format. Supported original 3D CAD formats: .STL, .OBJ, .3MF, .STEP/.STP, .IGES/.IGS.';
      setUploadError(msg);
      notify(msg, 'error');
      return;
    }
    if (picked.size > 80 * 1024 * 1024) {
      const msg = 'Maximum model file size is 80 MB.';
      setUploadError(msg);
      notify(msg, 'error');
      return;
    }
    setUploadError('');
    setFile(picked);
    setCreatedOrder(null);
    if (isSignedIn) {
      runServerSlicing(picked);
    }
  };

  const handlePlaceOrder = async () => {
    if (!isSignedIn) {
      openAuthModal('login');
      return;
    }
    if (!file || !slicingData?.upload || !slicingData?.slicing) {
      notify('Upload a 3D model and generate a slicing preview first.', 'error');
      return;
    }
    setPlacing(true);
    try {
      const res = await apiFetch<{
        order: { id: number; orderNumber: string; totalInr: number; slicingStatus: string };
      }>('/api/3d-printing/orders', {
        method: 'POST',
        body: JSON.stringify({
          fileName: slicingData.upload.fileName,
          fileStoragePath: slicingData.upload.fileStoragePath,
          storageBucket: slicingData.upload.storageBucket,
          uploadedAt: slicingData.upload.uploadedAt || new Date().toISOString(),
          technology,
          materialName: activeMaterial?.name,
          colorName,
          layerHeightMm,
          infillPercent,
          wallCount,
          printSpeedMmS,
          nozzleDiameterMm,
          buildOrientation,
          scalePercent,
          supportEnabled,
          quantity,
          finishingOption,
          specialInstructions,
          deliveryAddress: deliveryAddress || undefined,
        }),
      });
      const techReview = res.order.slicingStatus === 'Technical Review Required';
      setCreatedOrder({
        id: res.order.id,
        orderNumber: res.order.orderNumber,
        totalInr: res.order.totalInr,
        technicalReviewRequired: techReview,
      });
      notify(
        `3D Printing Enquiry ${res.order.orderNumber} submitted! Your 3D model is now accessible to our engineering team for review & quotation.`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Could not submit 3D printing enquiry.', 'error');
    } finally {
      setPlacing(false);
    }
  };

  const handleQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteBusy(true);
    try {
      const res = await apiFetch<{ ticket: { ticketNumber: string } }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: quoteForm.name,
          email: quoteForm.email,
          mobile: quoteForm.mobile,
          subject: `3D Printing Custom Quote: ${quoteForm.applicationType}`,
          serviceCategory: '3D Printing & Rapid Prototyping',
          message: `Application: ${quoteForm.applicationType}\nMaterial Preference: ${quoteForm.materialPreference}\nBatch Quantity / Size Note: ${quoteForm.quantityNote || 'Standard'}\n\nRequirements:\n${quoteForm.brief}`,
        }),
      });
      setQuoteTicket(res.ticket.ticketNumber);
      notify(`Custom quote enquiry ${res.ticket.ticketNumber} submitted.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Unable to submit custom quote enquiry.', 'error');
    } finally {
      setQuoteBusy(false);
    }
  };

  const slicingReport = slicingData?.slicing ?? null;
  const pricing = slicingReport?.pricingBreakdown ?? null;

  return (
    <div className="bg-white">
      {/* White + Light Blue Corporate Header */}
      <section className="bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#123B5D] border-b border-[#DCEAF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-16 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-[#42A5F5] font-semibold">
              01 · Additive Manufacturing &amp; Product Fabrication
            </div>
            <button
              type="button"
              onClick={() => navigate('/services')}
              className="text-xs font-medium text-[#123B5D] hover:text-[#42A5F5] transition-colors whitespace-nowrap"
            >
              ← Back to All Services
            </button>
          </div>

          <div className="max-w-4xl space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#123B5D]">
              3D Printing &amp; Rapid Prototyping
            </h1>
            <p className="text-base text-[#263746] leading-relaxed max-w-3xl">
              Transform digital designs into physical products through professional 3D printing, rapid prototyping, custom component manufacturing, product development and precision fabrication.
            </p>
            <div className="text-xs font-mono text-[#42A5F5] font-semibold pt-1">
              Supported Original CAD Formats: STL · OBJ · 3MF · STEP/STP · IGES/IGS
            </div>
          </div>

          <div className="pt-1 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/services/3d-printing#cad-upload')}
              className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Upload 3D File</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/services/3d-printing#custom-quote-enquiry')}
              className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg whitespace-nowrap transition-colors"
            >
              Request Custom Quote
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-14">
        {/* Interactive CAD Upload & Slicing Workbench */}
        <section id="cad-upload" className="space-y-6">
          <div className="space-y-1">
            <div className="text-xs font-mono uppercase tracking-wider text-[#42A5F5] font-semibold">
              Online CAD Quotation &amp; Slicing Engine
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              Upload Original CAD File &amp; Configure Print Parameters
            </h2>
            <p className="text-sm text-[#263746] max-w-3xl">
              Original 3D design files (.STL, .OBJ, .3MF, .STEP/.STP, .IGES/.IGS) only. Sliced G-code files are rejected automatically to protect print tolerances.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Interactive 3D Viewport + Upload + Slicing Output */}
            <div className="lg:col-span-7 space-y-6">
              <ModelViewer3D
                file={file}
                colorHex={activeColorHex}
                buildVolume={
                  activeMachine
                    ? {
                        x: activeMachine.buildVolumeX,
                        y: activeMachine.buildVolumeY,
                        z: activeMachine.buildVolumeZ,
                      }
                    : undefined
                }
                dimensionsMm={slicingReport?.boundingBoxMm || null}
              />

              {/* Drag & Drop File Upload */}
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFileChange(e.dataTransfer.files?.[0] || null);
                }}
                className="flex flex-col sm:flex-row items-center justify-between gap-4 border-2 border-dashed border-[#90CAF9] hover:border-[#42A5F5] rounded-xl bg-[#F0F8FF]/50 hover:bg-[#F0F8FF] p-5 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-white border border-[#DCEAF5] text-[#42A5F5]">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#123B5D]">
                      {file ? file.name : 'Upload Original 3D CAD Model (.STL, .OBJ, .3MF, .STEP/.STP, .IGES/.IGS)'}
                    </div>
                    <div className="text-xs text-[#263746]/70">
                      {file
                        ? `${(file.size / 1024).toFixed(1)} KB · Click or drop to replace`
                        : 'Original CAD files only (sliced G-code rejected) · Max 80 MB'}
                    </div>
                  </div>
                </div>
                <span className="px-4 py-2 bg-[#64B5F6] text-white text-xs font-semibold rounded-lg whitespace-nowrap">
                  {file ? 'Replace File' : 'Browse File'}
                </span>
                <input
                  type="file"
                  accept=".stl,.obj,.3mf,.step,.stp,.iges,.igs"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              {uploadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-2.5 text-xs text-red-900">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Real Slicing Output Telemetry */}
              {slicingBusy && (
                <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-4 text-sm text-[#123B5D]">
                  Running mesh analysis, overhang detection and volumetric slicing calculation...
                </div>
              )}

              {slicingReport && (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-3">
                    <h3 className="font-display font-bold text-[#123B5D]">Slicing &amp; Geometry Report</h3>
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        slicingReport.technicalReviewRequired ? 'text-amber-700' : 'text-[#42A5F5]'
                      }`}
                    >
                      {slicingReport.technicalReviewRequired ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      {slicingReport.slicingStatus}
                    </span>
                  </div>

                  {!slicingReport.technicalReviewRequired && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div className="rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3 space-y-1">
                        <div className="text-[#42A5F5] flex items-center gap-1 font-medium">
                          <Box className="w-3.5 h-3.5" /> Dimensions
                        </div>
                        <div className="font-mono font-semibold text-[#123B5D] tabular-nums">
                          {slicingReport.boundingBoxMm?.x ?? 0} × {slicingReport.boundingBoxMm?.y ?? 0} ×{' '}
                          {slicingReport.boundingBoxMm?.z ?? 0} mm
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3 space-y-1">
                        <div className="text-[#42A5F5] flex items-center gap-1 font-medium">
                          <Scale className="w-3.5 h-3.5" /> Filament / Resin
                        </div>
                        <div className="font-mono font-semibold text-[#123B5D] tabular-nums">
                          {slicingReport.estimatedWeightG ?? 0} g ({slicingReport.volumeCm3 ?? 0} cm³)
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3 space-y-1">
                        <div className="text-[#42A5F5] flex items-center gap-1 font-medium">
                          <Clock className="w-3.5 h-3.5" /> Est. Print Time
                        </div>
                        <div className="font-mono font-semibold text-[#123B5D] tabular-nums">
                          {Math.floor((slicingReport.estimatedPrintMinutes || 0) / 60)}h{' '}
                          {(slicingReport.estimatedPrintMinutes || 0) % 60}m
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3 space-y-1">
                        <div className="text-[#42A5F5] flex items-center gap-1 font-medium">
                          <Layers className="w-3.5 h-3.5" /> Layers / Facets
                        </div>
                        <div className="font-mono font-semibold text-[#123B5D] tabular-nums">
                          {slicingReport.layerCount ?? 0} layers · {(slicingReport.triangleCount ?? 0).toLocaleString()} tris
                        </div>
                      </div>
                    </div>
                  )}

                  {(slicingReport.warnings || []).length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1">
                      {(slicingReport.warnings || []).map((w, i) => (
                        <div key={i}>• {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Print Configuration, Pricing & Checkout */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm">
                <h3 className="font-display text-lg font-bold text-[#123B5D]">Print Configuration</h3>

                {/* Technology */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#263746]">Printing Technology</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-[#F0F8FF] border border-[#DCEAF5] rounded-lg">
                    {(['FDM', 'SLA'] as const).map((tech) => (
                      <button
                        key={tech}
                        type="button"
                        onClick={() => setTechnology(tech)}
                        className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                          technology === tech ? 'bg-[#64B5F6] text-white shadow-sm' : 'text-[#263746] hover:text-[#123B5D]'
                        }`}
                      >
                        {tech === 'FDM' ? 'FDM Engineering Polymer' : 'SLA High-Detail Resin'}
                      </button>
                    ))}
                  </div>
                  {activeMachine && (
                    <div className="text-xs text-[#263746]/70 font-mono">
                      Machine: {activeMachine.name} ({activeMachine.buildVolumeX}×{activeMachine.buildVolumeY}×{activeMachine.buildVolumeZ} mm)
                    </div>
                  )}
                </div>

                {/* Material */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#263746]">Material</label>
                  <select
                    value={activeMaterial?.id || ''}
                    onChange={(e) => setMaterialId(Number(e.target.value))}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  >
                    {filteredMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — ₹{m.ratePerGramInr}/g
                      </option>
                    ))}
                  </select>
                  {activeMaterial && (
                    <p className="text-xs text-[#263746]/75">{activeMaterial.description}</p>
                  )}
                </div>

                {/* Available Colors */}
                {activeMaterial && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#263746]">
                      Available Colour: <span className="font-semibold text-[#123B5D]">{colorName}</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {activeMaterial.availableColors.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setColorName(c.name)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors ${
                            colorName === c.name
                              ? 'border-[#64B5F6] bg-[#F0F8FF] text-[#123B5D]'
                              : 'border-[#DCEAF5] bg-white text-[#263746]'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-[#DCEAF5]"
                            style={{ backgroundColor: c.hex }}
                          />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layer Height, Infill, Quantity */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Layer Height</label>
                    <select
                      value={layerHeightMm}
                      onChange={(e) => setLayerHeightMm(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 text-sm bg-white font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {(activeMaterial?.layerHeightsMm || [0.1, 0.15, 0.2, 0.3]).map((lh) => (
                        <option key={lh} value={lh}>{lh} mm</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Infill %</label>
                    <select
                      value={infillPercent}
                      disabled={technology === 'SLA'}
                      onChange={(e) => setInfillPercent(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 text-sm bg-white font-mono text-[#263746] disabled:opacity-50 focus:outline-none focus:border-[#64B5F6]"
                    >
                      {[10, 20, 30, 50, 75, 100].map((inf) => (
                        <option key={inf} value={inf}>{inf}%</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Wall / Shell Loops</label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={wallCount}
                      disabled={technology === 'SLA'}
                      onChange={(e) => setWallCount(Math.max(1, Math.min(8, Number(e.target.value) || 3)))}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 text-sm font-mono text-[#263746] disabled:opacity-50 focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Nozzle Size</label>
                    <select
                      value={nozzleDiameterMm}
                      disabled={technology === 'SLA'}
                      onChange={(e) => setNozzleDiameterMm(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 text-sm bg-white font-mono text-[#263746] disabled:opacity-50 focus:outline-none focus:border-[#64B5F6]"
                    >
                      {[0.2, 0.4, 0.6, 0.8].map((n) => (
                        <option key={n} value={n}>{n} mm</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Scale %</label>
                    <input
                      type="number"
                      min={25}
                      max={300}
                      value={scalePercent}
                      onChange={(e) => setScalePercent(Math.max(25, Math.min(300, Number(e.target.value) || 100)))}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Print Speed (mm/s)</label>
                    <select
                      value={printSpeedMmS}
                      disabled={technology === 'SLA'}
                      onChange={(e) => setPrintSpeedMmS(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 text-sm bg-white font-mono text-[#263746] disabled:opacity-50 focus:outline-none focus:border-[#64B5F6]"
                    >
                      {[40, 60, 80, 100, 120, 150].map((spd) => (
                        <option key={spd} value={spd}>{spd} mm/s</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Build Orientation</label>
                    <select
                      value={buildOrientation}
                      onChange={(e) => setBuildOrientation(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="Auto Optimal">Auto Optimal</option>
                      <option value="Flat Base (Max Strength)">Flat Base (Max Strength)</option>
                      <option value="Vertical (Fine Detail)">Vertical (Fine Detail)</option>
                      <option value="45° Support-Reduced">45° Support-Reduced</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Finishing</label>
                    <select
                      value={finishingOption}
                      onChange={(e) => setFinishingOption(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="Standard As-Printed">Standard As-Printed</option>
                      <option value="Support Removal & Sanding">Support Removal &amp; Sanding</option>
                      <option value="Vapor / Primer Ready">Primer-Ready Finish</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-[#263746]">
                      <input
                        type="checkbox"
                        checked={supportEnabled}
                        onChange={(e) => setSupportEnabled(e.target.checked)}
                        className="rounded border-[#DCEAF5] accent-[#64B5F6]"
                      />
                      Auto-Generate Overhang Supports
                    </label>
                  </div>
                </div>

                <textarea
                  rows={2}
                  placeholder="Orientation preference, critical tolerances, or thread insert instructions..."
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />

                {file && (
                  <button
                    type="button"
                    disabled={slicingBusy}
                    onClick={() => (isSignedIn ? runServerSlicing(file) : openAuthModal('login'))}
                    className="w-full py-2.5 px-4 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                  >
                    {isSignedIn ? 'Recalculate Slicing & Price Estimate' : 'Sign In via Email OTP to Calculate Estimate'}
                  </button>
                )}
              </div>

              {/* Transparent Pricing Breakdown */}
              {pricing && (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h3 className="font-display font-bold text-[#123B5D]">Transparent Cost Breakdown</h3>
                  {pricing.technicalReviewRequired ? (
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Automatic pricing is paused because this file requires Technical Review. Place your order below and our engineer will send a verified quotation.
                    </p>
                  ) : (
                    <div className="space-y-1.5 text-xs text-[#263746] font-mono tabular-nums">
                      <div className="flex justify-between"><span>Material Consumption</span><span>₹{pricing.materialCostInr}</span></div>
                      <div className="flex justify-between"><span>Machine Runtime</span><span>₹{pricing.machineCostInr}</span></div>
                      <div className="flex justify-between"><span>Support Material</span><span>₹{pricing.supportCostInr}</span></div>
                      <div className="flex justify-between"><span>Wastage &amp; Setup</span><span>₹{pricing.wastageCostInr}</span></div>
                      <div className="flex justify-between"><span>Handling &amp; Labour</span><span>₹{pricing.labourCostInr}</span></div>
                      {pricing.finishingCostInr > 0 && (
                        <div className="flex justify-between"><span>Finishing</span><span>₹{pricing.finishingCostInr}</span></div>
                      )}
                      <div className="flex justify-between"><span>Shipping</span><span>₹{pricing.deliveryInr}</span></div>
                      <div className="flex justify-between"><span>GST (18%)</span><span>₹{pricing.gstInr}</span></div>
                      <div className="border-t border-[#DCEAF5] pt-2 flex justify-between text-sm font-bold text-[#123B5D]">
                        <span>Total Payable</span>
                        <span>₹{pricing.totalInr.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Address & Order Button */}
              {isSignedIn ? (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <AddressSelector
                    title="Delivery Address"
                    addresses={addresses}
                    selected={deliveryAddress}
                    onSelect={setDeliveryAddress}
                    onAddressSaved={loadAddresses}
                  />

                  {createdOrder ? (
                    <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-4 space-y-3 text-xs text-[#123B5D]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-sm">
                          Enquiry {createdOrder.orderNumber} Submitted
                        </div>
                        <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">
                          Pending Payment
                        </span>
                      </div>
                      <p className="text-[#263746] leading-relaxed">
                        Your 3D model has been uploaded and is immediately accessible to our engineering team for inspection and quotation. Printing begins once payment is completed and approved.
                      </p>
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        {!createdOrder.technicalReviewRequired && createdOrder.totalInr > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayOpen(true)}
                            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Pay ₹{createdOrder.totalInr.toLocaleString('en-IN')} Now
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate('/my-account')}
                          className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#E3F2FD] text-[#123B5D] rounded-lg font-semibold transition-colors"
                        >
                          Track Enquiry in My Account
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={placing || !slicingReport}
                        onClick={handlePlaceOrder}
                        className="w-full py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {placing
                          ? 'Submitting 3D Printing Enquiry...'
                          : slicingReport?.technicalReviewRequired
                          ? 'Submit 3D File for Engineering Review & Quote'
                          : 'Submit 3D Printing Enquiry (No Upfront Payment Required)'}
                      </button>
                      <p className="text-[11px] text-[#263746]/70 text-center">
                        You can submit your 3D CAD file immediately without paying upfront. Pay online after engineering review or anytime from My Account.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-6 text-center space-y-3">
                  <p className="text-sm text-[#263746]">Sign in via Email OTP to run server-side slicing, select delivery address and place your printing order.</p>
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Sign In with Email OTP
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Full Service Capabilities */}
        <section className="space-y-6">
          <div className="space-y-1.5">
            <div className="text-xs font-mono uppercase tracking-wider text-[#42A5F5] font-semibold">
              Fabrication Capabilities
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              Complete Additive Manufacturing &amp; Prototyping Scope
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {CAPABILITIES_3D.map((cap) => (
              <div
                key={cap}
                className="flex items-start gap-2.5 rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] px-4 py-3 text-sm font-medium text-[#123B5D]"
              >
                <CheckCircle2 className="w-4 h-4 text-[#42A5F5] shrink-0 mt-0.5" />
                <span>{cap}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 7-Step Customer Workflow */}
        <section className="space-y-6">
          <div className="space-y-1.5">
            <div className="text-xs font-mono uppercase tracking-wider text-[#42A5F5] font-semibold">
              Order Pipeline
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              Customer Workflow
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WORKFLOW_STEPS_3D.map((item) => (
              <div key={item.step} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-2 shadow-sm">
                <div className="font-mono text-lg font-bold text-[#42A5F5] tabular-nums">{item.step}</div>
                <p className="text-sm font-medium text-[#123B5D] leading-snug">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Custom Batch / Enterprise Quote Enquiry Form */}
        <section id="custom-quote-enquiry" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-[#42A5F5] font-semibold">
              Custom Fabrication Desk
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              Request Custom 3D Printing Quote
            </h2>
            <p className="text-sm text-[#263746] leading-relaxed">
              Planning a multi-part assembly, batch manufacturing run, CAD redesign from sketches, or institutional purchase order? Share your brief for an engineer-verified quotation.
            </p>
            <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-5 space-y-2 text-xs text-[#263746]">
              <div className="font-semibold text-[#123B5D]">Supported Engineering Parameters:</div>
              <div>• Polymers: PLA+, PETG, ABS, ASA, TPU, Carbon-Filled Nylon &amp; Tough Resin</div>
              <div>• Tolerances reviewed per functional fit, brass heat-set inserts &amp; assembly clearances</div>
              <div>• GST tax invoice generated automatically inside My Account</div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {quoteTicket ? (
              <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-8 space-y-3">
                <div className="text-xs font-mono font-semibold text-[#42A5F5]">QUOTE ENQUIRY RECEIVED</div>
                <h3 className="font-display text-xl font-bold text-[#123B5D]">
                  Reference Number: {quoteTicket}
                </h3>
                <p className="text-sm text-[#263746]">
                  Our additive manufacturing desk will review your batch or custom CAD brief and respond with pricing and lead time.
                </p>
                <button
                  type="button"
                  onClick={() => setQuoteTicket('')}
                  className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                >
                  Submit Another Enquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleQuoteSubmit} className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    required
                    placeholder="Full Name *"
                    value={quoteForm.name}
                    onChange={(e) => setQuoteForm({ ...quoteForm, name: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email Address *"
                    value={quoteForm.email}
                    onChange={(e) => setQuoteForm({ ...quoteForm, email: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    placeholder="Mobile Number *"
                    value={quoteForm.mobile}
                    onChange={(e) => setQuoteForm({ ...quoteForm, mobile: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <select
                    value={quoteForm.applicationType}
                    onChange={(e) => setQuoteForm({ ...quoteForm, applicationType: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  >
                    {CAPABILITIES_3D.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Preferred Material (e.g. PETG, ABS)"
                    value={quoteForm.materialPreference}
                    onChange={(e) => setQuoteForm({ ...quoteForm, materialPreference: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="Estimated Quantity / Batch Size"
                    value={quoteForm.quantityNote}
                    onChange={(e) => setQuoteForm({ ...quoteForm, quantityNote: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>

                <textarea
                  required
                  rows={4}
                  placeholder="Describe part dimensions, mechanical load requirements, surface finish, or custom CAD design assistance needed *"
                  value={quoteForm.brief}
                  onChange={(e) => setQuoteForm({ ...quoteForm, brief: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />

                <button
                  type="submit"
                  disabled={quoteBusy}
                  className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <Send className="w-4 h-4 shrink-0" />
                  <span>{quoteBusy ? 'Sending Quote Request...' : 'Request Custom Quote'}</span>
                </button>
              </form>
            )}
          </div>
        </section>

        {/* FAQs */}
        <section className="space-y-5">
          <div className="space-y-1">
            <div className="text-xs font-mono uppercase tracking-wider text-[#42A5F5] font-semibold">FAQ</div>
            <h2 className="font-display text-2xl font-bold text-[#123B5D]">3D Printing &amp; Prototyping Questions</h2>
          </div>
          <div className="divide-y divide-[#DCEAF5] border border-[#DCEAF5] rounded-xl bg-white">
            {FAQS_3D.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-[#F0F8FF] transition-colors"
                  >
                    <span className="font-medium text-sm sm:text-base text-[#123B5D]">{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#263746]/70 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#42A5F5]' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-[#263746] leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {createdOrder && (
        <RazorpayCheckoutModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          entityType="printing_order"
          entityId={createdOrder.id}
          title={`3D Print Order ${createdOrder.orderNumber}`}
          amountInr={createdOrder.totalInr}
          onSuccess={() => navigate('/my-account')}
        />
      )}
    </div>
  );
};
