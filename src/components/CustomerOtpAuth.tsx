import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getDashboardRouteForRole, sanitizePostAuthRedirect } from '../lib/rbac';

interface CustomerOtpAuthProps {
  onComplete?: (destination: string) => void;
  defaultRedirect?: string;
  compact?: boolean;
}

export const CustomerOtpAuth: React.FC<CustomerOtpAuthProps> = ({
  onComplete,
  defaultRedirect = '/customer/dashboard',
  compact = false,
}) => {
  const { sendCustomerOtp, verifyCustomerOtp, consumePostAuthRedirect, navigate } = usePlatform();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    }
  }, [step]);

  const finishAuth = (userRole?: string | null) => {
    const resolvedRole = userRole || 'customer';
    const saved = consumePostAuthRedirect(resolvedRole);
    const candidate =
      (saved !== getDashboardRouteForRole(resolvedRole) ? saved : defaultRedirect) ||
      getDashboardRouteForRole(resolvedRole);
    const dest = sanitizePostAuthRedirect(candidate, resolvedRole);
    if (onComplete) {
      onComplete(dest);
    } else {
      navigate(dest);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent, isResend = false) => {
    if (e) e.preventDefault();
    if (isResend && resendCooldown > 0) return;
    setError('');
    setInfoMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      await sendCustomerOtp(cleanEmail);
      setEmail(cleanEmail);
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
      setResendCooldown(30);
      setInfoMsg(
        isResend
          ? `A fresh 6-digit verification code has been sent to ${cleanEmail}.`
          : `A 6-digit verification code has been sent to ${cleanEmail}.`
      );
    } catch (err: any) {
      setError(err?.message || 'Unable to send verification code to this email.');
    } finally {
      setBusy(false);
    }
  };

  const handleDigitChange = (index: number, rawValue: string) => {
    const onlyDigits = rawValue.replace(/\D/g, '');
    if (!onlyDigits) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    if (onlyDigits.length > 1) {
      const next = [...digits];
      for (let i = 0; i < onlyDigits.length && index + i < 6; i++) {
        next[index + i] = onlyDigits[i];
      }
      setDigits(next);
      const nextFocus = Math.min(5, index + onlyDigits.length);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[index] = onlyDigits;
      return next;
    });
    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigits((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      } else if (index > 0) {
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
        otpInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    otpInputRefs.current[Math.min(5, pasted.length - 1)]?.focus();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    const code = digits.join('');
    if (!/^\d{6}$/.test(code)) {
      setError('Please enter all 6 digits of the verification code sent to your email.');
      return;
    }

    setBusy(true);
    try {
      const result = await verifyCustomerOtp(email.trim().toLowerCase(), code);
      finishAuth(result.user?.role);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/expired/i.test(msg)) {
        setError('This OTP code has expired. Click "Resend OTP" to request a fresh 6-digit code.');
      } else if (/invalid|token/i.test(msg)) {
        setError('Invalid verification code. Please check the 6 digits sent to your email and try again.');
      } else {
        setError(msg || 'OTP verification failed. Please check the code and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResetToEmail = () => {
    setDigits(['', '', '', '', '', '']);
    setError('');
    setInfoMsg('');
    setStep('email');
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="space-y-1">
        <div className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#1E88E5]">
          CUSTOMER ACCESS
        </div>
        <h2 className="font-display text-2xl font-bold text-[#123B5D]">
          {step === 'email' ? 'Customer Sign In' : 'Verify Your Email'}
        </h2>
        <p className="text-xs text-[#263746]/75">
          {step === 'email'
            ? 'Passwordless 6-digit Email OTP — new emails automatically receive a permanent Customer ID.'
            : 'Enter the 6-digit one-time verification code sent to your inbox.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        </div>
      )}

      {infoMsg && (
        <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] px-3.5 py-2.5 text-xs text-[#123B5D] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#42A5F5] shrink-0 mt-0.5" />
          <span className="leading-relaxed">{infoMsg}</span>
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="otp-email-input" className="block text-xs font-semibold text-[#123B5D]">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#42A5F5] absolute left-3 top-3" />
              <input
                id="otp-email-input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[#DCEAF5] bg-white pl-9 pr-3 py-2.5 text-sm text-[#263746] focus:border-[#42A5F5] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending 6-Digit OTP...
              </>
            ) : (
              <>
                Send 6-Digit OTP
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-xs text-[#263746]/80 text-center leading-relaxed pt-1">
            Returning customers access their existing account automatically; new emails are provisioned instantly.
          </p>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="flex items-center justify-between text-xs text-[#123B5D] bg-[#F0F8FF]/60 border border-[#DCEAF5] rounded-xl px-3.5 py-2.5">
            <span className="font-mono font-semibold truncate">{email}</span>
            <button
              type="button"
              onClick={handleResetToEmail}
              className="text-[#1E88E5] hover:underline font-medium shrink-0 ml-2 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Change email
            </button>
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-3" role="group" aria-label="6-digit OTP code">
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  otpInputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                aria-label={`OTP digit ${idx + 1}`}
                value={d}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                onPaste={handleOtpPaste}
                className="h-12 sm:h-13 w-full text-center font-mono text-lg font-bold text-[#123B5D] rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/40 focus:bg-white focus:border-[#1E88E5] focus:outline-none focus:ring-2 focus:ring-[#64B5F6]/30 transition-all"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying Code...
              </>
            ) : (
              <>
                Verify &amp; Continue
                <ShieldCheck className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={busy || resendCooldown > 0}
              onClick={() => handleSendOtp(undefined, true)}
              className="text-xs font-semibold text-[#123B5D] hover:text-[#1E88E5] disabled:text-[#263746]/45 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
