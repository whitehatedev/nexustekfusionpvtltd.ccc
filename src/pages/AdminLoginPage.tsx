import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getDashboardRouteForRole } from '../lib/rbac';

const COMPANY_LOGO = '/assets/aistudio/image_1a5ac752.png';

interface AdminSetupStatusResponse {
  configured: boolean;
  hasPasswordAdmin?: boolean;
  envConfigured?: boolean;
  allowFirstRunSetup?: boolean;
  cloudDatabaseRequired?: boolean;
}

export const AdminLoginPage: React.FC = () => {
  const {
    isSignedIn,
    isAdmin,
    dbUser,
    supabaseConfigured,
    signInWithAdminCredentials,
    sendAdminOtp,
    verifyAdminOtp,
    claimAdminSetup,
    signInWithSupabaseOAuth,
    signOut,
    navigate,
    apiFetch,
  } = usePlatform();

  const [mode, setMode] = useState<'login' | 'otp' | 'forgot' | 'reset' | 'setup'>('login');
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('email')?.trim() || '';
  });
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpStep, setOtpStep] = useState<'email' | 'code'>('email');
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setupStatus, setSetupStatus] = useState<AdminSetupStatusResponse | null>(null);

  useEffect(() => {
    if (isSignedIn && isAdmin) {
      navigate(getDashboardRouteForRole(dbUser?.role));
    }
  }, [isSignedIn, isAdmin, dbUser?.role, navigate]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  useEffect(() => {
    apiFetch<AdminSetupStatusResponse>('/api/auth/admin-setup-status')
      .then((res) => {
        setSetupStatus(res);
        if (res.allowFirstRunSetup) {
          setMode('setup');
        }
      })
      .catch(() => {});
  }, [apiFetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setBusy(true);
    try {
      const signedInUser = await signInWithAdminCredentials(email.trim(), password);
      navigate(getDashboardRouteForRole(signedInUser.role));
    } catch (err: any) {
      setError(err?.message || 'Invalid administrator credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleFirstRunSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setBusy(true);
    try {
      const createdAdmin = await claimAdminSetup({
        email: email.trim(),
        password,
        fullName: fullName.trim() || 'Super Admin',
      });
      navigate(getDashboardRouteForRole(createdAdmin.role));
    } catch (err: any) {
      setError(err?.message || 'Unable to complete initial Super Admin setup.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendAdminOtp = async (e?: React.FormEvent, isResend = false) => {
    if (e) e.preventDefault();
    if (isResend && otpCooldown > 0) return;
    setError('');
    setInfoMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter your administrator email address.');
      return;
    }
    setBusy(true);
    try {
      await sendAdminOtp(cleanEmail);
      setEmail(cleanEmail);
      setOtpCode('');
      setOtpStep('code');
      setOtpCooldown(30);
      setInfoMsg(
        isResend
          ? `A fresh 6-digit verification code has been sent to ${cleanEmail}.`
          : `A 6-digit verification code has been sent to ${cleanEmail}.`
      );
    } catch (err: any) {
      setError(err?.message || 'Unable to send OTP to this administrator email.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAdminOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    const digits = otpCode.replace(/\D/g, '');
    if (!/^\d{6}$/.test(digits)) {
      setError('Please enter the 6-digit code sent to your email.');
      return;
    }
    setBusy(true);
    try {
      const signedInUser = await verifyAdminOtp(email.trim().toLowerCase(), digits);
      navigate(getDashboardRouteForRole(signedInUser.role));
    } catch (err: any) {
      setError(err?.message || 'Administrator OTP verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/auth/admin-forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setInfoMsg(res.message || 'If the admin email exists, a reset token has been dispatched.');
      setMode('reset');
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate password reset.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setBusy(true);
    try {
      await apiFetch('/api/auth/admin-reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          token: resetToken.trim(),
          newPassword,
        }),
      });
      setInfoMsg('Admin password updated. Sign in below with your new password.');
      setPassword('');
      setResetToken('');
      setNewPassword('');
      setMode('login');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired reset token.');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: 'login' | 'otp' | 'forgot' | 'reset' | 'setup') => {
    setError('');
    setInfoMsg('');
    if (next === 'otp') setOtpStep('email');
    setMode(next);
  };

  return (
    <div className="min-h-[82vh] bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#DCEAF5] shadow-xl overflow-hidden">
        <div className="bg-[#F0F8FF] border-b border-[#DCEAF5] px-8 py-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white border border-[#DCEAF5] p-1.5 flex items-center justify-center shrink-0">
            <img src={COMPANY_LOGO} alt="NexusTekFusion Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-[11px] font-mono font-semibold text-[#64B5F6] uppercase tracking-wider">
              Control Platform
            </div>
            <h1 className="font-display text-xl font-bold text-[#123B5D]">NexusTekFusion Admin Login</h1>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {isSignedIn && !isAdmin && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> Customer Session Active — Admin Access Restricted
              </div>
              <p>
                Signed in as <span className="font-mono">{dbUser?.email}</span> ({dbUser?.role}). Sign in with an
                authorized staff or super admin account below, or return to your dashboard.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigate(getDashboardRouteForRole(dbUser?.role))}
                  className="px-3 py-1.5 rounded-md bg-white border border-amber-300 text-[#123B5D] font-semibold hover:bg-amber-100/60"
                >
                  Return to My Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="px-3 py-1.5 rounded-md bg-amber-900 text-white font-semibold hover:bg-amber-800"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {setupStatus?.cloudDatabaseRequired && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> Cloud Database Not Connected
              </div>
              <p>
                Configure <span className="font-mono font-semibold">DATABASE_URL</span> in your server environment
                so administrator accounts and sessions can be verified against Supabase PostgreSQL.
              </p>
            </div>
          )}

          {(mode === 'login' || mode === 'otp' || mode === 'setup') && (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F0F8FF] p-1 border border-[#DCEAF5]">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-[#123B5D] shadow-sm border border-[#DCEAF5]'
                    : 'text-[#263746]/75 hover:text-[#123B5D]'
                }`}
              >
                Password Sign-In
              </button>
              {supabaseConfigured ? (
                <button
                  type="button"
                  onClick={() => switchMode('otp')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'otp'
                      ? 'bg-white text-[#123B5D] shadow-sm border border-[#DCEAF5]'
                      : 'text-[#263746]/75 hover:text-[#123B5D]'
                  }`}
                >
                  Email 6-Digit OTP
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode(setupStatus?.allowFirstRunSetup ? 'setup' : 'forgot')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'setup'
                      ? 'bg-white text-[#123B5D] shadow-sm border border-[#DCEAF5]'
                      : 'text-[#263746]/75 hover:text-[#123B5D]'
                  }`}
                >
                  {setupStatus?.allowFirstRunSetup ? 'Initial Setup' : 'Reset Password'}
                </button>
              )}
            </div>
          )}

          {setupStatus?.allowFirstRunSetup && mode !== 'setup' && (
            <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3 text-xs text-[#123B5D] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#42A5F5] shrink-0" />
                <span>No admin password set yet. Claim first-run Super Admin access.</span>
              </div>
              <button
                type="button"
                onClick={() => switchMode('setup')}
                className="px-2.5 py-1 rounded-md bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold shrink-0"
              >
                Setup
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
              {error}
            </div>
          )}

          {infoMsg && (
            <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3 text-xs font-medium text-[#123B5D]">
              {infoMsg}
            </div>
          )}

          {mode === 'setup' && (
            <form onSubmit={handleFirstRunSetup} className="space-y-4">
              <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3 text-xs text-[#123B5D] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#42A5F5] shrink-0" /> First-Run Super Admin Setup
                </div>
                <p className="text-[#263746]">
                  Create the initial Super Admin password for your workspace. This setup locks automatically once claimed.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#123B5D]">Full Name</label>
                <input
                  type="text"
                  placeholder="Super Admin"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#123B5D]">Administrator Email *</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@nexustekfusion.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#123B5D]">Choose Password (min 8 chars) *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Create strong admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                {busy ? 'Creating Super Admin...' : 'Claim Super Admin & Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {mode === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#123B5D]">Administrator Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@nexustekfusion.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#123B5D]">Password</label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[11px] font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Lock className="w-4 h-4" />
                {busy ? 'Verifying Credentials...' : 'Sign In to Admin Dashboard'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {mode === 'otp' && (
            otpStep === 'email' ? (
              <form onSubmit={(e) => handleSendAdminOtp(e, false)} className="space-y-4">
                <div className="text-xs text-[#263746] leading-relaxed">
                  Enter your authorized administrator or staff email address to receive a 6-digit one-time login code.
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#123B5D]">Administrator Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#42A5F5] absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="admin@nexustekfusion.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] pl-9 pr-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {busy ? 'Sending 6-Digit OTP...' : 'Send Admin 6-Digit OTP'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyAdminOtp} className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#123B5D] bg-[#F0F8FF]/60 border border-[#DCEAF5] rounded-lg px-3.5 py-2.5">
                  <span className="font-mono font-semibold truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode('');
                      setError('');
                      setInfoMsg('');
                      setOtpStep('email');
                    }}
                    className="text-[#1E88E5] hover:underline font-medium shrink-0 ml-2 inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change email
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#123B5D]">6-Digit Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-lg border border-[#90CAF9] bg-[#F0F8FF]/30 text-center font-mono text-lg font-bold tracking-[0.4em] text-[#123B5D] px-3.5 py-2.5 focus:bg-white focus:border-[#1E88E5] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {busy ? 'Verifying Admin OTP...' : 'Verify & Open Admin Dashboard'}
                </button>
                <button
                  type="button"
                  disabled={busy || otpCooldown > 0}
                  onClick={() => void handleSendAdminOtp(undefined, true)}
                  className="text-xs font-semibold text-[#123B5D] hover:text-[#1E88E5] disabled:text-[#263746]/45 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {otpCooldown > 0 ? `Resend OTP (${otpCooldown}s)` : 'Resend OTP'}
                </button>
              </form>
            )
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="text-xs text-[#263746]">
                Enter your administrator email address. A one-time password reset token will be generated and emailed (when configured).
              </div>
              <input
                type="email"
                required
                placeholder="admin@nexustekfusion.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2.5 text-sm focus:border-[#64B5F6] focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Requesting...' : 'Send Reset Token'}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="px-3 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                >
                  Have Token?
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="px-3 py-2.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleConfirmReset} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Administrator Email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2 text-sm focus:border-[#64B5F6] focus:outline-none"
              />
              <input
                required
                placeholder="6-digit / Hex Reset Token *"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2 text-sm font-mono focus:border-[#64B5F6] focus:outline-none"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="New Password (min 8 chars) *"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] px-3.5 py-2 text-sm focus:border-[#64B5F6] focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Resetting...' : 'Reset Admin Password'}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="px-3 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {supabaseConfigured && (
            <>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#DCEAF5]" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase">
                  <span className="bg-white px-2 text-[#263746]/60 font-medium">Or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => signInWithSupabaseOAuth('/admin/dashboard')}
                className="w-full py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-[#64B5F6]" />
                Continue with Authorized Google Account (Supabase)
              </button>
            </>
          )}

          <div className="flex items-center justify-start pt-1 text-xs">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-[#263746]/70 hover:text-[#123B5D]"
            >
              ← Public Website
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
