import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabaseClient, getSupabaseOrigin, initSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { AuthModal } from '../components/AuthModal';
import {
  applySeoToDocument,
  DynamicSeoOverride,
  resolveRouteSeo,
} from '../lib/seo';
import {
  BlogPost,
  Brand,
  CartItem,
  CaseStudy,
  CustomerPermissions,
  DbUser,
  NotificationPreferences,
  PrintingMachine,
  PrintingMaterial,
  Product,
  ProductCategory,
  SiteSettings,
  WebsiteBannerItem,
} from '../types/platform';

import {
  ADMIN_ROLES_SET,
  getDashboardRouteForRole,
  sanitizePostAuthRedirect,
} from '../lib/rbac';

const ADMIN_ROLES = ADMIN_ROLES_SET;

interface ToastItem {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface PublishedPageSummary {
  id: number;
  title: string;
  slug: string;
  status: string;
}

interface PlatformContextValue {
  path: string;
  navigate: (to: string) => void;
  dbUser: DbUser | null;
  customerPermissions: CustomerPermissions | null;
  isSignedIn: boolean;
  authLoading: boolean;
  isAdmin: boolean;
  supabaseConfigured: boolean;
  oauthError: string | null;
  oauthRedirectUrl: string | null;
  clearOauthError: () => void;
  setPostAuthRedirect: (dest: string) => void;
  consumePostAuthRedirect: (role?: string | null) => string;
  openAuthModal: (mode?: 'login' | 'register') => void;
  signInWithSupabaseOAuth: (redirectPath?: string) => Promise<{ ok: boolean; errorMessage?: string; redirectUrl?: string }>;
  sendCustomerOtp: (email: string) => Promise<void>;
  verifyCustomerOtp: (
    email: string,
    otp: string
  ) => Promise<{
    status: 'authenticated';
    isNewCustomer?: boolean;
    user: DbUser;
  }>;
  updateCustomerSettings: (prefs: NotificationPreferences) => Promise<NotificationPreferences>;
  signInWithAdminCredentials: (email: string, password: string) => Promise<DbUser>;
  sendAdminOtp: (email: string) => Promise<void>;
  verifyAdminOtp: (email: string, otp: string) => Promise<DbUser>;
  claimAdminSetup: (params: { email: string; password: string; fullName?: string }) => Promise<DbUser>;
  signOut: () => Promise<void>;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  getIdToken: () => Promise<string | null>;
  settings: SiteSettings;
  banners: WebsiteBannerItem[];
  previewDraft: boolean;
  categories: ProductCategory[];
  brands: Brand[];
  featuredProducts: Product[];
  bestsellerProducts: Product[];
  newArrivalProducts: Product[];
  blogs: BlogPost[];
  caseStudies: CaseStudy[];
  printingMaterials: PrintingMaterial[];
  printingMachines: PrintingMachine[];
  publishedPages: PublishedPageSummary[];
  razorpayConfigured: boolean;
  razorpayMode: 'live' | 'test' | 'sandbox';
  refreshBootstrap: () => Promise<void>;
  refreshMe: () => Promise<void>;
  cart: CartItem[];
  cartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;
  addToCart: (product: Product, qty?: number, variant?: string, color?: string) => void;
  updateCartQty: (productId: number, variant: string | undefined, color: string | undefined, qty: number) => void;
  removeFromCart: (productId: number, variant?: string, color?: string) => void;
  clearCart: () => void;
  startGuestSession: (token: string, user: DbUser) => void;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  setDynamicSeo: (override: DynamicSeoOverride | null) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [customerPermissions, setCustomerPermissions] = useState<CustomerPermissions | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(() => isSupabaseConfigured());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SiteSettings>({});
  const [banners, setBanners] = useState<WebsiteBannerItem[]>([]);
  const [previewDraft, setPreviewDraft] = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [bestsellerProducts, setBestsellerProducts] = useState<Product[]>([]);
  const [newArrivalProducts, setNewArrivalProducts] = useState<Product[]>([]);
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [printingMaterials, setPrintingMaterials] = useState<PrintingMaterial[]>([]);
  const [printingMachines, setPrintingMachines] = useState<PrintingMachine[]>([]);
  const [publishedPages, setPublishedPages] = useState<PublishedPageSummary[]>([]);
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [razorpayMode, setRazorpayMode] = useState<'live' | 'test' | 'sandbox'>('sandbox');
  const [dynamicSeo, setDynamicSeo] = useState<DynamicSeoOverride | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const sessionTokenRef = React.useRef<string | null>(null);
  const postAuthRedirectRef = React.useRef<string | null>(null);

  const cartHydratedForUserRef = React.useRef<number | null>(null);
  const authFlowBusyRef = React.useRef<boolean>(false);

  const persistSessionToken = useCallback((token: string | null) => {
    sessionTokenRef.current = token;
  }, []);

  const clearPostAuthRedirects = useCallback(() => {
    postAuthRedirectRef.current = null;
  }, []);

  const startGuestSession = useCallback(
    (token: string, user: DbUser) => {
      persistSessionToken(token);
      setDbUser(user);
    },
    [persistSessionToken]
  );

  const notify = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const scrollToHashIfPresent = useCallback((hash: string) => {
    const clean = hash.replace(/^#/, '').trim();
    if (!clean) return;
    setTimeout(() => {
      const el = document.getElementById(clean);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 90);
  }, []);

  const navigate = useCallback(
    (to: string) => {
      const [pathAndQuery, hashPart] = to.split('#');
      const nextPath = (pathAndQuery || '/').split('?')[0] || '/';
      const currentFull = window.location.pathname + window.location.search + window.location.hash;

      if (to !== currentFull) {
        window.history.pushState({}, '', to);
      }
      setDynamicSeo(null);
      setPath(nextPath);

      if (hashPart) {
        scrollToHashIfPresent(hashPart);
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [scrollToHashIfPresent]
  );

  useEffect(() => {
    if (window.location.hash) {
      scrollToHashIfPresent(window.location.hash);
    }
    const onPop = () => {
      setDynamicSeo(null);
      setPath(window.location.pathname || '/');
      if (window.location.hash) {
        scrollToHashIfPresent(window.location.hash);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [scrollToHashIfPresent]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (sessionTokenRef.current) {
      return sessionTokenRef.current;
    }
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.access_token) {
          const expiresAtMs = (session.expires_at ?? 0) * 1000;
          if (!expiresAtMs || expiresAtMs > Date.now() + 60_000) {
            return session.access_token;
          }
          const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
          if (!refErr && refreshed?.session?.access_token) {
            return refreshed.session.access_token;
          }
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      } catch {
        // fall through cleanly
      }
    }
    return null;
  }, []);

  const apiFetch = useCallback(
    async <T = any>(url: string, options: RequestInit = {}): Promise<T> => {
      const buildHeaders = (token: string | null) => {
        const h = new Headers(options.headers || {});
        if (token) {
          h.set('Authorization', `Bearer ${token}`);
        }
        if (!(options.body instanceof FormData) && !h.has('Content-Type')) {
          h.set('Content-Type', 'application/json');
        }
        return h;
      };

      const token = await getIdToken();
      let res = await fetch(url, {
        ...options,
        headers: buildHeaders(token),
        credentials: 'same-origin',
      });

      // If a stale token triggered 401, clear or refresh once cleanly
      if (res.status === 401 && token) {
        if (sessionTokenRef.current === token) {
          persistSessionToken(null);
        }
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
          const freshToken = refreshed?.session?.access_token || null;
          if (freshToken && freshToken !== token) {
            res = await fetch(url, {
              ...options,
              headers: buildHeaders(freshToken),
              credentials: 'same-origin',
            });
          } else if (!freshToken) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          }
        }
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [getIdToken, persistSessionToken]
  );

  const syncMe = useCallback(async () => {
    try {
      const data = await apiFetch<{
        authenticated: boolean;
        user: DbUser | null;
        customerPermissions?: CustomerPermissions | null;
      }>('/api/auth/session');
      if (data.authenticated && data.user) {
        setDbUser(data.user);
        setCustomerPermissions(data.customerPermissions || null);
      } else {
        if (sessionTokenRef.current) persistSessionToken(null);
        setDbUser(null);
        setCustomerPermissions(null);
      }
    } catch {
      if (sessionTokenRef.current) persistSessionToken(null);
      setDbUser(null);
      setCustomerPermissions(null);
    } finally {
      setAuthLoading(false);
    }
  }, [apiFetch, persistSessionToken]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const wantsDraft = new URLSearchParams(window.location.search).get('previewDraft') === 'true';
      const data = await apiFetch(`/api/bootstrap${wantsDraft ? '?previewDraft=true' : ''}`);
      setSettings(data.settings || {});
      setBanners(data.banners || []);
      setPreviewDraft(Boolean(data.previewDraft));
      setCategories(data.categories || []);
      setBrands(data.brands || []);
      setFeaturedProducts(data.featuredProducts || []);
      setBestsellerProducts(data.bestsellerProducts || []);
      setNewArrivalProducts(data.newArrivalProducts || []);
      setBlogs(data.blogs || []);
      setCaseStudies(data.caseStudies || []);
      setPrintingMaterials(data.printingMaterials || []);
      setPrintingMachines(data.printingMachines || []);
      setPublishedPages(data.publishedPages || []);
      setRazorpayConfigured(Boolean(data.razorpayConfigured));
      setRazorpayMode(
        data.razorpayMode === 'live' || data.razorpayMode === 'test' || data.razorpayMode === 'sandbox'
          ? data.razorpayMode
          : data.razorpayConfigured
          ? 'test'
          : 'sandbox'
      );

      if (data.supabaseConfig?.url && data.supabaseConfig?.anonKey) {
        initSupabaseClient(data.supabaseConfig.url, data.supabaseConfig.anonKey);
        setSupabaseConfigured(true);
      }
    } catch (err) {
      console.error('Bootstrap fetch failed:', err);
    }
  }, [apiFetch]);

  useEffect(() => {
    refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const resolved = resolveRouteSeo({
      pathname: path,
      search,
      seoConfig: settings.seoConfig,
      companyInfo: settings.companyInfo,
      override: dynamicSeo,
    });
    applySeoToDocument(resolved);
  }, [path, settings.seoConfig, settings.companyInfo, dynamicSeo]);

  useEffect(() => {
    syncMe();
    const supabase = getSupabaseClient();

    let handledOAuthToken = '';
    const applyOAuthSuccess = async (payload: {
      sessionToken?: string | null;
      user?: DbUser | null;
      accessToken?: string;
      refreshToken?: string;
    }) => {
      const tokenKey = payload.sessionToken || payload.accessToken || payload.user?.uid || '';
      if (!tokenKey || handledOAuthToken === tokenKey) return;
      handledOAuthToken = tokenKey;

      if (payload.sessionToken) {
        persistSessionToken(payload.sessionToken);
      }
      if (payload.user) {
        setDbUser(payload.user);
      }
      if (supabase && payload.accessToken && payload.refreshToken) {
        await supabase.auth
          .setSession({ access_token: payload.accessToken, refresh_token: payload.refreshToken })
          .catch(() => {});
      }
      setOauthRedirectUrl(null);
      setOauthError(null);
      setAuthModalOpen(false);
      await syncMe();
      await refreshBootstrap();

      if (payload.user) {
        notify(`Signed in with Google as ${payload.user.fullName || payload.user.email}.`, 'success');
      }

      if (
        typeof window !== 'undefined' &&
        (window.location.pathname === '/login' ||
          window.location.pathname === '/register' ||
          window.location.pathname === '/admin/login')
      ) {
        const userRole = payload.user?.role;
        const saved = postAuthRedirectRef.current;
        postAuthRedirectRef.current = null;
        const dest = sanitizePostAuthRedirect(saved, userRole);
        navigate(dest);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const isTrusted =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.endsWith('nexustekfusion.in');
      if (!isTrusted) return;
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        void applyOAuthSuccess(event.data);
      }
    };
    window.addEventListener('message', handleMessage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('ntf_oauth_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          void applyOAuthSuccess(event.data);
        }
      };
    } catch {
      // BroadcastChannel optional fallback
    }

    let listener: { subscription: { unsubscribe: () => void } } | null = null;
    if (supabase) {
      const sub = supabase.auth.onAuthStateChange(async (event) => {
        if (authFlowBusyRef.current) {
          return;
        }
          if (event === 'SIGNED_OUT') {
          persistSessionToken(null);
          clearPostAuthRedirects();
          setDbUser(null);
          setCustomerPermissions(null);
          setAuthLoading(false);
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          await syncMe();
        }
      });
      listener = sub.data;
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      try {
        bc?.close();
      } catch {
        // ignore
      }
      listener?.subscription.unsubscribe();
    };
  }, [syncMe, supabaseConfigured, persistSessionToken, refreshBootstrap, notify, navigate]);

  useEffect(() => {
    if (!dbUser?.id) {
      cartHydratedForUserRef.current = null;
      return;
    }
    if (cartHydratedForUserRef.current === dbUser.id) return;
    let active = true;
    (async () => {
      try {
        const res = await apiFetch<{ items: CartItem[] }>('/api/cart');
        if (!active) return;
        const remoteItems = Array.isArray(res.items) ? res.items.filter((r) => Boolean(r?.product?.id)) : [];
        if (remoteItems.length > 0) {
          setCart((localItems) => {
            if (localItems.length === 0) return remoteItems;
            const merged = [...localItems];
            for (const r of remoteItems) {
              const idx = merged.findIndex(
                (l) => l.product.id === r.product.id && l.variant === r.variant && l.color === r.color
              );
              if (idx >= 0) {
                merged[idx] = {
                  ...merged[idx],
                  qty: Math.min(merged[idx].product.stockQty || 999, Math.max(merged[idx].qty, r.qty)),
                };
              } else {
                merged.push(r);
              }
            }
            return merged;
          });
        }
        cartHydratedForUserRef.current = dbUser.id;
      } catch {
        cartHydratedForUserRef.current = dbUser.id;
      }
    })();
    return () => {
      active = false;
    };
  }, [dbUser?.id, apiFetch]);

  useEffect(() => {
    if (!dbUser?.id || cartHydratedForUserRef.current !== dbUser.id) return;
    const timer = setTimeout(() => {
      apiFetch('/api/cart', {
        method: 'PUT',
        body: JSON.stringify({
          items: cart.map((i) => ({
            productId: i.product.id,
            qty: i.qty,
            variant: i.variant,
            color: i.color,
          })),
        }),
      }).catch((err: any) => {
        notify(err?.message || 'Failed to sync cart with cloud database.', 'error');
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [cart, dbUser?.id, apiFetch, notify]);

  const clearOauthError = useCallback(() => setOauthError(null), []);

  const setPostAuthRedirect = useCallback((dest: string) => {
    if (typeof window === 'undefined') return;
    const clean =
      dest &&
      dest.startsWith('/') &&
      !dest.startsWith('/auth/callback') &&
      dest !== '/login' &&
      dest !== '/register' &&
      dest !== '/admin/login'
        ? dest
        : '/customer/dashboard';
    postAuthRedirectRef.current = clean;
  }, []);

  const consumePostAuthRedirect = useCallback(
    (role?: string | null): string => {
      const roleFallback = getDashboardRouteForRole(role);
      if (typeof window === 'undefined') return roleFallback;
      const saved = postAuthRedirectRef.current;
      clearPostAuthRedirects();
      return sanitizePostAuthRedirect(saved, role);
    },
    [clearPostAuthRedirects]
  );

  const openAuthModal = useCallback((_mode: 'login' | 'register' = 'login') => {
    setOauthRedirectUrl(null);
    setOauthError(null);
    setAuthModalOpen(true);
  }, []);

  const signInWithSupabaseOAuth = useCallback(
    async (redirectPath?: string): Promise<{ ok: boolean; errorMessage?: string; redirectUrl?: string }> => {
      setOauthError(null);
      setOauthRedirectUrl(null);

      const currentPath =
        typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
      const targetDest = redirectPath || currentPath;
      setPostAuthRedirect(targetDest);

      const supabase = getSupabaseClient();
      if (!supabase) {
        const msg =
          'Google Sign-In requires Supabase Auth configuration (SUPABASE_URL and SUPABASE_ANON_KEY) with the Google provider enabled in Supabase Authentication settings.';
        setOauthError(msg);
        notify(msg, 'error');
        return { ok: false, errorMessage: msg };
      }

      const callbackUrl = `${window.location.origin}/auth/callback`;

      try {
        const statusRes = await fetch('/api/auth/oauth-status?probe=google');
        if (statusRes.ok) {
          const statusJson = (await statusRes.json()) as {
            googleProviderReady?: boolean | null;
            googleProviderError?: string | null;
            supabaseCallbackUrl?: string | null;
          };
          if (statusJson.googleProviderReady === false) {
            const rawMsg = statusJson.googleProviderError || 'Unsupported provider: missing OAuth secret';
            const sbOrigin = getSupabaseOrigin();
            const fallbackCb = sbOrigin ? `${sbOrigin}/auth/v1/callback` : '<YOUR_SUPABASE_URL>/auth/v1/callback';
            const friendly = /missing OAuth secret/i.test(rawMsg)
              ? `Google OAuth secret is not configured in Supabase (${rawMsg}). Open Supabase Dashboard -> Authentication -> Sign In / Providers -> Google, paste your Google OAuth Client ID and Client Secret, and save. Authorized redirect URI for Google Cloud Console: ${
                  statusJson.supabaseCallbackUrl || fallbackCb
                }`
              : `Google Sign-In is not ready in Supabase (${rawMsg}). Verify Google Provider settings in Supabase Authentication -> Providers -> Google.`;
            setOauthError(friendly);
            notify(friendly, 'error');
            return { ok: false, errorMessage: friendly };
          }
        }
      } catch {
        // Proceed cleanly if preflight probe could not reach server
      }

      const isIframe = typeof window !== 'undefined' && window.self !== window.top;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          ...(isIframe ? { skipBrowserRedirect: true } : {}),
        },
      });

      if (error) {
        console.error('Google Sign-In Error:', error.message);
        const isDisabledProvider = /unsupported provider|provider is not enabled|validation_failed/i.test(error.message || '');
        const msg = isDisabledProvider
          ? `Google provider is not enabled in Supabase Authentication (400: ${error.message}). Enable Google under Supabase Auth -> Providers -> Google, configure Google OAuth Client ID & Secret, and add ${callbackUrl} to Authorized Redirect URLs.`
          : error.message || 'Google Sign-In failed.';
        setOauthError(msg);
        notify(msg, 'error');
        return { ok: false, errorMessage: msg };
      }

      if (isIframe && data?.url) {
        setOauthRedirectUrl(data.url);
        const popup = window.open(
          data.url,
          'ntf_google_oauth',
          'width=560,height=680,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes'
        );
        if (popup) {
          notify('Complete Google Sign-In in the popup window.', 'info');
        }
        return { ok: true, redirectUrl: data.url };
      }

      return { ok: true, redirectUrl: data?.url };
    },
    [notify, setPostAuthRedirect]
  );

  const sendCustomerOtp = useCallback(async (rawEmail: string) => {
    const cleanEmail = String(rawEmail || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error(
        'Supabase Auth is not configured for Email OTP. Please verify SUPABASE_URL and SUPABASE_ANON_KEY.'
      );
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    if (error) {
      const msg = String(error.message || '');
      if (/rate limit|over_email_send_rate_limit|too many|429|security purposes/i.test(msg)) {
        throw new Error('Too many OTP requests. Please wait a moment before requesting a new code.');
      }
      if (/signup|signups not allowed|disabled/i.test(msg)) {
        throw new Error('Email OTP authentication is currently disabled in Supabase Auth settings.');
      }
      throw new Error(msg || 'Unable to send OTP verification code.');
    }
  }, []);

  const verifyCustomerOtp = useCallback(
    async (rawEmail: string, otp: string) => {
      const cleanEmail = String(rawEmail || '').trim().toLowerCase();
      const cleanOtp = String(otp || '').trim();
      if (!/^\d{6}$/.test(cleanOtp)) {
        throw new Error('Please enter a valid 6-digit verification code.');
      }
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase Auth is not configured for Email OTP.');
      }

      authFlowBusyRef.current = true;
      try {
        // Clear any prior session token / cached role before signing in as customer
        persistSessionToken(null);
        setCustomerPermissions(null);

        const { data, error } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanOtp,
          type: 'email',
        });
        if (error || !data?.session?.access_token) {
          const msg = String(error?.message || '');
          if (/expired/i.test(msg)) {
            throw new Error('This verification code has expired. Please click Resend OTP to get a new 6-digit code.');
          }
          if (/rate limit|too many|429/i.test(msg)) {
            throw new Error('Too many invalid OTP attempts. Please request a fresh verification code.');
          }
          throw new Error(msg || 'Invalid or expired verification code.');
        }

        const accessToken = data.session.access_token;
        const res = await fetch('/api/auth/otp/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'same-origin',
        });
        const json = (await res.json().catch(() => ({}))) as {
          status?: 'authenticated';
          isNewCustomer?: boolean;
          user?: DbUser;
          sessionToken?: string;
          error?: string;
        };

        if (!res.ok) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error(json.error || 'Failed to verify OTP session.');
        }

        if (!json.user || ADMIN_ROLES.has(json.user.role)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error(
            'This email is not eligible for customer sign-in. Please use a customer email address.'
          );
        }

        // Replace temporary Supabase OTP client session with isolated NTF customer session
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        cartHydratedForUserRef.current = null;
        if (json.sessionToken) persistSessionToken(json.sessionToken);
        setDbUser(json.user);
        setCustomerPermissions(null);
        await refreshBootstrap();

        notify(
          json.isNewCustomer
            ? `Account created! Your Customer ID is ${json.user.customerId || json.user.uid}.`
            : `Signed in as ${json.user.fullName || json.user.email}.`,
          'success'
        );
        return {
          status: 'authenticated' as const,
          isNewCustomer: Boolean(json.isNewCustomer),
          user: json.user,
        };
      } finally {
        authFlowBusyRef.current = false;
      }
    },
    [notify, persistSessionToken, refreshBootstrap]
  );

  const updateCustomerSettings = useCallback(
    async (prefs: NotificationPreferences): Promise<NotificationPreferences> => {
      const res = await apiFetch<{ notificationPreferences: NotificationPreferences; user?: DbUser }>(
        '/api/me/settings',
        {
          method: 'PUT',
          body: JSON.stringify({ notificationPreferences: prefs }),
        }
      );
      if (res.user) {
        setDbUser(res.user);
      } else {
        setDbUser((prev) => (prev ? { ...prev, notificationPreferences: res.notificationPreferences } : prev));
      }
      notify('Notification preferences saved.', 'success');
      return res.notificationPreferences;
    },
    [apiFetch, notify]
  );

  const signInWithAdminCredentials = useCallback(
    async (email: string, password: string) => {
      authFlowBusyRef.current = true;
      try {
        // Clear any existing customer session / Supabase client OTP state before issuing an Admin session
        const oldToken = sessionTokenRef.current;
        persistSessionToken(null);
        clearPostAuthRedirects();
        setCustomerPermissions(null);
        cartHydratedForUserRef.current = null;
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }

        const rawRes = await fetch('/api/auth/admin-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(oldToken ? { Authorization: `Bearer ${oldToken}` } : {}),
          },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password }),
        });
        const res = (await rawRes.json().catch(() => ({}))) as {
          user?: DbUser;
          sessionToken?: string;
          error?: string;
        };
        if (!rawRes.ok || !res.user) {
          throw new Error(res.error || 'Invalid admin email or password.');
        }
        if (!ADMIN_ROLES.has(res.user.role)) {
          throw new Error('This account does not hold administrator privileges.');
        }
        if (res.sessionToken) persistSessionToken(res.sessionToken);
        setDbUser(res.user);
        await syncMe();
        await refreshBootstrap();
        notify(`Signed in as ${res.user.fullName || res.user.email}.`, 'success');
        return res.user;
      } finally {
        authFlowBusyRef.current = false;
      }
    },
    [clearPostAuthRedirects, notify, persistSessionToken, refreshBootstrap, syncMe]
  );

  const sendAdminOtp = useCallback(async (rawEmail: string) => {
    const cleanEmail = String(rawEmail || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid administrator email address.');
    }
    const checkRes = await fetch('/api/auth/admin-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: cleanEmail }),
    });
    const checkJson = (await checkRes.json().catch(() => ({}))) as { authorized?: boolean; error?: string };
    if (!checkRes.ok || !checkJson.authorized) {
      throw new Error(checkJson.error || 'This email is not authorized for administrator access.');
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase Auth is not configured for Email OTP.');
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    if (error) {
      const msg = String(error.message || '');
      if (/rate limit|over_email_send_rate_limit|too many|429|security purposes/i.test(msg)) {
        throw new Error('Too many OTP requests. Please wait a moment before requesting a new code.');
      }
      throw new Error(msg || 'Unable to send administrator OTP.');
    }
  }, []);

  const verifyAdminOtp = useCallback(
    async (rawEmail: string, otp: string): Promise<DbUser> => {
      const cleanEmail = String(rawEmail || '').trim().toLowerCase();
      const cleanOtp = String(otp || '').trim();
      if (!/^\d{6}$/.test(cleanOtp)) {
        throw new Error('Please enter a valid 6-digit verification code.');
      }
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase Auth is not configured for Email OTP.');
      }

      authFlowBusyRef.current = true;
      try {
        persistSessionToken(null);
        clearPostAuthRedirects();
        setCustomerPermissions(null);
        cartHydratedForUserRef.current = null;

        const { data, error } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanOtp,
          type: 'email',
        });
        if (error || !data?.session?.access_token) {
          const msg = String(error?.message || '');
          if (/expired/i.test(msg)) {
            throw new Error('This verification code has expired. Please click Resend OTP to get a new 6-digit code.');
          }
          if (/rate limit|too many|429/i.test(msg)) {
            throw new Error('Too many invalid OTP attempts. Please request a fresh verification code.');
          }
          throw new Error(msg || 'Invalid or expired verification code.');
        }

        const accessToken = data.session.access_token;
        const rawRes = await fetch('/api/auth/admin-otp/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'same-origin',
        });
        const res = (await rawRes.json().catch(() => ({}))) as {
          user?: DbUser;
          sessionToken?: string;
          error?: string;
        };

        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

        if (!rawRes.ok || !res.user) {
          throw new Error(res.error || 'Administrator OTP verification failed.');
        }
        if (!ADMIN_ROLES.has(res.user.role)) {
          throw new Error('This account does not hold administrator privileges.');
        }

        if (res.sessionToken) persistSessionToken(res.sessionToken);
        setDbUser(res.user);
        await syncMe();
        await refreshBootstrap();
        notify(`Signed in as ${res.user.fullName || res.user.email}.`, 'success');
        return res.user;
      } finally {
        authFlowBusyRef.current = false;
      }
    },
    [clearPostAuthRedirects, notify, persistSessionToken, refreshBootstrap, syncMe]
  );

  const claimAdminSetup = useCallback(
    async (params: { email: string; password: string; fullName?: string }): Promise<DbUser> => {
      authFlowBusyRef.current = true;
      try {
        persistSessionToken(null);
        clearPostAuthRedirects();
        setCustomerPermissions(null);
        cartHydratedForUserRef.current = null;

        const rawRes = await fetch('/api/auth/admin-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(params),
        });
        const res = (await rawRes.json().catch(() => ({}))) as {
          user?: DbUser;
          sessionToken?: string;
          error?: string;
        };
        if (!rawRes.ok || !res.user) {
          throw new Error(res.error || 'Failed to complete administrator setup.');
        }
        if (res.sessionToken) persistSessionToken(res.sessionToken);
        setDbUser(res.user);
        await syncMe();
        await refreshBootstrap();
        notify(`Super Admin account claimed for ${res.user.email}.`, 'success');
        return res.user;
      } finally {
        authFlowBusyRef.current = false;
      }
    },
    [clearPostAuthRedirects, notify, persistSessionToken, refreshBootstrap, syncMe]
  );

  const signOut = useCallback(async () => {
    authFlowBusyRef.current = true;
    try {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      }
      persistSessionToken(null);
      clearPostAuthRedirects();
      setCustomerPermissions(null);
      cartHydratedForUserRef.current = null;
      setCart([]);
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
      setDbUser(null);
      notify('Signed out.', 'info');
    } finally {
      authFlowBusyRef.current = false;
    }
  }, [apiFetch, clearPostAuthRedirects, notify, persistSessionToken]);

  const addToCart = useCallback(
    (product: Product, qty = 1, variant?: string, color?: string) => {
      if (product.productType === 'quote_only' || product.priceInr <= 0) {
        notify(`"${product.name}" requires a quotation request.`, 'info');
        return;
      }
      setCart((prev) => {
        const idx = prev.findIndex(
          (i) => i.product.id === product.id && i.variant === variant && i.color === color
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], qty: Math.min(product.stockQty, copy[idx].qty + qty) };
          return copy;
        }
        return [...prev, { product, qty: Math.min(product.stockQty, qty), variant, color }];
      });
      setCartDrawerOpen(true);
      notify(`Added "${product.name}" to cart.`, 'success');
    },
    [notify]
  );

  const updateCartQty = useCallback(
    (productId: number, variant: string | undefined, color: string | undefined, qty: number) => {
      setCart((prev) =>
        qty <= 0
          ? prev.filter((i) => !(i.product.id === productId && i.variant === variant && i.color === color))
          : prev.map((i) =>
              i.product.id === productId && i.variant === variant && i.color === color
                ? { ...i, qty: Math.min(i.product.stockQty, qty) }
                : i
            )
      );
    },
    []
  );

  const removeFromCart = useCallback((productId: number, variant?: string, color?: string) => {
    setCart((prev) =>
      prev.filter((i) => !(i.product.id === productId && i.variant === variant && i.color === color))
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const isSignedIn = Boolean(dbUser);
  const isAdmin = Boolean(dbUser && ADMIN_ROLES.has(dbUser.role));

  return (
    <PlatformContext.Provider
      value={{
        path,
        navigate,
        dbUser,
        customerPermissions,
        isSignedIn,
        authLoading,
        isAdmin,
        supabaseConfigured,
        oauthError,
        oauthRedirectUrl,
        clearOauthError,
        setPostAuthRedirect,
        consumePostAuthRedirect,
        openAuthModal,
        signInWithSupabaseOAuth,
        sendCustomerOtp,
        verifyCustomerOtp,
        updateCustomerSettings,
        signInWithAdminCredentials,
        sendAdminOtp,
        verifyAdminOtp,
        claimAdminSetup,
        signOut,
        apiFetch,
        getIdToken,
        settings,
        banners,
        previewDraft,
        categories,
        brands,
        featuredProducts,
        bestsellerProducts,
        newArrivalProducts,
        blogs,
        caseStudies,
        printingMaterials,
        printingMachines,
        publishedPages,
        razorpayConfigured,
        razorpayMode,
        refreshBootstrap,
        refreshMe: syncMe,
        cart,
        cartDrawerOpen,
        setCartDrawerOpen,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        startGuestSession,
        notify,
        setDynamicSeo,
      }}
    >
      {children}
      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setOauthRedirectUrl(null);
          setOauthError(null);
        }}
        onSuccessRedirect={(dest) => {
          setAuthModalOpen(false);
          if (path === '/login' || path === '/register' || dest) {
            navigate(dest || '/customer/dashboard');
          }
        }}
      />
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-transform ${
              t.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : t.tone === 'success'
                ? 'border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D]'
                : 'border-[#DCEAF5] bg-white text-[#263746]'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </PlatformContext.Provider>
  );
};

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
