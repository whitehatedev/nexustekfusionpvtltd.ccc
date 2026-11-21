import React, { useEffect } from 'react';
import { ArrowRight, Loader2, Lock, ShieldAlert, User } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getDashboardRouteForRole, isAdminRole } from '../lib/rbac';
import { FarmerPortalPage, PilotPortalPage } from '../pages/KrashivantriPortalsPage';

export const AdminRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authLoading, isSignedIn, isAdmin, dbUser, navigate } = usePlatform();

  if (authLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#64B5F6] animate-spin mx-auto" />
        <div className="text-sm font-medium text-[#123B5D]">Verifying administrator permissions...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#F0F8FF] border border-[#DCEAF5] flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#42A5F5]" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
          Administrator Sign-In Required
        </h1>
        <p className="text-sm text-[#263746]/80">
          This area is restricted to authorized NexusTekFusion administrators and staff.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            className="px-6 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Go to Admin Login
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-5 py-2.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-sm font-semibold transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin || !isAdminRole(dbUser?.role)) {
    const safeDestination = getDashboardRouteForRole(dbUser?.role);
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-red-600" />
        </div>
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-red-600">
          403 · Access Denied
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
          Admin Dashboard Access Restricted
        </h1>
        <p className="text-sm text-[#263746]/85 leading-relaxed">
          Your account{' '}
          <span className="font-mono font-semibold text-[#123B5D]">{dbUser?.email}</span>
          {dbUser?.customerId ? (
            <>
              {' '}
              (Customer ID: <span className="font-mono font-semibold">{dbUser.customerId}</span>)
            </>
          ) : null}{' '}
          has role <span className="font-mono font-semibold">{dbUser?.role || 'customer'}</span> and does not
          have permission to access the Admin Console.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate(safeDestination)}
            className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            Go to My Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const CustomerRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authLoading, isSignedIn, dbUser, openAuthModal, navigate } = usePlatform();
  const role = String(dbUser?.role || '').trim().toLowerCase();

  useEffect(() => {
    if (!authLoading && isSignedIn && (isAdminRole(role) || role === 'drone_partner' || role === 'drone_mitra' || role === 'fpo')) {
      navigate(getDashboardRouteForRole(role));
    }
  }, [authLoading, isSignedIn, role, navigate]);

  if (authLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#64B5F6] animate-spin mx-auto" />
        <div className="text-sm font-medium text-[#123B5D]">Loading your dashboard...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#F0F8FF] border border-[#DCEAF5] flex items-center justify-center">
          <User className="w-6 h-6 text-[#42A5F5]" />
        </div>
        <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#42A5F5]">
          Customer Account Portal
        </div>
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">Sign In with Email OTP</h1>
        <p className="text-sm text-[#263746]">
          Manage your Store orders, custom 3D prints, project registrations, GST invoices, and saved delivery addresses.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Continue with Email OTP
          </button>
          <button
            type="button"
            onClick={() => navigate('/login?redirect=/customer/dashboard')}
            className="px-5 py-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
          >
            Open Login Page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const RolePortalDashboardRoute: React.FC<{
  expectedRole: 'drone_partner' | 'drone_mitra' | 'fpo';
}> = ({ expectedRole }) => {
  const { authLoading, isSignedIn, dbUser, navigate } = usePlatform();
  const actualRole = String(dbUser?.role || '').trim().toLowerCase();

  if (authLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#64B5F6] animate-spin mx-auto" />
        <div className="text-sm font-medium text-[#123B5D]">Verifying portal access...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#123B5D]">Authentication Required</h1>
        <p className="text-sm text-[#263746]/80">Please sign in to access this dashboard.</p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-sm font-semibold transition-colors"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (actualRole !== expectedRole && !isAdminRole(actualRole)) {
    const dest = getDashboardRouteForRole(actualRole);
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
        <h1 className="font-display text-2xl font-bold text-[#123B5D]">403 · Role Access Restricted</h1>
        <p className="text-sm text-[#263746]/80">
          Your role (<span className="font-mono font-semibold">{dbUser?.role}</span>) does not match this portal.
        </p>
        <button
          type="button"
          onClick={() => navigate(dest)}
          className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors"
        >
          Go to My Dashboard <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (expectedRole === 'fpo') {
    return <FarmerPortalPage />;
  }
  return <PilotPortalPage />;
};
