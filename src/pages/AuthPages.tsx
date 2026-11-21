import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { CustomerOtpAuth } from '../components/CustomerOtpAuth';
import { usePlatform } from '../context/PlatformContext';
import { getDashboardRouteForRole, sanitizePostAuthRedirect } from '../lib/rbac';
import { getSupabaseClient } from '../lib/supabase';
import { DbUser } from '../types/platform';

export const AuthCallbackPage: React.FC = () => {
  const { navigate, startGuestSession, refreshMe, consumePostAuthRedirect, notify } = usePlatform();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing staff Google authentication...');

  useEffect(() => {
    let active = true;
    const runCallback = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const oauthErrorParam =
          searchParams.get('error_description') ||
          searchParams.get('error') ||
          hashParams.get('error_description') ||
          hashParams.get('error');

        if (oauthErrorParam) {
          throw new Error(decodeURIComponent(oauthErrorParam.replace(/\+/g, ' ')));
        }

        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error(
            'Supabase Auth client is not initialized. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are configured.'
          );
        }

        const code = searchParams.get('code');
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchErr) throw exchErr;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        let accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          await new Promise((r) => setTimeout(r, 450));
          const retry = await supabase.auth.getSession();
          accessToken = retry.data.session?.access_token;
        }

        if (!accessToken) {
          throw new Error(
            'No authenticated OAuth session was returned. Verify that the callback URL is authorized in Supabase Authentication settings.'
          );
        }

        const syncRes = await fetch('/api/auth/sync-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-mode': 'admin',
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'same-origin',
        });
        const syncJson = (await syncRes.json().catch(() => ({}))) as {
          user?: DbUser;
          sessionToken?: string;
          error?: string;
        };

        if (!syncRes.ok || !syncJson.user) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error(
            syncJson.error ||
              'Google Sign-In is restricted to authorized staff & admin accounts. Customers sign in via Email OTP.'
          );
        }

        if (syncJson.sessionToken) {
          startGuestSession(syncJson.sessionToken, syncJson.user);
        }
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        await refreshMe();

        if (!active) return;
        const payload = {
          type: 'OAUTH_AUTH_SUCCESS',
          sessionToken: syncJson.sessionToken || null,
          user: syncJson.user,
        };
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
        }
        try {
          const bc = new BroadcastChannel('ntf_oauth_channel');
          bc.postMessage(payload);
          bc.close();
        } catch {
          // ignore BroadcastChannel errors
        }

        const destination = sanitizePostAuthRedirect(
          consumePostAuthRedirect(syncJson.user.role),
          syncJson.user.role
        );
        setStatus('success');
        setMessage(
          window.opener && !window.opener.closed
            ? `Welcome, ${syncJson.user.fullName || syncJson.user.email}! Returning to NexusTekFusion...`
            : `Welcome, ${syncJson.user.fullName || syncJson.user.email}! Redirecting...`
        );
        notify(`Signed in as ${syncJson.user.fullName || syncJson.user.email}.`, 'success');
        setTimeout(() => {
          if (!active) return;
          if (window.opener && !window.opener.closed) {
            window.close();
          } else {
            navigate(destination);
          }
        }, 400);
      } catch (err: any) {
        if (!active) return;
        setStatus('error');
        setMessage(err?.message || 'Google authentication callback failed.');
      }
    };

    runCallback();
    return () => {
      active = false;
    };
  }, [consumePostAuthRedirect, navigate, notify, refreshMe, startGuestSession]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20">
      <div className="rounded-2xl border border-[#DCEAF5] bg-white p-8 shadow-sm space-y-5 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-[#64B5F6] animate-spin mx-auto" />
            <h1 className="font-display text-2xl font-bold text-[#123B5D]">Signing You In</h1>
            <p className="text-sm text-[#263746]">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-[#64B5F6] mx-auto" />
            <h1 className="font-display text-2xl font-bold text-[#123B5D]">Authentication Complete</h1>
            <p className="text-sm text-[#263746]">{message}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h1 className="font-display text-2xl font-bold text-[#123B5D]">Sign-In Redirect Required</h1>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-left text-xs text-red-900 space-y-1.5">
              <div className="font-semibold">Notice</div>
              <p className="leading-relaxed">{message}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Customer Email OTP Login
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
              >
                Return to Home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const AuthStandaloneView: React.FC<{ initialMode: 'login' | 'register' }> = () => {
  const { isSignedIn, dbUser, navigate, setPostAuthRedirect } = usePlatform();

  useEffect(() => {
    const redirectParam = new URLSearchParams(window.location.search).get('redirect');
    if (redirectParam && redirectParam.startsWith('/')) {
      setPostAuthRedirect(redirectParam);
    }
  }, [setPostAuthRedirect]);

  if (isSignedIn) {
    const dashboardRoute = getDashboardRouteForRole(dbUser?.role);
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <div className="rounded-2xl border border-[#DCEAF5] bg-white p-8 text-center space-y-4 shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-[#42A5F5] mx-auto" />
          <h1 className="font-display text-2xl font-bold text-[#123B5D]">
            Signed in as {dbUser?.fullName || dbUser?.email}
          </h1>
          {dbUser?.customerId && (
            <div className="font-mono text-xs text-[#263746]/75">
              Customer ID: <span className="font-bold text-[#123B5D]">{dbUser.customerId}</span>
            </div>
          )}
          <p className="text-sm text-[#263746]">
            Access your orders, project registrations, GST invoices, and saved addresses inside your dashboard.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={() => navigate(dashboardRoute)}
              className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              Open My Dashboard <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/register-project')}
              className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              Register a Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  const destOverride = new URLSearchParams(window.location.search).get('redirect') || undefined;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
      <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-[#FFFFFF] via-[#F0F8FF] to-[#E3F2FD] text-[#263746] p-7 space-y-5 border border-[#DCEAF5] shadow-sm">
        <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#1E88E5]">
          NEXUSTEKFUSION
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight text-[#123B5D]">
          Passwordless Email OTP Access
        </h1>
        <p className="text-sm text-[#263746] leading-relaxed">
          Sign in or register in seconds using a one-time 6-digit verification code sent directly to your email address.
        </p>

        <ul className="space-y-3 text-xs text-[#263746] pt-3 border-t border-[#DCEAF5]">
          <li className="flex items-start gap-2.5">
            <MailCheck className="w-4 h-4 text-[#42A5F5] shrink-0 mt-0.5" />
            <span>No password required — fast 6-digit Supabase Email OTP verification</span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#42A5F5] shrink-0 mt-0.5" />
            <span>Instant Customer ID creation for new customers or direct access for existing profiles</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#42A5F5] shrink-0 mt-0.5" />
            <span>Track Store Orders, 3D Printing, Drone Repairs, Projects &amp; GST Invoices</span>
          </li>
        </ul>
      </div>

      <div className="lg:col-span-7 rounded-2xl border border-[#DCEAF5] bg-white p-6 sm:p-8 shadow-sm">
        <CustomerOtpAuth defaultRedirect={destOverride || '/customer/dashboard'} />
      </div>
    </div>
  );
};

export const LoginPage: React.FC = () => <AuthStandaloneView initialMode="login" />;
export const RegisterPage: React.FC = () => <AuthStandaloneView initialMode="register" />;
