import React, { useEffect, useState } from 'react';
import { Upload, ArrowRight, CheckCircle2, Play, ArrowLeft } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { AddressSelector } from '../components/AddressSelector';
import { AddressData, CaseStudy } from '../types/platform';

export const ProjectsShowcasePage: React.FC = () => {
  const { caseStudies, settings, navigate } = usePlatform();
  const projCms = settings.cmsContent?.projectGallery;

  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DCEAF5] pb-6">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-semibold text-[#42A5F5]">
              {projCms?.heroKicker || 'Applied Research & Builds'}
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-[#123B5D]">
              {projCms?.heroTitle || 'Engineering R&D & Academic Projects'}
            </h1>
            <p className="text-[#263746] text-sm sm:text-base">
              {projCms?.heroDescription ||
                'Documented platforms, UAV prototypes, embedded builds, and robotics systems engineered by the NexusTekFusion team.'}
            </p>
          </div>
          <button
            onClick={() => navigate('/register-project')}
            className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 transition-colors"
          >
            Register Your Project <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {(projCms?.featuredVideoUrl || projCms?.bannerImageUrl) && (
          <div className="rounded-2xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF]">
            {projCms.featuredVideoUrl ? (
              <video
                src={projCms.featuredVideoUrl}
                poster={projCms.bannerImageUrl || undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[460px] object-cover"
              />
            ) : (
              <img
                src={projCms.bannerImageUrl}
                alt={projCms.heroTitle || 'Engineering R&D Showcase'}
                referrerPolicy="no-referrer"
                className="w-full max-h-[420px] object-cover"
              />
            )}
          </div>
        )}

        {projCms?.categories && projCms.categories.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[#123B5D]">
                Engineering Project Categories
              </h2>
              <button
                onClick={() => navigate('/register-project')}
                className="text-xs font-semibold text-[#42A5F5] hover:underline inline-flex items-center gap-1"
              >
                Start a Custom Build <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projCms.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between shadow-sm"
                >
                  {cat.imageUrl && (
                    <div className="aspect-[16/9] bg-[#F0F8FF] overflow-hidden">
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4 space-y-1.5">
                    <h3 className="font-display font-bold text-base text-[#123B5D]">{cat.name}</h3>
                    <p className="text-xs text-[#263746] leading-relaxed">{cat.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {caseStudies.length === 0 ? (
          <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-10 text-center text-sm text-[#263746]">
            No published projects yet. Administrators can publish projects from the Admin Console.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {caseStudies.map((cs) => (
              <div key={cs.id} className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col justify-between shadow-sm">
                <div>
                  <button
                    onClick={() => navigate(`/projects/${cs.slug}`)}
                    className="aspect-[16/9] bg-[#F0F8FF] block w-full overflow-hidden"
                  >
                    <img src={cs.imageUrl} alt={cs.title} referrerPolicy="no-referrer" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                  </button>
                  <div className="p-6 space-y-3">
                    <div className="text-xs text-[#42A5F5] font-medium">{cs.relatedServices.join(' · ')}</div>
                    <h2 className="font-display text-xl font-bold text-[#123B5D]">{cs.title}</h2>
                    <p className="text-sm text-[#263746] leading-relaxed">{cs.description}</p>
                    <div className="border-t border-[#DCEAF5] pt-3 text-xs text-[#263746] space-y-1">
                      <div><span className="font-semibold text-[#123B5D]">Technologies:</span> {cs.technologyUsed}</div>
                      <div><span className="font-semibold text-[#123B5D]">Applications:</span> {cs.applications}</div>
                      <div><span className="font-semibold text-[#123B5D]">Outcomes:</span> {cs.outcomes}</div>
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-5 pt-3 flex items-center justify-between border-t border-[#DCEAF5] bg-[#F0F8FF]/50">
                  <button
                    onClick={() => navigate(`/projects/${cs.slug}`)}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    View Project <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => navigate('/project-enquiry')}
                    className="text-xs font-semibold text-[#123B5D] hover:text-[#42A5F5] hover:underline"
                  >
                    Request Similar Build
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const ProjectDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const { apiFetch, navigate } = usePlatform();
  const [project, setProject] = useState<CaseStudy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ project: CaseStudy }>(`/api/projects/${encodeURIComponent(slug)}`)
      .then((res) => setProject(res.project))
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [slug, apiFetch]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-sm text-[#263746]">Loading project documentation...</div>;
  }

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#123B5D]">Project Not Found</h1>
        <button
          onClick={() => navigate('/projects')}
          className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const isInlineVideo = Boolean(
    project.videoUrl &&
      (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(project.videoUrl) || project.videoUrl.startsWith('/uploads/'))
  );

  return (
    <div className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10">
        <button
          onClick={() => navigate('/projects')}
          className="text-xs font-semibold text-[#263746] hover:text-[#42A5F5] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Engineering R&amp;D &amp; Academic Projects
        </button>

        <div className="space-y-4 border-b border-[#DCEAF5] pb-6">
          <div className="text-xs font-semibold text-[#42A5F5]">
            {project.relatedServices.join(' · ') || 'Engineering R&D Project'}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#123B5D]">{project.title}</h1>
          <p className="text-base text-[#263746] leading-relaxed">{project.description}</p>
        </div>

        <div className="aspect-[16/9] rounded-2xl overflow-hidden border border-[#DCEAF5] bg-[#F0F8FF]">
          <img
            src={project.imageUrl}
            alt={project.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>

        {project.videoUrl && (
          <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#123B5D]">
                <Play className="w-4 h-4 text-[#42A5F5]" /> Project Test &amp; Demonstration Video
              </div>
              <a
                href={project.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Open Video
              </a>
            </div>
            {isInlineVideo && (
              <video
                src={project.videoUrl}
                poster={project.imageUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-xl bg-black max-h-[460px]"
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-6 space-y-2">
            <div className="text-xs font-semibold text-[#42A5F5] uppercase">Technologies Used</div>
            <p className="text-sm text-[#263746] leading-relaxed">{project.technologyUsed || 'Configured in Admin CMS'}</p>
          </div>
          <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-6 space-y-2">
            <div className="text-xs font-semibold text-[#42A5F5] uppercase">Field Applications</div>
            <p className="text-sm text-[#263746] leading-relaxed">{project.applications || 'Industrial & Academic Deployment'}</p>
          </div>
          <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-6 space-y-2">
            <div className="text-xs font-semibold text-[#42A5F5] uppercase">Engineering Outcomes</div>
            <p className="text-sm text-[#263746] leading-relaxed">{project.outcomes || 'Validated Production Prototype'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#90CAF9] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-[#123B5D]">Need a Similar R&amp;D or Academic System?</h2>
            <p className="text-xs sm:text-sm text-[#263746]">
              Request an itemized 14-category engineering quotation tailored to your technical scope.
            </p>
          </div>
          <button
            onClick={() => navigate('/project-enquiry')}
            className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 transition-colors"
          >
            Request Similar Project <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const PROJECT_CATEGORIES = [
  'Artificial Intelligence and Machine Learning',
  'Internet of Things (IoT)',
  'Robotics and Automation',
  'Drone and UAV Development',
  'Embedded Systems and Microcontrollers',
  'Electrical and Electronics Engineering',
  'PCB Design and Development',
  'Mechanical Design and CAD Modelling',
  '3D Printing and Rapid Prototyping',
  'Software and Application Development',
  'Industrial Automation',
  'Custom Research and Product Development',
];

const CUSTOMER_CATEGORIES = [
  'Student',
  'Startup',
  'Business',
  'Researcher',
  'Individual',
  'Institution',
];

const PROJECT_TYPES = [
  'Mini Project',
  'Major Project',
  'Final Year Project',
  'Research Project',
  'Prototype',
  'Commercial Product',
  'Custom Development',
];

const COMPLEXITY_LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Research Level'];

const DOC_TYPES = [
  'Reference PDF',
  'Image',
  'Circuit Diagram',
  'Research Paper',
  'Reference Video',
  'CAD File',
  'Project Specification',
  'Other Supporting Document',
];

const ALLOWED_DOC_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.mp4,.mov,.avi,.mkv,.zip,.rar,.stl,.obj,.3mf,.step,.stp,.iges,.igs,.dwg,.dxf,.gbr,.kicad_pcb,.sch,.brd';

export const ProjectEnquiryPage: React.FC = () => {
  const {
    isSignedIn,
    dbUser,
    openAuthModal,
    apiFetch,
    notify,
    navigate,
  } = usePlatform();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [billingAddress, setBillingAddress] = useState<AddressData | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState<AddressData | null>(null);
  const [sameAddress, setSameAddress] = useState(true);
  const [files, setFiles] = useState<Array<{ file: File; docType: string }>>([]);
  const [selectedDocType, setSelectedDocType] = useState<string>('Project Specification');
  const [submitting, setSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState('');

  const [form, setForm] = useState({
    customerName: dbUser?.fullName || '',
    customerEmail: dbUser?.email || '',
    customerPhone: dbUser?.mobile || '',
    whatsappNumber: dbUser?.mobile || '',
    companyOrCollege: dbUser?.companyOrCollege || '',
    courseDepartment: '',
    city: '',
    state: '',
    customerCategory: 'Student',
    teamType: 'Individual',
    teamCount: 1,
    projectTitle: '',
    projectCategory: 'Custom Research and Product Development',
    engineeringDomain: 'Electronics & Embedded Systems',
    engineeringBranch: 'Electronics & Communication (ECE)',
    academicLevel: 'Final Year Project',
    projectType: 'Prototype',
    projectDescription: '',
    problemStatement: '',
    projectObjective: '',
    expectedFunctionality: '',
    requiredFeatures: '',
    requiredTechnologies: '',
    hardwareRequirements: '',
    softwareRequirements: '',
    componentsRequired: '',
    expectedDeliverables: '',
    targetCompletionDate: '',
    projectComplexity: 'Intermediate',
    prototypeRequirements: '',
    budgetMinInr: '',
    budgetMaxInr: '',
    estimatedBudget: '',
    specialRequirements: '',
  });

  const [flags, setFlags] = useState({
    needHardware: true,
    needSoftware: true,
    needPcb: false,
    need3dPrinting: false,
    needAiMl: false,
    needIot: false,
    needPrototype: true,
    needMobileWebApp: false,
    needDocumentation: true,
    needPpt: false,
    needResearchPaper: false,
    consultationMode: 'Phone / WhatsApp / Video Call',
    acceptedTerms: false,
    acceptedPrivacyPolicy: false,
  });

  useEffect(() => {
    if (dbUser) {
      setForm((prev) => ({
        ...prev,
        customerName: prev.customerName || dbUser.fullName,
        customerEmail: prev.customerEmail || dbUser.email,
        customerPhone: prev.customerPhone || dbUser.mobile,
        whatsappNumber: prev.whatsappNumber || dbUser.mobile,
        companyOrCollege: prev.companyOrCollege || dbUser.companyOrCollege,
      }));
    }
  }, [dbUser]);

  const loadAddresses = async () => {
    if (!isSignedIn) return;
    try {
      const me = await apiFetch<{ addresses: AddressData[] }>('/api/me');
      setAddresses(me.addresses || []);
      if (me.addresses?.length > 0 && !billingAddress) {
        const def = me.addresses.find((a) => a.isDefault) || me.addresses[0];
        setBillingAddress(def);
        setDeliveryAddress(def);
        setForm((prev) => ({
          ...prev,
          city: prev.city || def.city || '',
          state: prev.state || def.state || '',
        }));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAddresses();
  }, [isSignedIn]);

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const valid: Array<{ file: File; docType: string }> = [];
    for (const file of Array.from(incoming)) {
      if (file.size > 80 * 1024 * 1024) {
        notify(`File "${file.name}" exceeds the 80 MB limit.`, 'error');
        continue;
      }
      valid.push({ file, docType: selectedDocType });
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 12));
  };

  const validateStep = (targetStep: number): boolean => {
    if (step === 1 && targetStep > 1) {
      if (!form.customerName.trim() || !form.customerEmail.trim() || !form.customerPhone.trim()) {
        notify('Please enter Full Name, Email Address, and Mobile Number.', 'error');
        return false;
      }
      if (!form.city.trim() || !form.state.trim()) {
        notify('Please enter your City and State.', 'error');
        return false;
      }
      const finalDelivery = sameAddress ? billingAddress : deliveryAddress;
      if (!billingAddress || !finalDelivery) {
        notify('Please select or add both Billing and Delivery addresses.', 'error');
        return false;
      }
    }
    if (step === 2 && targetStep > 2) {
      if (!form.projectTitle.trim() || !form.projectDescription.trim()) {
        notify('Please enter Project Title and Project Description.', 'error');
        return false;
      }
    }
    return true;
  };

  const goStep = (next: 1 | 2 | 3 | 4 | 5) => {
    if (!validateStep(next)) return;
    setStep(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      openAuthModal('login');
      return;
    }
    const finalDelivery = sameAddress ? billingAddress : deliveryAddress;
    if (!billingAddress || !finalDelivery) {
      notify('Please select or save both Billing and Delivery addresses.', 'error');
      return;
    }
    if (!flags.acceptedTerms || !flags.acceptedPrivacyPolicy) {
      notify('Please accept both Terms & Conditions and Privacy Policy before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const budgetSummary =
        form.budgetMinInr || form.budgetMaxInr
          ? `₹${form.budgetMinInr || '0'} – ₹${form.budgetMaxInr || 'Flexible'}`
          : form.estimatedBudget;

      const fd = new FormData();
      Object.entries({
        ...form,
        estimatedBudget: budgetSummary,
        engineeringBranch: form.engineeringDomain || form.engineeringBranch,
      }).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append('flags', JSON.stringify(flags));
      fd.append('acceptedTerms', String(flags.acceptedTerms));
      fd.append('acceptedPrivacyPolicy', String(flags.acceptedPrivacyPolicy));
      fd.append('billingAddress', JSON.stringify(billingAddress));
      fd.append('deliveryAddress', JSON.stringify(finalDelivery));
      fd.append(
        'documentCategories',
        JSON.stringify(files.map((item) => ({ name: item.file.name, category: item.docType })))
      );
      files.forEach((item) => fd.append('attachments', item.file));

      const res = await apiFetch<{ enquiry: { enquiryNumber: string }; projectRegistrationId?: string }>(
        '/api/project-enquiries',
        {
          method: 'POST',
          body: fd,
        }
      );
      const regId = res.projectRegistrationId || res.enquiry.enquiryNumber;
      setSubmittedCode(regId);
      notify(`Project ${regId} registered! Status: Submitted – Under Review.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to register project.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const stepsMeta: Array<{ num: 1 | 2 | 3 | 4 | 5; label: string }> = [
    { num: 1, label: 'A. Customer Info' },
    { num: 2, label: 'B. Project Details' },
    { num: 3, label: 'D. Project Documents' },
    { num: 4, label: 'C. Budget & Specs' },
    { num: 5, label: 'E. Review & Submit' },
  ];

  const finalDelivery = sameAddress ? billingAddress : deliveryAddress;

  return (
    <div className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="space-y-2 border-b border-[#DCEAF5] pb-6">
          <div className="text-xs font-semibold text-[#42A5F5]">
            Custom Engineering Project Development &amp; Prototyping
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#123B5D]">
            Register Your Project
          </h1>
          <p className="text-sm sm:text-base text-[#263746]">
            Submit your complete engineering requirements and technical documents. Our team reviews feasibility, prepares an itemized cost quotation, and tracks development end-to-end in your dashboard.
          </p>
        </div>

        {!isSignedIn ? (
          <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-10 text-center space-y-5">
            <h2 className="font-display text-xl font-bold text-[#123B5D]">Customer Email OTP Sign-In Required</h2>
            <p className="text-sm text-[#263746] max-w-md mx-auto">
              Verify your email with a 6-digit OTP to register your project, securely upload supporting documents, receive quotations, and track milestones.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Continue with Email OTP
              </button>
            </div>
          </div>
        ) : submittedCode ? (
          <div className="rounded-2xl border border-[#90CAF9] bg-[#F0F8FF] p-8 space-y-4">
            <div className="flex items-center gap-2.5 text-[#123B5D] font-display text-2xl font-bold">
              <CheckCircle2 className="w-7 h-7 text-[#42A5F5]" />
              Project Registered Successfully
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white rounded-xl border border-[#DCEAF5] p-4 text-xs">
              <div>
                <div className="text-[#263746]/70">Unique Project Registration ID</div>
                <div className="font-mono text-base font-bold text-[#123B5D] mt-0.5">{submittedCode}</div>
              </div>
              <div>
                <div className="text-[#263746]/70">Current Project Status</div>
                <div className="font-semibold text-[#42A5F5] text-sm mt-0.5">Submitted – Under Review</div>
              </div>
            </div>
            <p className="text-sm text-[#263746] leading-relaxed">
              An acknowledgement email has been dispatched to <span className="font-mono">{form.customerEmail}</span>. Your project is now queued for our engineering review team. Once reviewed, an itemized quotation (50% Advance / 50% Final Balance) will be published to your My Projects dashboard.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={() => navigate('/my-account/project-enquiries')}
                className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Open My Projects Dashboard
              </button>
              <button
                onClick={() => navigate('/services')}
                className="px-5 py-2.5 border border-[#90CAF9] text-[#123B5D] hover:bg-white text-sm font-semibold rounded-lg bg-white transition-colors"
              >
                Back to Services
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 5-Step Progress Header */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {stepsMeta.map((s) => (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => {
                    if (s.num <= step || validateStep(s.num)) setStep(s.num);
                  }}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    step === s.num
                      ? 'border-[#64B5F6] bg-[#F0F8FF] text-[#123B5D] shadow-sm'
                      : s.num < step
                      ? 'border-[#90CAF9] bg-[#F0F8FF]/60 text-[#123B5D]'
                      : 'border-[#DCEAF5] bg-white text-[#263746]/70 hover:bg-[#F0F8FF]/40'
                  }`}
                >
                  <div className="font-mono text-[11px] font-semibold">SECTION {s.num} / 5</div>
                  <div className="text-xs font-semibold mt-0.5 truncate">{s.label}</div>
                </button>
              ))}
            </div>

          {/* SECTION A: CUSTOMER INFORMATION */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-5 shadow-sm">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">
                  Section A. Customer Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Full Name *</label>
                    <input
                      required
                      placeholder="Full Name *"
                      value={form.customerName}
                      onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Email Address *</label>
                    <input
                      required
                      type="email"
                      placeholder="Email Address *"
                      value={form.customerEmail}
                      onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Mobile Number *</label>
                    <input
                      required
                      placeholder="Mobile Number *"
                      value={form.customerPhone}
                      onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">WhatsApp Number</label>
                    <input
                      placeholder="WhatsApp Number (for quick project updates)"
                      value={form.whatsappNumber}
                      onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">
                      College / University / Company Name
                    </label>
                    <input
                      placeholder="Institution or Organization Name"
                      value={form.companyOrCollege}
                      onChange={(e) => setForm({ ...form, companyOrCollege: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Department</label>
                    <input
                      placeholder="e.g. ECE, CSE, Mechanical, Robotics R&D"
                      value={form.courseDepartment}
                      onChange={(e) => setForm({ ...form, courseDepartment: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">City *</label>
                    <input
                      required
                      placeholder="City *"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">State *</label>
                    <input
                      required
                      placeholder="State *"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Customer Category *</label>
                    <select
                      value={form.customerCategory}
                      onChange={(e) => setForm({ ...form, customerCategory: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {CUSTOMER_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Team Structure</label>
                    <select
                      value={form.teamType}
                      onChange={(e) => setForm({ ...form, teamType: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="Individual">Individual</option>
                      <option value="Student Group">Student Group</option>
                      <option value="Enterprise Team">Startup / R&D Team</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Team Members</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={form.teamCount}
                      onChange={(e) => setForm({ ...form, teamCount: Math.max(1, Number(e.target.value)) })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">
                  Billing &amp; Hardware Delivery Addresses
                </h2>
                <AddressSelector
                  title="Billing Address"
                  addresses={addresses}
                  selected={billingAddress}
                  onSelect={(addr) => {
                    setBillingAddress(addr);
                    if (addr) {
                      setForm((prev) => ({
                        ...prev,
                        city: prev.city || addr.city || '',
                        state: prev.state || addr.state || '',
                      }));
                    }
                  }}
                  onAddressSaved={loadAddresses}
                />
                <label className="flex items-center gap-2 text-xs font-medium text-[#263746]">
                  <input
                    type="checkbox"
                    checked={sameAddress}
                    onChange={(e) => setSameAddress(e.target.checked)}
                    className="accent-[#64B5F6]"
                  />
                  Project delivery address is the same as billing address
                </label>
                {!sameAddress && (
                  <AddressSelector
                    title="Project Delivery Address"
                    addresses={addresses}
                    selected={deliveryAddress}
                    onSelect={setDeliveryAddress}
                    onAddressSaved={loadAddresses}
                  />
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => goStep(2)}
                  className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  Continue to Project Information <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* SECTION B: PROJECT INFORMATION */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-5 shadow-sm">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">
                  Section B. Project Information
                </h2>

                <div>
                  <label className="block text-xs font-medium text-[#263746] mb-1">Project Title *</label>
                  <input
                    required
                    placeholder="Concise title describing your project or product *"
                    value={form.projectTitle}
                    onChange={(e) => setForm({ ...form, projectTitle: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Project Category *</label>
                    <select
                      value={form.projectCategory}
                      onChange={(e) => setForm({ ...form, projectCategory: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {PROJECT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Engineering Domain *</label>
                    <input
                      placeholder="e.g. UAV Avionics, Edge AI, Embedded"
                      value={form.engineeringDomain}
                      onChange={(e) => setForm({ ...form, engineeringDomain: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Project Type *</label>
                    <select
                      value={form.projectType}
                      onChange={(e) => setForm({ ...form, projectType: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {PROJECT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#263746] mb-1">Project Description *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Detailed overview of what needs to be built, use cases, and environment *"
                    value={form.projectDescription}
                    onChange={(e) => setForm({ ...form, projectDescription: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Problem Statement</label>
                    <textarea
                      rows={3}
                      placeholder="Core technical or industrial problem this project solves"
                      value={form.problemStatement}
                      onChange={(e) => setForm({ ...form, problemStatement: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Objective of the Project</label>
                    <textarea
                      rows={3}
                      placeholder="Key engineering objectives & measurable targets"
                      value={form.projectObjective}
                      onChange={(e) => setForm({ ...form, projectObjective: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Expected Working</label>
                    <textarea
                      rows={3}
                      placeholder="Step-by-step operational flow / how the system should work"
                      value={form.expectedFunctionality}
                      onChange={(e) => setForm({ ...form, expectedFunctionality: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">
                      Required Features and Functionalities
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Specific user-facing features, automation triggers, telemetry, alerts"
                      value={form.requiredFeatures}
                      onChange={(e) => setForm({ ...form, requiredFeatures: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">
                      Preferred Technology / Programming Language
                    </label>
                    <input
                      placeholder="e.g. Python, C/C++, ROS2, React, Flutter, STM32, ESP32"
                      value={form.requiredTechnologies}
                      onChange={(e) => setForm({ ...form, requiredTechnologies: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Expected Output</label>
                    <input
                      placeholder="e.g. Tested working model, Android dashboard, CAD files, Report"
                      value={form.expectedDeliverables}
                      onChange={(e) => setForm({ ...form, expectedDeliverables: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Hardware Requirements</label>
                    <textarea
                      rows={2}
                      placeholder="Microcontrollers, motors, batteries, enclosures..."
                      value={form.hardwareRequirements}
                      onChange={(e) => setForm({ ...form, hardwareRequirements: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Software Requirements</label>
                    <textarea
                      rows={2}
                      placeholder="Mobile app, web portal, ML model, cloud backend..."
                      value={form.softwareRequirements}
                      onChange={(e) => setForm({ ...form, softwareRequirements: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Components Required</label>
                    <textarea
                      rows={2}
                      placeholder="Specific sensors, modules, PCBs or actuators..."
                      value={form.componentsRequired}
                      onChange={(e) => setForm({ ...form, componentsRequired: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-[#123B5D]">Project Deliverable Flags</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      ['needPrototype', 'Working physical prototype required'],
                      ['needMobileWebApp', 'Mobile application or web application required'],
                      ['needDocumentation', 'Documentation and project report required'],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2.5 p-3 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] cursor-pointer font-medium text-[#123B5D]"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean((flags as any)[key])}
                          onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
                          className="accent-[#64B5F6]"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => goStep(3)}
                  className="px-6 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  Continue to Document Uploads <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* SECTION D: UPLOAD PROJECT DOCUMENTS (OPTIONAL) */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">
                    Section D. Upload Project Documents
                  </h2>
                  <span className="px-2.5 py-1 rounded bg-[#F0F8FF] border border-[#90CAF9] text-[#123B5D] text-xs font-semibold">
                    Optional — You can submit without attaching files
                  </span>
                </div>
                <p className="text-xs text-[#263746]">
                  Optionally upload Reference PDFs, Images, Circuit Diagrams, Research Papers, Reference Videos, CAD Files (.stl/.step/.dwg), Project Specifications, or Other Supporting Documents (up to 12 files, max 80 MB each). Attachments are completely optional.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-semibold text-[#123B5D]">Document Category for Next Upload (Optional):</label>
                  <select
                    value={selectedDocType}
                    onChange={(e) => setSelectedDocType(e.target.value)}
                    className="rounded-lg border border-[#DCEAF5] px-3 py-1.5 text-xs bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  >
                    {DOC_TYPES.map((dt) => (
                      <option key={dt} value={dt}>{dt}</option>
                    ))}
                  </select>
                </div>

                <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-[#90CAF9] rounded-xl p-8 cursor-pointer bg-[#F0F8FF]/50 hover:bg-[#F0F8FF] text-sm text-[#263746] transition-colors">
                  <Upload className="w-6 h-6 text-[#42A5F5]" />
                  <span className="font-medium text-[#123B5D]">
                    Click to attach supporting project files — Optional ({files.length}/12 selected)
                  </span>
                  <span className="text-[11px] text-[#263746]/70 font-mono">
                    PDF · Images · Circuit Diagrams · Research Papers · Videos · CAD (.STL/.STEP/.DWG) · ZIP
                  </span>
                  <input
                    type="file"
                    multiple
                    accept={ALLOWED_DOC_ACCEPT}
                    onChange={(e) => {
                      handleAddFiles(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>

                {files.length > 0 && (
                  <div className="divide-y divide-[#DCEAF5] text-xs border border-[#DCEAF5] rounded-lg px-4">
                    {files.map((item, i) => (
                      <div key={i} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono text-[#123B5D] font-semibold">{item.file.name}</span>
                          <span className="ml-2 px-2 py-0.5 rounded bg-[#F0F8FF] text-[#123B5D] border border-[#DCEAF5] text-[10px] font-semibold">
                            {item.docType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[#263746]/70">{(item.file.size / 1024).toFixed(1)} KB</span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                            className="text-red-600 hover:underline font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => goStep(4)}
                  className="px-6 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  Continue to Budget &amp; Complexity <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* SECTION C: PROJECT REQUIREMENTS AND BUDGET */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">
                  Section C. Project Requirements and Budget
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Minimum Expected Budget (₹ INR)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 15000"
                      value={form.budgetMinInr}
                      onChange={(e) => setForm({ ...form, budgetMinInr: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Maximum Expected Budget (₹ INR)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 45000"
                      value={form.budgetMaxInr}
                      onChange={(e) => setForm({ ...form, budgetMaxInr: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">
                      Preferred Completion Date
                    </label>
                    <input
                      type="date"
                      value={form.targetCompletionDate}
                      onChange={(e) => setForm({ ...form, targetCompletionDate: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Project Complexity</label>
                    <select
                      value={form.projectComplexity}
                      onChange={(e) => setForm({ ...form, projectComplexity: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {COMPLEXITY_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#263746] mb-1">Prototype Requirements</label>
                    <textarea
                      rows={3}
                      placeholder="Enclosure specs, battery backup, dimensions, operating range, field conditions..."
                      value={form.prototypeRequirements}
                      onChange={(e) => setForm({ ...form, prototypeRequirements: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#263746] mb-1">
                        Preferred Communication Method
                      </label>
                      <select
                        value={flags.consultationMode}
                        onChange={(e) => setFlags({ ...flags, consultationMode: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] px-3.5 py-2.5 text-sm bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="Phone / WhatsApp / Video Call">Phone / WhatsApp / Video Call</option>
                        <option value="WhatsApp Messaging">WhatsApp Messaging</option>
                        <option value="Online Video Call">Online Video Call</option>
                        <option value="Email">Email</option>
                        <option value="In-Person (Nagpur Office)">In-Person (Nagpur Office)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#263746] mb-1">Additional Requirements</label>
                      <input
                        placeholder="College viva support, patent filing assistance, bulk manufacturing..."
                        value={form.specialRequirements}
                        onChange={(e) => setForm({ ...form, specialRequirements: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#123B5D]">Additional Engineering Scope Options</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    {[
                      ['needHardware', 'Hardware Build'],
                      ['needSoftware', 'Software / Firmware'],
                      ['needPcb', 'Custom PCB Design'],
                      ['need3dPrinting', '3D Printing / CAD'],
                      ['needAiMl', 'AI / ML Model'],
                      ['needIot', 'IoT & Cloud'],
                      ['needPpt', 'Presentation (PPT)'],
                      ['needResearchPaper', 'Research Paper Support'],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] text-[#123B5D] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean((flags as any)[key])}
                          onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
                          className="accent-[#64B5F6]"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => goStep(5)}
                  className="px-6 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  Review &amp; Final Submission <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* SECTION E: FINAL SUBMISSION */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 sm:p-8 space-y-5 text-sm shadow-sm">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">
                  Section E. Final Review &amp; Submit Project for Review
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  <div className="space-y-2 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4">
                    <div className="font-semibold text-[#123B5D]">Customer &amp; Organization</div>
                    <div className="text-[#263746]">
                      {form.customerName} ({form.customerCategory}) · {form.customerPhone}
                    </div>
                    {form.whatsappNumber && (
                      <div className="text-[#263746] font-mono">WhatsApp: {form.whatsappNumber}</div>
                    )}
                    <div className="text-[#263746]">{form.customerEmail}</div>
                    <div className="text-[#263746]">
                      {form.city}, {form.state}
                      {form.companyOrCollege ? ` · ${form.companyOrCollege}` : ''}
                      {form.courseDepartment ? ` (${form.courseDepartment})` : ''}
                    </div>
                    {finalDelivery && (
                      <div className="pt-2 border-t border-[#DCEAF5] text-[#263746]">
                        Delivery: {finalDelivery.houseFlat}, {finalDelivery.streetArea}, {finalDelivery.city}, {finalDelivery.state} — {finalDelivery.pinCode}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4">
                    <div className="font-semibold text-[#123B5D]">Project Summary</div>
                    <div className="font-semibold text-[#42A5F5]">{form.projectTitle}</div>
                    <div className="text-[#263746]">
                      {form.projectCategory} · {form.engineeringDomain} · {form.projectType} ({form.projectComplexity})
                    </div>
                    <div className="text-[#263746] font-mono">
                      Budget:{' '}
                      {form.budgetMinInr || form.budgetMaxInr
                        ? `₹${form.budgetMinInr || '0'} – ₹${form.budgetMaxInr || 'Flexible'}`
                        : 'Open to Quotation'}
                      {form.targetCompletionDate ? ` · Target: ${form.targetCompletionDate}` : ''}
                    </div>
                    <div className="text-[#263746]">
                      Prototype: {flags.needPrototype ? 'Yes' : 'No'} · Web/Mobile App: {flags.needMobileWebApp ? 'Yes' : 'No'} · Report/Docs: {flags.needDocumentation ? 'Yes' : 'No'}
                    </div>
                    <div className="text-[#263746]">
                      Documents Attached: {files.length} file(s) · Communication: {flags.consultationMode}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] text-xs text-[#263746] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={flags.acceptedTerms}
                      onChange={(e) => setFlags({ ...flags, acceptedTerms: e.target.checked })}
                      className="mt-0.5 accent-[#64B5F6]"
                    />
                    <span>
                      I accept the{' '}
                      <button
                        type="button"
                        onClick={() => navigate('/terms-and-conditions')}
                        className="text-[#42A5F5] underline font-medium"
                      >
                        Terms and Conditions
                      </button>{' '}
                      of NEXUSTEKFUSION PRIVATE LIMITED including engineering review, 50% advance / 50% final payment terms, and quotation validity rules. *
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] text-xs text-[#263746] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={flags.acceptedPrivacyPolicy}
                      onChange={(e) => setFlags({ ...flags, acceptedPrivacyPolicy: e.target.checked })}
                      className="mt-0.5 accent-[#64B5F6]"
                    />
                    <span>
                      I accept the{' '}
                      <button
                        type="button"
                        onClick={() => navigate('/privacy-policy')}
                        className="text-[#42A5F5] underline font-medium"
                      >
                        Privacy Policy
                      </button>{' '}
                      and consent to NEXUSTEKFUSION PRIVATE LIMITED storing my project specifications and supporting documents securely for technical review. *
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Uploading Documents & Submitting...' : 'Submit Project for Review'}
                </button>
              </div>
            </div>
          )}
          </form>
        )}
      </div>
    </div>
  );
};
