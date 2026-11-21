import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Compass,
  CreditCard,
  FileCheck2,
  LocateFixed,
  MapPin,
  Navigation,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Upload,
  Wallet,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getSupabaseClient } from '../lib/supabase';
import { GeoMap } from '../components/GeoMap';
import { RazorpayCheckoutModal } from '../components/RazorpayCheckoutModal';
import {
  DronePilotProfile,
  FarmerFarm,
  FarmerProfile,
  KrashivantriOpsConfig,
  PenaltyRecord,
  PilotAvailability,
  PilotBankAccount,
  PilotDrone,
  PilotPayout,
  ServiceBooking,
} from '../types/platform';

async function openAuthenticatedFile(
  url: string,
  filename: string,
  getToken: () => Promise<string | null>,
  onError: (msg: string) => void
) {
  try {
    const headers = new Headers();
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const resp = await fetch(url, { headers, credentials: 'same-origin' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to download file.');
    }
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch (err: any) {
    onError(err?.message || 'Unable to download document.');
  }
}

/* ============================================================================
 * FARMER PORTAL (/krashivantri/farmer-portal)
 * ============================================================================ */
export const FarmerPortalPage: React.FC = () => {
  const { isSignedIn, openAuthModal, getIdToken, dbUser, apiFetch, notify, navigate, supabaseConfigured } = usePlatform();
  const [tab, setTab] = useState<'overview' | 'farms' | 'book' | 'tracking'>('overview');
  const [loading, setLoading] = useState(true);

  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [farms, setFarms] = useState<FarmerFarm[]>([]);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);
  const [opsConfig, setOpsConfig] = useState<KrashivantriOpsConfig | null>(null);

  // Registration form
  const [regForm, setRegForm] = useState({
    fullName: '',
    mobile: '',
    email: '',
    village: '',
    taluka: '',
    district: '',
    state: 'Maharashtra',
    pinCode: '',
    aadhaarLast4: '',
    totalLandAcres: '',
    cropsGrown: '',
  });
  const [savingReg, setSavingReg] = useState(false);

  // KYC Upload
  const [docType, setDocType] = useState('Aadhaar');
  const [docNumberMasked, setDocNumberMasked] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Farm Polygon Creation
  const [mapMode, setMapMode] = useState<'pick_center' | 'draw_polygon'>('pick_center');
  const [draftCenter, setDraftCenter] = useState<{ lat: number; lng: number } | null>({
    lat: 21.1458,
    lng: 79.0882,
  });
  const [draftPolygon, setDraftPolygon] = useState<Array<{ lat: number; lng: number }>>([]);
  const [farmForm, setFarmForm] = useState({
    farmName: '',
    cropType: 'Cotton / Soybean',
    areaAcres: '5',
    village: '',
    district: '',
    state: 'Maharashtra',
    pinCode: '',
  });
  const [savingFarm, setSavingFarm] = useState(false);

  // Booking form
  const [bookForm, setBookForm] = useState({
    farmId: '',
    cropType: 'Soybean',
    sprayType: 'Pesticide & Fungicide Spraying',
    chemicalProvidedBy: 'Farmer',
    bookedAreaAcres: '5',
    preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    preferredSlot: 'Morning (6 AM - 10 AM)',
    farmerNotes: '',
  });
  const [creatingBooking, setCreatingBooking] = useState(false);

  // Payment modal
  const [payBooking, setPayBooking] = useState<ServiceBooking | null>(null);

  // Live Tracking
  const [trackBookingId, setTrackBookingId] = useState<number | null>(null);
  const [liveTrackData, setLiveTrackData] = useState<any>(null);
  const [androidOperators, setAndroidOperators] = useState<any[]>([]);
  const [disputeBookingId, setDisputeBookingId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const loadFarmer = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/farmer/me');
      setFarmer(res.farmer || null);
      setDocuments(res.documents || []);
      setFarms(res.farms || []);
      setBookings(res.bookings || []);
      setPayments(res.payments || []);
      setRefunds(res.refunds || []);
      setPenalties(res.penalties || []);
      setOpsConfig(res.opsConfig || null);

      if (res.farmer) {
        setRegForm({
          fullName: res.farmer.fullName || '',
          mobile: res.farmer.mobile || '',
          email: res.farmer.email || '',
          village: res.farmer.village || '',
          taluka: res.farmer.taluka || '',
          district: res.farmer.district || '',
          state: res.farmer.state || 'Maharashtra',
          pinCode: res.farmer.pinCode || '',
          aadhaarLast4: res.farmer.aadhaarLast4 || '',
          totalLandAcres: String(res.farmer.totalLandAcres || ''),
          cropsGrown: res.farmer.cropsGrown || '',
        });
      } else {
        setRegForm((prev) => ({
          ...prev,
          fullName: prev.fullName || dbUser?.fullName || '',
          email: prev.email || dbUser?.email || '',
          mobile: prev.mobile || dbUser?.mobile || '',
        }));
      }
      if ((res.farms || []).length > 0 && !bookForm.farmId) {
        setBookForm((prev) => ({ ...prev, farmId: String(res.farms[0].id) }));
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to load Farmer Portal.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, apiFetch, dbUser?.fullName, dbUser?.email, dbUser?.mobile, notify]);

  useEffect(() => {
    loadFarmer();
  }, [loadFarmer]);

  const fetchLiveTracking = useCallback(
    async (bookingId: number) => {
      try {
        const res = await apiFetch(`/api/farmer/bookings/${bookingId}/live-tracking`);
        setLiveTrackData(res);
      } catch (err: any) {
        notify(err?.message || 'Unable to refresh live tracking.', 'error');
      }
    },
    [apiFetch, notify]
  );

  useEffect(() => {
    const loadOperators = () => {
      apiFetch<{ operatorLocations: any[] }>('/api/krashivantri/android-operators')
        .then((res) => setAndroidOperators(res.operatorLocations || []))
        .catch(() => {});
    };
    loadOperators();
    const supabase = getSupabaseClient();
    const ch = supabase
      ? supabase
          .channel('krashivantri-farmer-operators')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'operator_locations' }, loadOperators)
          .subscribe()
      : null;

    let timer: number | undefined;
    if (trackBookingId && tab === 'tracking') {
      fetchLiveTracking(trackBookingId);
      timer = window.setInterval(() => fetchLiveTracking(trackBookingId), 12000);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      if (ch && supabase) supabase.removeChannel(ch);
    };
  }, [trackBookingId, tab, fetchLiveTracking, apiFetch, supabaseConfigured]);

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <Sprout className="w-10 h-10 text-[#42A5F5] mx-auto" />
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">KRASHIVANTRI Farmer Portal</h1>
        <p className="text-sm text-[#263746]/80">
          Sign in to register your farmer KYC profile, map your agricultural land on OpenStreetMap, book drone spraying services, and track certified drone pilots live.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          Sign In / Register to Continue
        </button>
      </div>
    );
  }

  const handleSaveRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingReg(true);
    try {
      await apiFetch('/api/farmer/register', {
        method: 'POST',
        body: JSON.stringify({
          ...regForm,
          totalLandAcres: Number(regForm.totalLandAcres || 0),
        }),
      });
      notify('Farmer profile saved and queued for admin KYC review.', 'success');
      loadFarmer();
    } catch (err: any) {
      notify(err?.message || 'Failed to save farmer profile.', 'error');
    } finally {
      setSavingReg(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile) {
      notify('Select a document image or PDF first.', 'error');
      return;
    }
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('docType', docType);
      fd.append('docNumberMasked', docNumberMasked);
      await apiFetch('/api/farmer/documents', { method: 'POST', body: fd });
      setDocFile(null);
      setDocNumberMasked('');
      notify('KYC document uploaded.', 'success');
      loadFarmer();
    } catch (err: any) {
      notify(err?.message || 'Upload failed.', 'error');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleUseCurrentLocationForFarm = () => {
    if (!navigator.geolocation) {
      notify('Browser geolocation is unavailable on this device.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraftCenter({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        notify('Farm pin centered on your device GPS coordinates.', 'success');
      },
      (err) => {
        notify(`GPS unavailable: ${err.message}`, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftCenter) {
      notify('Click the map to place the farm center coordinate.', 'error');
      return;
    }
    setSavingFarm(true);
    try {
      await apiFetch('/api/farmer/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...farmForm,
          areaAcres: Number(farmForm.areaAcres || 1),
          centerLat: draftCenter.lat,
          centerLng: draftCenter.lng,
          boundaryGeoJson: draftPolygon,
        }),
      });
      setFarmForm({
        farmName: '',
        cropType: 'Cotton / Soybean',
        areaAcres: '5',
        village: '',
        district: '',
        state: 'Maharashtra',
        pinCode: '',
      });
      setDraftPolygon([]);
      notify('Farm plot and GPS boundary saved.', 'success');
      loadFarmer();
    } catch (err: any) {
      notify(err?.message || 'Failed to add farm.', 'error');
    } finally {
      setSavingFarm(false);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingBooking(true);
    try {
      const selectedFarm = farms.find((f) => String(f.id) === String(bookForm.farmId));
      const res = await apiFetch<{ booking: ServiceBooking }>('/api/farmer/bookings', {
        method: 'POST',
        body: JSON.stringify({
          ...bookForm,
          farmId: selectedFarm ? selectedFarm.id : null,
          farmLat: selectedFarm?.centerLat ?? draftCenter?.lat,
          farmLng: selectedFarm?.centerLng ?? draftCenter?.lng,
          farmBoundary: selectedFarm?.boundaryGeoJson || [],
          bookedAreaAcres: Number(bookForm.bookedAreaAcres),
        }),
      });
      notify(`Booking ${res.booking.bookingNumber} created. Complete Razorpay payment to dispatch a pilot.`, 'success');
      await loadFarmer();
      setTab('tracking');
      setPayBooking(res.booking);
    } catch (err: any) {
      notify(err?.message || 'Booking creation failed.', 'error');
    } finally {
      setCreatingBooking(false);
    }
  };

  const handleConfirmOrDispute = async (bookingId: number, action: 'confirm' | 'dispute') => {
    try {
      await apiFetch(`/api/farmer/bookings/${bookingId}/confirm-completion`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: action === 'dispute' ? disputeReason : '',
        }),
      });
      notify(action === 'confirm' ? 'Spraying completion confirmed.' : 'Dispute submitted for admin review.', 'info');
      setDisputeBookingId(null);
      setDisputeReason('');
      loadFarmer();
      if (trackBookingId === bookingId) fetchLiveTracking(bookingId);
    } catch (err: any) {
      notify(err?.message || 'Action failed.', 'error');
    }
  };

  const rateInr = opsConfig?.baseRatePerAcreInr ?? 500;
  const estTotalInr = Math.round(Number(bookForm.bookedAreaAcres || 0) * rateInr);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DCEAF5] pb-6">
        <div className="space-y-1">
          <div className="text-xs font-mono font-semibold text-[#42A5F5] uppercase tracking-wider">
            KRASHIVANTRI Agricultural Services · Farmer Operations
          </div>
          <h1 className="font-display text-3xl font-bold text-[#123B5D]">
            {farmer ? `${farmer.fullName} (${farmer.farmerCode})` : 'Farmer Registration & Spraying Portal'}
          </h1>
          <div className="text-xs text-[#263746]/80 flex flex-wrap items-center gap-2 font-mono">
            <span>KYC Status: <strong className="text-[#123B5D]">{farmer?.kycStatus || 'Not Registered'}</strong></span>
            <span>·</span>
            <span>Account: <strong className="text-[#123B5D]">{farmer?.accountStatus || 'pending'}</strong></span>
            <span>·</span>
            <span>Spraying Rate: <strong className="text-[#123B5D] tabular-nums">₹{rateInr}/acre</strong></span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/krashivantri')}
            className="px-4 py-2 border border-[#90CAF9] bg-white rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
          >
            KRASHIVANTRI Overview
          </button>
          <button
            onClick={() => navigate('/krashivantri/pilot-portal')}
            className="px-4 py-2 border border-[#90CAF9] bg-white rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
          >
            Drone Pilot Portal
          </button>
        </div>
      </div>

      {farmer?.rejectionReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> KYC Notice / Rejection Reason
          </div>
          <p>{farmer.rejectionReason}</p>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-[#F0F8FF] rounded-xl border border-[#DCEAF5]">
        {[
          ['overview', 'Profile & KYC Documents'],
          ['farms', `My Farms (${farms.length})`],
          ['book', 'Book Drone Spraying'],
          ['tracking', `Bookings & Live Tracking (${bookings.length})`],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              tab === k
                ? 'bg-[#64B5F6] text-white shadow-sm'
                : 'text-[#263746]/80 hover:text-[#123B5D] hover:bg-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-sm text-[#263746]/70">Loading farmer operations data...</div>
      ) : (
        <div className="space-y-8">
          {/* TAB 1: PROFILE & KYC */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSaveRegistration}
                className="lg:col-span-7 rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-[#123B5D]">
                  {farmer ? 'Farmer KYC & Land Profile' : 'Register Farmer Account'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <input
                    required
                    placeholder="Full Name *"
                    value={regForm.fullName}
                    onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    placeholder="Mobile Number *"
                    value={regForm.mobile}
                    onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="Village"
                    value={regForm.village}
                    onChange={(e) => setRegForm({ ...regForm, village: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="Taluka / Tehsil"
                    value={regForm.taluka}
                    onChange={(e) => setRegForm({ ...regForm, taluka: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    placeholder="District *"
                    value={regForm.district}
                    onChange={(e) => setRegForm({ ...regForm, district: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="State"
                    value={regForm.state}
                    onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="6-Digit PIN Code"
                    value={regForm.pinCode}
                    onChange={(e) => setRegForm({ ...regForm, pinCode: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    maxLength={4}
                    placeholder="Aadhaar Last 4 Digits"
                    value={regForm.aadhaarLast4}
                    onChange={(e) => setRegForm({ ...regForm, aadhaarLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Total Agricultural Land (Acres)"
                    value={regForm.totalLandAcres}
                    onChange={(e) => setRegForm({ ...regForm, totalLandAcres: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="Primary Crops (e.g. Soybean, Cotton, Citrus)"
                    value={regForm.cropsGrown}
                    onChange={(e) => setRegForm({ ...regForm, cropsGrown: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingReg}
                  className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {savingReg ? 'Saving...' : farmer ? 'Update Farmer Profile' : 'Submit Farmer Registration'}
                </button>
              </form>

              <div className="lg:col-span-5 rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">KYC & Land Documents</h2>
                {!farmer ? (
                  <p className="text-xs text-[#263746]/70">Save your farmer registration details first to upload KYC documents.</p>
                ) : (
                  <>
                    <form onSubmit={handleUploadDoc} className="space-y-3 text-xs border-b border-[#DCEAF5] pb-4">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                          className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        >
                          <option value="Aadhaar">Aadhaar Card (Masked)</option>
                          <option value="7/12 Extract">7/12 Land Extract / Patta</option>
                          <option value="Kisan ID">Kisan Credit / Farmer ID</option>
                        </select>
                        <input
                          placeholder="Masked Ref (e.g. XXXX-1234)"
                          value={docNumberMasked}
                          onChange={(e) => setDocNumberMasked(e.target.value)}
                          className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                        />
                      </div>
                      <label className="flex items-center justify-center gap-2 border border-dashed border-[#90CAF9] bg-[#F0F8FF]/50 rounded-lg p-3.5 cursor-pointer hover:bg-[#F0F8FF] text-[#123B5D] transition-colors">
                        <Upload className="w-4 h-4 text-[#42A5F5]" />
                        <span>{docFile ? docFile.name : 'Choose PDF or Image (.pdf, .jpg, .png)'}</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={uploadingDoc}
                        className="w-full py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                      >
                        {uploadingDoc ? 'Uploading...' : 'Upload KYC Document'}
                      </button>
                    </form>

                    <div className="divide-y divide-[#DCEAF5] text-xs">
                      {documents.length === 0 ? (
                        <p className="text-[#263746]/70 py-2">No documents uploaded yet.</p>
                      ) : (
                        documents.map((doc) => (
                          <div key={doc.id} className="py-2.5 flex items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-[#123B5D]">{doc.docType}</div>
                              <div className="font-mono text-[11px] text-[#263746]/70">
                                {doc.fileName} · {doc.verificationStatus}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                openAuthenticatedFile(
                                  `/api/krashivantri/files/download?path=${encodeURIComponent(doc.storagePath)}`,
                                  doc.fileName,
                                  getIdToken,
                                  (m) => notify(m, 'error')
                                )
                              }
                              className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold hover:bg-[#F0F8FF] transition-colors"
                            >
                              View
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}

                {penalties.length > 0 && (
                  <div className="border-t border-[#DCEAF5] pt-3 space-y-2 text-xs">
                    <div className="font-semibold text-red-800">Account Notices / Penalties</div>
                    {penalties.map((pn) => (
                      <div key={pn.id} className="rounded border border-red-200 bg-red-50 p-2.5">
                        <div className="font-mono font-bold">{pn.penaltyNumber} · ₹{pn.amountInr} ({pn.status})</div>
                        <div>{pn.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FARMS & BOUNDARY MAP */}
          {tab === 'farms' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setMapMode('pick_center')}
                      className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors ${
                        mapMode === 'pick_center'
                          ? 'bg-[#64B5F6] text-white border-[#64B5F6]'
                          : 'bg-white text-[#123B5D] border-[#DCEAF5] hover:bg-[#F0F8FF]'
                      }`}
                    >
                      1. Click Map for Farm Pin
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapMode('draw_polygon')}
                      className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors ${
                        mapMode === 'draw_polygon'
                          ? 'bg-[#64B5F6] text-white border-[#64B5F6]'
                          : 'bg-white text-[#123B5D] border-[#DCEAF5] hover:bg-[#F0F8FF]'
                      }`}
                    >
                      2. Mark Boundary Corners ({draftPolygon.length})
                    </button>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleUseCurrentLocationForFarm}
                      className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <LocateFixed className="w-3.5 h-3.5 text-[#42A5F5]" /> Use Device GPS
                    </button>
                    {draftPolygon.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftPolygon([])}
                        className="px-3 py-1.5 border border-red-200 text-red-700 rounded-lg font-semibold"
                      >
                        Clear Boundary
                      </button>
                    )}
                  </div>
                </div>

                <GeoMap
                  className="h-[420px] w-full rounded-xl border border-[#DCEAF5] overflow-hidden"
                  interactiveMode={mapMode}
                  draftCenter={draftCenter}
                  draftPolygon={draftPolygon}
                  farms={farms.map((f) => ({
                    id: f.id,
                    label: f.farmName,
                    sublabel: `${f.areaAcres} acres · ${f.cropType}`,
                    lat: f.centerLat,
                    lng: f.centerLng,
                    boundary: f.boundaryGeoJson,
                  }))}
                  onPickCenter={(lat, lng) => setDraftCenter({ lat, lng })}
                  onAddPolygonPoint={(pt) => setDraftPolygon((prev) => [...prev, pt])}
                />

                {draftCenter && (
                  <div className="text-xs font-mono text-[#263746]/80">
                    Selected Farm Coordinate: {draftCenter.lat.toFixed(6)}, {draftCenter.lng.toFixed(6)} · Boundary Vertices: {draftPolygon.length}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 space-y-5">
                <form onSubmit={handleSaveFarm} className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3 text-xs">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Add Farm Plot</h2>
                  <input
                    required
                    placeholder="Farm Plot Name (e.g. East Block Gut 42) *"
                    value={farmForm.farmName}
                    onChange={(e) => setFarmForm({ ...farmForm, farmName: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      placeholder="Crop Type *"
                      value={farmForm.cropType}
                      onChange={(e) => setFarmForm({ ...farmForm, cropType: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      required
                      type="number"
                      step="0.25"
                      min="0.25"
                      placeholder="Area (Acres) *"
                      value={farmForm.areaAcres}
                      onChange={(e) => setFarmForm({ ...farmForm, areaAcres: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      placeholder="Village"
                      value={farmForm.village}
                      onChange={(e) => setFarmForm({ ...farmForm, village: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      placeholder="District"
                      value={farmForm.district}
                      onChange={(e) => setFarmForm({ ...farmForm, district: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingFarm || !farmer}
                    className="w-full py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                  >
                    {savingFarm ? 'Saving Farm...' : farmer ? 'Save Farm & Boundary' : 'Register Farmer Profile First'}
                  </button>
                </form>

                <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-5 space-y-3 text-xs">
                  <h3 className="font-display text-base font-bold text-[#123B5D]">Registered Farms</h3>
                  {farms.length === 0 ? (
                    <p className="text-[#263746]/70">No farm plots saved yet.</p>
                  ) : (
                    <div className="divide-y divide-[#DCEAF5]">
                      {farms.map((f) => (
                        <div key={f.id} className="py-2.5 space-y-0.5">
                          <div className="font-semibold text-[#123B5D]">{f.farmName} · {f.areaAcres} acres</div>
                          <div className="font-mono text-[11px] text-[#263746]/70">
                            {f.cropType} · {f.centerLat.toFixed(4)}, {f.centerLng.toFixed(4)} ({f.boundaryGeoJson?.length || 0} pts)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BOOK DRONE SPRAYING */}
          {tab === 'book' && (
            <div className="max-w-3xl rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 sm:p-8 space-y-5">
              <div className="border-b border-[#DCEAF5] pb-4">
                <h2 className="font-display text-xl font-bold text-[#123B5D]">Schedule Drone Spraying Service</h2>
                <p className="text-xs text-[#263746]/80 mt-1">
                  Requires Approved Farmer KYC. Verified Razorpay payment dispatches your booking to an approved DGCA-certified KRASHIVANTRI drone pilot.
                </p>
              </div>

              {farmer?.kycStatus !== 'Approved' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
                  <div className="font-semibold">Farmer KYC Approval Pending</div>
                  <p>
                    Your current KYC status is <strong>{farmer?.kycStatus || 'Not Registered'}</strong>. Once an administrator verifies your KYC documents, spraying bookings unlock automatically.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleCreateBooking} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Select Registered Farm</label>
                      <select
                        value={bookForm.farmId}
                        onChange={(e) => {
                          const f = farms.find((x) => String(x.id) === e.target.value);
                          setBookForm({
                            ...bookForm,
                            farmId: e.target.value,
                            bookedAreaAcres: f ? String(f.areaAcres) : bookForm.bookedAreaAcres,
                            cropType: f?.cropType || bookForm.cropType,
                          });
                        }}
                        className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="">Use Custom / Current Coordinates</option>
                        {farms.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.areaAcres} acres — {f.cropType})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Crop Type *</label>
                      <input
                        required
                        value={bookForm.cropType}
                        onChange={(e) => setBookForm({ ...bookForm, cropType: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Spray Service Type</label>
                      <select
                        value={bookForm.sprayType}
                        onChange={(e) => setBookForm({ ...bookForm, sprayType: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="Pesticide & Fungicide Spraying">Pesticide &amp; Fungicide Spraying</option>
                        <option value="Nano-Urea / Foliar Nutrient Spraying">Nano-Urea / Foliar Nutrient Spraying</option>
                        <option value="Herbicide Precision Spraying">Herbicide Precision Spraying</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Area to Spray (Acres) *</label>
                      <input
                        required
                        type="number"
                        step="0.5"
                        min={opsConfig?.minimumBookingAcres ?? 1}
                        value={bookForm.bookedAreaAcres}
                        onChange={(e) => setBookForm({ ...bookForm, bookedAreaAcres: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Preferred Spraying Date *</label>
                      <input
                        required
                        type="date"
                        value={bookForm.preferredDate}
                        onChange={(e) => setBookForm({ ...bookForm, preferredDate: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Preferred Time Slot</label>
                      <select
                        value={bookForm.preferredSlot}
                        onChange={(e) => setBookForm({ ...bookForm, preferredSlot: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="Morning (6 AM - 10 AM)">Morning (6 AM - 10 AM)</option>
                        <option value="Evening (4 PM - 6:30 PM)">Evening (4 PM - 6:30 PM)</option>
                      </select>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Field access notes, water availability, or power-line obstacle advisories..."
                    value={bookForm.farmerNotes}
                    onChange={(e) => setBookForm({ ...bookForm, farmerNotes: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2.5 focus:outline-none focus:border-[#64B5F6]"
                  />

                  <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[#263746]/80">Configured Service Rate: ₹{rateInr}/acre</div>
                      <div className="font-mono text-lg font-bold text-[#123B5D] tabular-nums">
                        Payable Total: ₹{estTotalInr.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={creatingBooking}
                      className="px-6 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {creatingBooking ? 'Creating Booking...' : 'Create Booking & Proceed to Payment'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: BOOKINGS & LIVE TRACKING */}
          {tab === 'tracking' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">My Spraying Bookings</h2>
                {bookings.length === 0 ? (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 text-sm text-[#263746]/70">
                    No spraying bookings yet.
                  </div>
                ) : (
                  bookings.map((bk) => (
                    <div key={bk.id} className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-5 space-y-3 text-xs">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#DCEAF5] pb-3">
                        <div>
                          <div className="font-mono font-bold text-sm text-[#123B5D]">{bk.bookingNumber}</div>
                          <div className="text-[#263746]/80">
                            {bk.cropType} · {bk.bookedAreaAcres} acres · {bk.preferredDate} ({bk.preferredSlot})
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-bold text-[#123B5D] tabular-nums">₹{bk.totalAmountInr.toLocaleString('en-IN')}</div>
                          <div className="text-[#42A5F5] font-semibold">{bk.bookingStatus}</div>
                        </div>
                      </div>

                      {bk.assignedPilot && (
                        <div className="text-[#263746]">
                          Assigned Pilot: <strong className="text-[#123B5D]">{bk.assignedPilot.fullName}</strong> ({bk.assignedPilot.pilotCode}) · {bk.assignedPilot.mobile}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {bk.paymentStatus !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => setPayBooking(bk)}
                            className="px-3.5 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Pay ₹{bk.totalAmountInr.toLocaleString('en-IN')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTrackBookingId(bk.id)}
                          className="px-3.5 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF] transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5 text-[#42A5F5]" /> Live Pilot Map
                        </button>
                        {bk.bookingStatus === 'Spraying Completed' && !bk.session?.farmerConfirmed && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleConfirmOrDispute(bk.id, 'confirm')}
                              className="px-3.5 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Completion
                            </button>
                            <button
                              type="button"
                              onClick={() => setDisputeBookingId(disputeBookingId === bk.id ? null : bk.id)}
                              className="px-3.5 py-1.5 border border-red-300 text-red-700 rounded-lg font-semibold"
                            >
                              Raise Dispute
                            </button>
                          </>
                        )}
                      </div>

                      {disputeBookingId === bk.id && (
                        <div className="flex gap-2 pt-2 border-t border-[#DCEAF5]">
                          <input
                            placeholder="Explain spraying quality or area discrepancy..."
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            className="flex-1 rounded border border-red-300 px-3 py-1.5"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmOrDispute(bk.id, 'dispute')}
                            className="px-3 py-1.5 bg-red-700 text-white rounded font-semibold"
                          >
                            Submit Dispute
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {refunds.length > 0 && (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-5 space-y-2 text-xs">
                    <div className="font-display font-bold text-[#123B5D]">Refund History</div>
                    {refunds.map((rf) => (
                      <div key={rf.id} className="flex justify-between font-mono border-t border-[#DCEAF5] pt-2 text-[#263746]">
                        <span>{rf.refundRef} · {rf.reason}</span>
                        <span>₹{rf.amountInr} ({rf.status})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 space-y-4">
                <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-[#123B5D]">Live Pilot &amp; Operation Telemetry</h2>
                    {trackBookingId && (
                      <button
                        type="button"
                        onClick={() => fetchLiveTracking(trackBookingId)}
                        className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh
                      </button>
                    )}
                  </div>

                  {!trackBookingId || !liveTrackData ? (
                    <div className="space-y-3">
                      <p className="text-xs text-[#263746]/80">
                        Select "Live Pilot Map" on any booking to inspect real pilot GPS location, arrival status, operation evidence, and history. Live nearby KRASHIVANTRI operators from Supabase Realtime are shown below:
                      </p>
                      <GeoMap
                        className="h-64 w-full rounded-xl border border-[#DCEAF5] overflow-hidden"
                        farms={farms.map((f) => ({
                          id: f.id,
                          label: f.farmName,
                          sublabel: `${f.areaAcres} ac`,
                          lat: f.centerLat,
                          lng: f.centerLng,
                          boundary: f.boundaryGeoJson,
                        }))}
                        pilots={androidOperators
                          .filter((op) => Number.isFinite(Number(op.lat)) && Number.isFinite(Number(op.lng)))
                          .map((op) => ({
                            id: `op_${op.id}`,
                            code: `${op.drone_type || 'UAV'} · Live`,
                            name: op.name,
                            lat: Number(op.lat),
                            lng: Number(op.lng),
                            status: op.is_available ? 'online' : 'offline',
                            isStale: false,
                            lastLocationAt: op.updated_at,
                          }))}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4 text-xs">
                      {!liveTrackData.pilotLocation?.gpsAvailable ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                          Pilot GPS Unavailable — awaiting pilot to enable real device GPS telemetry.
                        </div>
                      ) : liveTrackData.pilotLocation.isStale ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                          Stale GPS Warning — last pilot coordinate was received {liveTrackData.pilotLocation.gpsStalenessSeconds}s ago (threshold {liveTrackData.gpsStaleThresholdMinutes} min).
                        </div>
                      ) : (
                        <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3 text-[#123B5D] font-mono">
                          Live GPS Active · Updated {liveTrackData.pilotLocation.gpsStalenessSeconds}s ago · Accuracy {Math.round(liveTrackData.pilotLocation.accuracyMeters || 0)}m
                        </div>
                      )}

                      <GeoMap
                        className="h-72 w-full rounded-xl border border-[#DCEAF5] overflow-hidden"
                        farms={[
                          {
                            id: liveTrackData.booking.id,
                            label: liveTrackData.booking.bookingNumber,
                            sublabel: `${liveTrackData.booking.bookedAreaAcres} acres (${liveTrackData.booking.cropType})`,
                            lat: liveTrackData.booking.farmLat,
                            lng: liveTrackData.booking.farmLng,
                            boundary: liveTrackData.booking.farmBoundary,
                          },
                        ]}
                        pilots={
                          liveTrackData.pilotLocation?.currentLat != null && liveTrackData.pilot
                            ? [
                                {
                                  id: liveTrackData.pilot.id,
                                  name: liveTrackData.pilot.fullName,
                                  code: liveTrackData.pilot.pilotCode,
                                  lat: liveTrackData.pilotLocation.currentLat,
                                  lng: liveTrackData.pilotLocation.currentLng,
                                  isStale: liveTrackData.pilotLocation.isStale,
                                  gpsStalenessSeconds: liveTrackData.pilotLocation.gpsStalenessSeconds,
                                  accuracyMeters: liveTrackData.pilotLocation.accuracyMeters,
                                  status: liveTrackData.pilotLocation.status,
                                  lastLocationAt: liveTrackData.pilotLocation.lastLocationAt,
                                },
                              ]
                            : []
                        }
                      />

                      {liveTrackData.session && (
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-3 font-mono text-[#123B5D] space-y-1">
                          <div>Session: {liveTrackData.session.sessionCode} · {liveTrackData.session.status}</div>
                          <div>
                            Geofence on Start: {liveTrackData.session.insideGeofenceOnStart ? 'Inside Boundary' : 'Outside'} ({liveTrackData.session.geofenceDistanceMeters}m)
                          </div>
                          {liveTrackData.session.completedAreaAcres > 0 && (
                            <div>Logged Sprayed Area: {liveTrackData.session.completedAreaAcres} acres</div>
                          )}
                        </div>
                      )}

                      {liveTrackData.evidence?.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="font-semibold text-[#123B5D]">Operation Photo/Video Evidence</div>
                          <div className="flex flex-wrap gap-2">
                            {liveTrackData.evidence.map((ev: any) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() =>
                                  openAuthenticatedFile(
                                    `/api/krashivantri/files/download?path=${encodeURIComponent(ev.storagePath)}`,
                                    ev.fileName,
                                    getIdToken,
                                    (m) => notify(m, 'error')
                                  )
                                }
                                className="px-2.5 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold hover:bg-[#F0F8FF] transition-colors"
                              >
                                {ev.evidencePhase}: {ev.fileName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {payBooking && (
        <RazorpayCheckoutModal
          open={Boolean(payBooking)}
          onClose={() => setPayBooking(null)}
          entityType="farmer_booking"
          entityId={payBooking.id}
          title={`KRASHIVANTRI Spraying — ${payBooking.bookingNumber}`}
          amountInr={payBooking.totalAmountInr}
          createOrderUrl={`/api/farmer/bookings/${payBooking.id}/pay/create-order`}
          verifyUrl={`/api/farmer/bookings/${payBooking.id}/pay/verify`}
          onSuccess={loadFarmer}
        />
      )}
    </div>
  );
};

/* ============================================================================
 * DRONE PILOT PORTAL (/krashivantri/pilot-portal)
 * ============================================================================ */
export const PilotPortalPage: React.FC = () => {
  const { isSignedIn, openAuthModal, dbUser, apiFetch, notify, navigate } = usePlatform();
  const [tab, setTab] = useState<'profile' | 'bank' | 'missions' | 'earnings'>('profile');
  const [loading, setLoading] = useState(true);

  const [pilot, setPilot] = useState<DronePilotProfile | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [drones, setDrones] = useState<PilotDrone[]>([]);
  const [bankAccounts, setBankAccounts] = useState<PilotBankAccount[]>([]);
  const [availability, setAvailability] = useState<PilotAvailability | null>(null);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [earningsLedger, setEarningsLedger] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<PilotPayout[]>([]);
  const [penalties, setPenalties] = useState<PenaltyRecord[]>([]);

  // Registration Form
  const [regForm, setRegForm] = useState({
    fullName: '',
    mobile: '',
    email: '',
    city: '',
    district: '',
    state: 'Maharashtra',
    pinCode: '',
    rpcNumber: '',
    rpcValidUntil: '',
    serviceRadiusKm: '35',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Doc & Drone Upload
  const [docType, setDocType] = useState('DGCA RPC');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [droneForm, setDroneForm] = useState({
    droneModel: 'KRASHIVANTRI X',
    uinNumber: '',
    tankCapacityLiters: '10',
    sprayWidthMeters: '4',
  });

  // Bank Account
  const [bankForm, setBankForm] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
  });

  // Real Browser GPS Broadcasting
  const [gpsBroadcasting, setGpsBroadcasting] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const watchIdRef = useRef<number | null>(null);

  // Mission Actions
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [pauseId, setPauseId] = useState<number | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [completeAcresMap, setCompleteAcresMap] = useState<Record<number, string>>({});
  const [evidencePhaseMap, setEvidencePhaseMap] = useState<Record<number, string>>({});
  const [appealId, setAppealId] = useState<number | null>(null);
  const [appealText, setAppealText] = useState('');

  const loadPilot = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/pilot/me');
      setPilot(res.pilot || null);
      setDocuments(res.documents || []);
      setDrones(res.drones || []);
      setBankAccounts(res.bankAccounts || []);
      setAvailability(res.availability || null);
      setBookings(res.bookings || []);
      setEarningsLedger(res.earningsLedger || []);
      setPayouts(res.payouts || []);
      setPenalties(res.penalties || []);

      if (res.pilot) {
        setRegForm({
          fullName: res.pilot.fullName || '',
          mobile: res.pilot.mobile || '',
          email: res.pilot.email || '',
          city: res.pilot.city || '',
          district: res.pilot.district || '',
          state: res.pilot.state || 'Maharashtra',
          pinCode: res.pilot.pinCode || '',
          rpcNumber: res.pilot.rpcNumber || '',
          rpcValidUntil: res.pilot.rpcValidUntil || '',
          serviceRadiusKm: String(res.pilot.serviceRadiusKm || 35),
        });
      } else {
        setRegForm((prev) => ({
          ...prev,
          fullName: prev.fullName || dbUser?.fullName || '',
          email: prev.email || dbUser?.email || '',
          mobile: prev.mobile || dbUser?.mobile || '',
        }));
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to load Drone Pilot Portal.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, apiFetch, dbUser?.fullName, dbUser?.email, dbUser?.mobile, notify]);

  useEffect(() => {
    loadPilot();
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [loadPilot]);

  const sendLocationPing = async (coords: GeolocationCoordinates) => {
    const activeMission = bookings.find((b) =>
      ['Pilot Accepted', 'En Route', 'Arrived at Farm', 'Spraying Active', 'Spraying Paused'].includes(b.bookingStatus)
    );
    try {
      await apiFetch('/api/pilot/location', {
        method: 'POST',
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
          speedMps: coords.speed,
          headingDeg: coords.heading,
          bookingId: activeMission?.id,
          source: 'browser_gps',
        }),
      });
      setGpsError('');
      loadPilot();
    } catch (err: any) {
      setGpsError(err?.message || 'Failed to upload GPS fix.');
    }
  };

  const toggleRealGpsBroadcast = () => {
    if (gpsBroadcasting) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsBroadcasting(false);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Browser Geolocation API is unavailable or blocked on this device.');
      notify('Device GPS unavailable.', 'error');
      return;
    }

    setGpsBroadcasting(true);
    setGpsError('');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => sendLocationPing(pos.coords),
      (err) => {
        setGpsError(`GPS Denied / Unavailable (${err.message}). Real device location is required.`);
        setGpsBroadcasting(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <Compass className="w-10 h-10 text-[#42A5F5] mx-auto" />
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">KRASHIVANTRI Drone Pilot Portal</h1>
        <p className="text-sm text-[#263746]/80">
          Register your DGCA Remote Pilot Certificate (RPC), agricultural UAV fleet, encrypted payout bank account, and execute verified spraying missions with real GPS telemetry.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          Sign In / Register to Continue
        </button>
      </div>
    );
  }

  const toggleOnline = async (isOnline: boolean) => {
    try {
      await apiFetch('/api/pilot/availability', {
        method: 'POST',
        body: JSON.stringify({ isOnline }),
      });
      notify(isOnline ? 'Pilot status set Online.' : 'Pilot status set Offline.', 'info');
      loadPilot();
    } catch (err: any) {
      notify(err?.message || 'Failed to update availability.', 'error');
    }
  };

  const readyCredits = earningsLedger
    .filter((l) => l.status === 'ready_for_payout')
    .reduce((s, l) => s + Number(l.netAmountInr || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DCEAF5] pb-6">
        <div className="space-y-1">
          <div className="text-xs font-mono font-semibold text-[#42A5F5] uppercase tracking-wider">
            KRASHIVANTRI UAV Fleet Operations · Pilot Console
          </div>
          <h1 className="font-display text-3xl font-bold text-[#123B5D]">
            {pilot ? `${pilot.fullName} (${pilot.pilotCode})` : 'Drone Pilot Onboarding & Mission Portal'}
          </h1>
          <div className="text-xs text-[#263746]/80 flex flex-wrap items-center gap-2 font-mono">
            <span>KYC: <strong className="text-[#123B5D]">{pilot?.kycStatus || 'Not Registered'}</strong></span>
            <span>·</span>
            <span>Duty Status: <strong className="text-[#123B5D]">{availability?.isOnline ? 'ONLINE' : 'OFFLINE'}</strong></span>
            <span>·</span>
            <span>Sprayed Acres: <strong className="text-[#123B5D] tabular-nums">{pilot?.totalSprayedAcres ?? 0}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pilot?.kycStatus === 'Approved' && (
            <>
              <button
                type="button"
                onClick={() => toggleOnline(!availability?.isOnline)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  availability?.isOnline
                    ? 'border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] hover:bg-[#DCEAF5]'
                    : 'bg-[#64B5F6] text-white hover:bg-[#42A5F5]'
                }`}
              >
                {availability?.isOnline ? 'Go Offline' : 'Go Online for Dispatch'}
              </button>
              <button
                type="button"
                onClick={toggleRealGpsBroadcast}
                className={`px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors ${
                  gpsBroadcasting
                    ? 'bg-[#64B5F6] hover:bg-[#42A5F5] text-white'
                    : 'border border-[#90CAF9] text-[#123B5D] bg-[#F0F8FF] hover:bg-[#DCEAF5]'
                }`}
              >
                <LocateFixed className="w-3.5 h-3.5" />
                {gpsBroadcasting ? 'Broadcasting Real GPS...' : 'Start Real Device GPS'}
              </button>
            </>
          )}
          <button
            onClick={() => navigate('/krashivantri/farmer-portal')}
            className="px-4 py-2 border border-[#90CAF9] bg-white rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
          >
            Farmer Portal
          </button>
        </div>
      </div>

      {gpsError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          {gpsError}
        </div>
      )}

      {pilot?.rejectionReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <strong>Verification Feedback:</strong> {pilot.rejectionReason}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 p-1.5 bg-[#F0F8FF] rounded-xl border border-[#DCEAF5]">
        {[
          ['profile', 'Pilot KYC & Drones'],
          ['bank', 'Encrypted Bank Account'],
          ['missions', `Assigned Missions (${bookings.length})`],
          ['earnings', `Earnings, Payouts & Penalties`],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              tab === k
                ? 'bg-[#64B5F6] text-white shadow-sm'
                : 'text-[#263746]/80 hover:text-[#123B5D] hover:bg-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-sm text-[#263746]/70">Loading drone pilot workspace...</div>
      ) : (
        <div className="space-y-8">
          {/* TAB 1: PROFILE, KYC & DRONES */}
          {tab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingProfile(true);
                  try {
                    await apiFetch('/api/pilot/register', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...regForm,
                        serviceRadiusKm: Number(regForm.serviceRadiusKm || 35),
                      }),
                    });
                    notify('Drone Pilot profile saved for admin approval.', 'success');
                    loadPilot();
                  } catch (err: any) {
                    notify(err?.message || 'Save failed.', 'error');
                  } finally {
                    setSavingProfile(false);
                  }
                }}
                className="lg:col-span-6 rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-4 text-xs"
              >
                <h2 className="font-display text-lg font-bold text-[#123B5D]">DGCA Pilot Profile</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Full Name *"
                    value={regForm.fullName}
                    onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    placeholder="Mobile Number *"
                    value={regForm.mobile}
                    onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="Base City"
                    value={regForm.city}
                    onChange={(e) => setRegForm({ ...regForm, city: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    required
                    placeholder="Operating District *"
                    value={regForm.district}
                    onChange={(e) => setRegForm({ ...regForm, district: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="DGCA RPC Certificate Number"
                    value={regForm.rpcNumber}
                    onChange={(e) => setRegForm({ ...regForm, rpcNumber: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    type="date"
                    placeholder="RPC Valid Until"
                    value={regForm.rpcValidUntil}
                    onChange={(e) => setRegForm({ ...regForm, rpcValidUntil: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    type="number"
                    min={5}
                    placeholder="Service Radius (km)"
                    value={regForm.serviceRadiusKm}
                    onChange={(e) => setRegForm({ ...regForm, serviceRadiusKm: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="PIN Code"
                    value={regForm.pinCode}
                    onChange={(e) => setRegForm({ ...regForm, pinCode: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                >
                  {savingProfile ? 'Saving...' : 'Save Pilot Profile'}
                </button>
              </form>

              <div className="lg:col-span-6 space-y-6">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!docFile) return notify('Select a certificate/KYC file.', 'error');
                    const fd = new FormData();
                    fd.append('file', docFile);
                    fd.append('docType', docType);
                    await apiFetch('/api/pilot/documents', { method: 'POST', body: fd });
                    setDocFile(null);
                    notify('Pilot document uploaded.', 'success');
                    loadPilot();
                  }}
                  className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3 text-xs"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">KYC &amp; DGCA Certificates</h2>
                  <div className="flex gap-2">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="DGCA RPC">DGCA Remote Pilot Certificate</option>
                      <option value="Aadhaar / PAN">Identity Document</option>
                      <option value="Drone Insurance">UAV Third-Party Insurance</option>
                    </select>
                    <label className="flex-1 flex items-center justify-center gap-2 border border-dashed border-[#90CAF9] bg-[#F0F8FF]/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-[#F0F8FF] text-[#123B5D] transition-colors">
                      <Upload className="w-3.5 h-3.5 text-[#42A5F5]" />
                      <span className="truncate">{docFile ? docFile.name : 'Select PDF / Image'}</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <button type="submit" disabled={!pilot} className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors">
                    Upload Pilot Document
                  </button>
                  {documents.length > 0 && (
                    <div className="divide-y divide-[#DCEAF5] pt-2">
                      {documents.map((d) => (
                        <div key={d.id} className="py-2 flex justify-between font-mono text-[#263746]">
                          <span>{d.docType} — {d.fileName}</span>
                          <span className="text-[#42A5F5] font-semibold">{d.verificationStatus}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiFetch('/api/pilot/drones', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...droneForm,
                        tankCapacityLiters: Number(droneForm.tankCapacityLiters),
                        sprayWidthMeters: Number(droneForm.sprayWidthMeters),
                      }),
                    });
                    setDroneForm({ droneModel: 'KRASHIVANTRI X', uinNumber: '', tankCapacityLiters: '10', sprayWidthMeters: '4' });
                    notify('Drone airframe added for verification.', 'success');
                    loadPilot();
                  }}
                  className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3 text-xs"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Registered Spraying Drones (UIN)</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      placeholder="Drone Model"
                      value={droneForm.droneModel}
                      onChange={(e) => setDroneForm({ ...droneForm, droneModel: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      required
                      placeholder="DGCA UIN Number *"
                      value={droneForm.uinNumber}
                      onChange={(e) => setDroneForm({ ...droneForm, uinNumber: e.target.value.toUpperCase() })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono uppercase focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      type="number"
                      placeholder="Tank Liters"
                      value={droneForm.tankCapacityLiters}
                      onChange={(e) => setDroneForm({ ...droneForm, tankCapacityLiters: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                    />
                    <input
                      type="number"
                      placeholder="Swath Width (m)"
                      value={droneForm.sprayWidthMeters}
                      onChange={(e) => setDroneForm({ ...droneForm, sprayWidthMeters: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <button type="submit" disabled={!pilot} className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors">
                    Register Drone Airframe
                  </button>
                  {drones.length > 0 && (
                    <div className="divide-y divide-[#DCEAF5] pt-2 font-mono text-[#263746]">
                      {drones.map((dr) => (
                        <div key={dr.id} className="py-2 flex justify-between">
                          <span>{dr.droneModel} · UIN {dr.uinNumber} ({dr.tankCapacityLiters}L)</span>
                          <span className="text-[#42A5F5] font-semibold">{dr.verificationStatus}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: ENCRYPTED BANK ACCOUNT */}
          {tab === 'bank' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/pilot/bank-account', {
                    method: 'POST',
                    body: JSON.stringify(bankForm),
                  });
                  setBankForm({ accountHolderName: '', bankName: '', accountNumber: '', ifscCode: '', upiId: '' });
                  notify('Payout bank account encrypted & saved for verification.', 'success');
                  loadPilot();
                }}
                className="lg:col-span-6 rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3"
              >
                <h2 className="font-display text-lg font-bold text-[#123B5D]">Link Payout Bank Account</h2>
                <p className="text-[#263746]/80">
                  Account numbers are encrypted using AES-256-GCM at rest and displayed masked (`••••1234`) across portals.
                </p>
                <input
                  required
                  placeholder="Account Holder Name *"
                  value={bankForm.accountHolderName}
                  onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                />
                <input
                  required
                  placeholder="Bank Name *"
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                />
                <input
                  required
                  type="password"
                  placeholder="Bank Account Number *"
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    placeholder="IFSC Code *"
                    value={bankForm.ifscCode}
                    onChange={(e) => setBankForm({ ...bankForm, ifscCode: e.target.value.toUpperCase() })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono uppercase focus:outline-none focus:border-[#64B5F6]"
                  />
                  <input
                    placeholder="UPI ID (optional)"
                    value={bankForm.upiId}
                    onChange={(e) => setBankForm({ ...bankForm, upiId: e.target.value })}
                    className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>
                <button type="submit" disabled={!pilot} className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors">
                  Save Encrypted Bank Details
                </button>
              </form>

              <div className="lg:col-span-6 rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3">
                <h2 className="font-display text-lg font-bold text-[#123B5D]">Linked Payout Accounts</h2>
                {bankAccounts.length === 0 ? (
                  <p className="text-[#263746]/70">No bank account added yet.</p>
                ) : (
                  bankAccounts.map((b) => (
                    <div key={b.id} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-4 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#123B5D]">{b.bankName} · {b.accountHolderName}</div>
                        <div className="font-mono text-[#263746]/70">
                          A/C {b.accountNumberMasked} · IFSC {b.ifscCode}
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-[#42A5F5]">{b.verificationStatus}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ASSIGNED MISSIONS & FIELD EXECUTION */}
          {tab === 'missions' && (
            <div className="space-y-4">
              {availability?.currentLat != null && availability?.currentLng != null && (
                <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-4 text-xs font-mono text-[#123B5D]">
                  Last Verified Device GPS: {availability.currentLat.toFixed(5)}, {availability.currentLng.toFixed(5)} · Accuracy {Math.round(availability.accuracyMeters || 0)}m · Updated {availability.gpsStalenessSeconds ?? 0}s ago
                </div>
              )}

              {bookings.length === 0 ? (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70">
                  No spraying missions assigned yet. Keep your duty status Online and Real Device GPS active for auto-dispatch.
                </div>
              ) : (
                bookings.map((bk) => (
                  <div key={bk.id} className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-4 text-xs">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5] pb-3">
                      <div>
                        <div className="font-mono font-bold text-sm text-[#123B5D]">{bk.bookingNumber}</div>
                        <div className="text-[#263746]">
                          Farmer: <strong className="text-[#123B5D]">{bk.farmer?.fullName || 'Farmer'}</strong> ({bk.farmer?.mobile}) · {bk.farmer?.village}, {bk.farmer?.district}
                        </div>
                        <div className="font-mono text-[#263746]/70">
                          {bk.cropType} · {bk.bookedAreaAcres} acres · Pilot Payout: ₹{bk.pilotPayoutInr.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="text-right font-mono font-semibold text-[#42A5F5]">{bk.bookingStatus}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {bk.bookingStatus === 'Pilot Assigned' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/pilot/bookings/${bk.id}/respond`, {
                                method: 'POST',
                                body: JSON.stringify({ action: 'accept' }),
                              });
                              notify('Mission accepted.', 'success');
                              loadPilot();
                            }}
                            className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                          >
                            Accept Mission
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectId(rejectId === bk.id ? null : bk.id)}
                            className="px-3.5 py-2 border border-red-300 text-red-700 rounded-lg font-semibold"
                          >
                            Reject Mission
                          </button>
                        </>
                      )}

                      {bk.bookingStatus === 'Pilot Accepted' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/pilot/bookings/${bk.id}/status`, {
                              method: 'POST',
                              body: JSON.stringify({ status: 'En Route' }),
                            });
                            notify('Marked En Route.', 'info');
                            loadPilot();
                          }}
                          className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                        >
                          Mark En Route
                        </button>
                      )}

                      {['Pilot Accepted', 'En Route'].includes(bk.bookingStatus) && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/pilot/bookings/${bk.id}/status`, {
                              method: 'POST',
                              body: JSON.stringify({ status: 'Arrived at Farm' }),
                            });
                            notify('Marked Arrived at Farm.', 'info');
                            loadPilot();
                          }}
                          className="px-3.5 py-2 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] hover:bg-[#DCEAF5] rounded-lg font-semibold transition-colors"
                        >
                          Arrived at Farm
                        </button>
                      )}

                      {['Pilot Accepted', 'En Route', 'Arrived at Farm'].includes(bk.bookingStatus) && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/pilot/operations/${bk.id}/start`, { method: 'POST', body: JSON.stringify({}) });
                            notify('Spraying operation started.', 'success');
                            loadPilot();
                          }}
                          className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <PlayCircle className="w-3.5 h-3.5" /> Start Spraying
                        </button>
                      )}

                      {bk.bookingStatus === 'Spraying Active' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPauseId(pauseId === bk.id ? null : bk.id)}
                            className="px-3.5 py-2 border border-amber-500 text-amber-900 bg-amber-50 rounded-lg font-semibold inline-flex items-center gap-1"
                          >
                            <PauseCircle className="w-3.5 h-3.5" /> Pause Operation
                          </button>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.25"
                              placeholder={`Acres (${bk.bookedAreaAcres})`}
                              value={completeAcresMap[bk.id] ?? String(bk.bookedAreaAcres)}
                              onChange={(e) => setCompleteAcresMap({ ...completeAcresMap, [bk.id]: e.target.value })}
                              className="w-24 rounded border border-[#DCEAF5] bg-white text-[#263746] px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#64B5F6]"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const acres = Number(completeAcresMap[bk.id] ?? bk.bookedAreaAcres);
                                await apiFetch(`/api/pilot/operations/${bk.id}/complete`, {
                                  method: 'POST',
                                  body: JSON.stringify({ completedAreaAcres: acres }),
                                });
                                notify('Spraying operation marked completed.', 'success');
                                loadPilot();
                              }}
                              className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                            >
                              Complete Spraying
                            </button>
                          </div>
                        </>
                      )}

                      {bk.bookingStatus === 'Spraying Paused' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/pilot/operations/${bk.id}/resume`, { method: 'POST', body: JSON.stringify({}) });
                            notify('Operation resumed.', 'success');
                            loadPilot();
                          }}
                          className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                        >
                          Resume Spraying
                        </button>
                      )}

                      <label className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold cursor-pointer hover:bg-[#F0F8FF] inline-flex items-center gap-1 transition-colors">
                        <Upload className="w-3.5 h-3.5 text-[#42A5F5]" /> Upload Photo/Video Evidence
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const fd = new FormData();
                            fd.append('file', f);
                            fd.append('evidencePhase', evidencePhaseMap[bk.id] || 'post_spray');
                            await apiFetch(`/api/pilot/operations/${bk.id}/evidence`, { method: 'POST', body: fd });
                            notify('Evidence uploaded.', 'success');
                            loadPilot();
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {rejectId === bk.id && (
                      <div className="flex gap-2 pt-2 border-t border-[#DCEAF5]">
                        <input
                          placeholder="Mandatory rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="flex-1 rounded border border-red-300 px-3 py-1.5"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/pilot/bookings/${bk.id}/respond`, {
                              method: 'POST',
                              body: JSON.stringify({ action: 'reject', rejectionReason: rejectReason }),
                            });
                            setRejectId(null);
                            setRejectReason('');
                            notify('Mission declined.', 'info');
                            loadPilot();
                          }}
                          className="px-3 py-1.5 bg-red-700 text-white rounded font-semibold"
                        >
                          Confirm Reject
                        </button>
                      </div>
                    )}

                    {pauseId === bk.id && (
                      <div className="flex gap-2 pt-2 border-t border-[#DCEAF5]">
                        <input
                          placeholder="Mandatory pause reason (e.g. battery swap, high wind)..."
                          value={pauseReason}
                          onChange={(e) => setPauseReason(e.target.value)}
                          className="flex-1 rounded border border-amber-300 px-3 py-1.5"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/pilot/operations/${bk.id}/pause`, {
                              method: 'POST',
                              body: JSON.stringify({ pauseReason }),
                            });
                            setPauseId(null);
                            setPauseReason('');
                            notify('Operation paused.', 'info');
                            loadPilot();
                          }}
                          className="px-3 py-1.5 bg-amber-700 text-white rounded font-semibold"
                        >
                          Confirm Pause
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: EARNINGS, PAYOUTS & PENALTIES */}
          {tab === 'earnings' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
              <div className="lg:col-span-6 rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
                  <h2 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-[#42A5F5]" /> Earnings Ledger
                  </h2>
                  <span className="font-mono font-bold text-base text-[#42A5F5] tabular-nums">
                    Payable Balance: ₹{Math.max(0, readyCredits).toLocaleString('en-IN')}
                  </span>
                </div>
                {earningsLedger.length === 0 ? (
                  <p className="text-[#263746]/70">Completed spraying operations appear here once admin verification settles.</p>
                ) : (
                  <div className="divide-y divide-[#DCEAF5]">
                    {earningsLedger.map((l) => (
                      <div key={l.id} className="py-2.5 flex justify-between gap-3">
                        <div>
                          <div className="font-mono font-semibold text-[#123B5D]">{l.ledgerRef} · {l.entryType}</div>
                          <div className="text-[#263746]/70">{l.notes}</div>
                        </div>
                        <div className="text-right font-mono">
                          <div className={`font-bold tabular-nums ${l.netAmountInr < 0 ? 'text-red-700' : 'text-[#123B5D]'}`}>
                            {l.netAmountInr < 0 ? `-₹${Math.abs(l.netAmountInr)}` : `₹${l.netAmountInr.toLocaleString('en-IN')}`}
                          </div>
                          <div className="text-[11px] text-[#263746]/70">{l.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 space-y-6">
                <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Bank Payout Settlements</h2>
                  {payouts.length === 0 ? (
                    <p className="text-[#263746]/70">No payouts processed yet.</p>
                  ) : (
                    payouts.map((po) => (
                      <div key={po.id} className="border-t border-[#DCEAF5] pt-2.5 flex justify-between font-mono">
                        <div>
                          <div className="font-bold text-[#123B5D]">{po.payoutRef} · {po.bankAccountMasked}</div>
                          {po.providerPayoutId && <div className="text-[#263746]/70">UTR: {po.providerPayoutId}</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-[#123B5D] tabular-nums">₹{po.amountInr.toLocaleString('en-IN')}</div>
                          <div className="text-[#42A5F5]">{po.status}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm p-6 space-y-3">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Penalties &amp; Appeals</h2>
                  {penalties.length === 0 ? (
                    <p className="text-[#263746]/70">Clean record — no penalties imposed.</p>
                  ) : (
                    penalties.map((pn) => (
                      <div key={pn.id} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/40 p-3 space-y-2">
                        <div className="flex justify-between font-mono font-bold text-[#123B5D]">
                          <span>{pn.penaltyNumber} · {pn.reasonCategory}</span>
                          <span className="text-red-700">₹{pn.amountInr} ({pn.status})</span>
                        </div>
                        <div className="text-[#263746]/80">{pn.description}</div>
                        {pn.status === 'Active' && pn.appealStatus === 'None' && (
                          <button
                            type="button"
                            onClick={() => setAppealId(appealId === pn.id ? null : pn.id)}
                            className="px-3 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold transition-colors"
                          >
                            Submit Appeal
                          </button>
                        )}
                        {appealId === pn.id && (
                          <div className="flex gap-2 pt-1">
                            <input
                              placeholder="Provide explanation & supporting context..."
                              value={appealText}
                              onChange={(e) => setAppealText(e.target.value)}
                              className="flex-1 rounded border border-[#DCEAF5] bg-white text-[#263746] px-2.5 py-1 focus:outline-none focus:border-[#64B5F6]"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/pilot/penalties/${pn.id}/appeal`, {
                                  method: 'POST',
                                  body: JSON.stringify({ explanation: appealText }),
                                });
                                setAppealId(null);
                                setAppealText('');
                                notify('Penalty appeal submitted.', 'success');
                                loadPilot();
                              }}
                              className="px-3 py-1 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                            >
                              Send Appeal
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
