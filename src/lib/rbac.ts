export const ADMIN_ROLES_SET = new Set([
  'super_admin',
  'admin',
  'website_manager',
  'product_manager',
  'sales_manager',
  'project_manager',
  'engineer',
  'printing_operator',
  'inventory_manager',
  'accounts_manager',
  'support_manager',
  'support_staff',
]);

export function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  return ADMIN_ROLES_SET.has(String(role).trim().toLowerCase());
}

export function getDashboardRouteForRole(role?: string | null): string {
  const normalized = String(role || '').trim().toLowerCase();
  if (ADMIN_ROLES_SET.has(normalized)) {
    return '/admin/dashboard';
  }
  switch (normalized) {
    case 'drone_partner':
      return '/partner/dashboard';
    case 'drone_mitra':
      return '/mitra/dashboard';
    case 'fpo':
      return '/fpo/dashboard';
    case 'customer':
    default:
      return '/customer/dashboard';
  }
}

export function isAdminRoutePath(pathname?: string | null): boolean {
  const p = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (p === '/admin/login') return false;
  return p === '/admin' || p.startsWith('/admin/');
}

export function isRouteAllowedForRole(pathname: string, role?: string | null): boolean {
  const p = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (isAdminRoutePath(p)) {
    return isAdminRole(role);
  }
  return true;
}

export function sanitizePostAuthRedirect(dest: string | null | undefined, role?: string | null): string {
  const fallback = getDashboardRouteForRole(role);
  const raw = String(dest || '').trim();
  if (!raw || !raw.startsWith('/')) {
    return fallback;
  }
  const cleanPath = raw.split('?')[0].replace(/\/+$/, '') || '/';
  if (
    cleanPath === '/login' ||
    cleanPath === '/register' ||
    cleanPath === '/forgot-password' ||
    cleanPath === '/reset-password' ||
    cleanPath === '/admin/login' ||
    cleanPath.startsWith('/auth/callback')
  ) {
    return fallback;
  }
  if (isAdminRoutePath(cleanPath) && !isAdminRole(role)) {
    return fallback;
  }
  return raw;
}
