/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from 'react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { FaqPage, PolicyPage } from './pages/AboutAndLegalPages';
import {
  ServicesOverviewPage,
  CustomEngineeringServicePage,
  PcbServicePage,
  DroneRepairServicePage,
} from './pages/ServicesPages';
import { Printing3DPage } from './pages/Printing3DPage';
import { ShopListingPage, ProductDetailPage, CartPage, CheckoutPage } from './pages/ShopPages';
import { ProjectsShowcasePage, ProjectDetailPage, ProjectEnquiryPage } from './pages/ProjectsAndEnquiryPages';
import { B2BPortalPage } from './pages/B2BPage';
import { BlogsListPage, BlogDetailPage, ContactPage, TrackOrderPage } from './pages/BlogsAndContactPages';
import { CustomerDashboardPage } from './pages/CustomerDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { KrashivantriPage } from './pages/KrashivantriPage';
import { KrashivantriProductPage, KrashivantriComparePage } from './pages/KrashivantriProductPage';
import { FarmerPortalPage, PilotPortalPage } from './pages/KrashivantriPortalsPage';
import { CustomCmsPage } from './pages/CustomCmsPage';
import { WebsiteEditorPage } from './pages/WebsiteEditorPage';
import { AuthCallbackPage, LoginPage, RegisterPage } from './pages/AuthPages';
import { NagpurPage, MaharashtraPage } from './pages/LocalSeoPages';
import { AdminRouteGuard, CustomerRouteGuard, RolePortalDashboardRoute } from './components/RoleGuards';

const RedirectHome: React.FC = () => {
  const { navigate } = usePlatform();
  useEffect(() => {
    navigate('/');
  }, [navigate]);
  return null;
};

const AppRouter: React.FC = () => {
  const { path, navigate } = usePlatform();
  const normalized = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;

  const renderRoute = () => {
    if (normalized === '/') return <HomePage />;
    if (normalized === '/about' || normalized.startsWith('/about/')) return <RedirectHome />;
    if (normalized === '/services') return <ServicesOverviewPage />;
    if (
      normalized === '/services/custom-engineering' ||
      normalized === '/services/custom-engineering-projects'
    ) {
      return <CustomEngineeringServicePage />;
    }
    if (normalized === '/services/pcb-design') return <PcbServicePage />;
    if (normalized === '/services/3d-printing') return <Printing3DPage />;
    if (normalized === '/services/drone-repair') return <DroneRepairServicePage />;

    if (normalized === '/projects') return <ProjectsShowcasePage />;
    if (normalized.startsWith('/projects/')) {
      const slug = decodeURIComponent(normalized.replace('/projects/', ''));
      return <ProjectDetailPage slug={slug} />;
    }
    if (normalized === '/register-project' || normalized === '/project-enquiry') {
      return <ProjectEnquiryPage />;
    }

    if (normalized === '/krashivantri') return <KrashivantriPage />;
    if (
      normalized === '/krashivantri-x' ||
      normalized === '/product/krashivantri-x' ||
      normalized === '/products/krashivantri-x'
    ) {
      return <KrashivantriProductPage slug="krashivantri-x" />;
    }
    if (
      normalized === '/krashivantri-x-pro' ||
      normalized === '/product/krashivantri-x-pro' ||
      normalized === '/products/krashivantri-x-pro'
    ) {
      return <KrashivantriProductPage slug="krashivantri-x-pro" />;
    }
    if (normalized === '/krashivantri/compare') return <KrashivantriComparePage />;
    if (normalized === '/krashivantri/enquiry') return <KrashivantriPage initialScrollToEnquiry />;
    if (normalized === '/krashivantri/farmer-portal') return <FarmerPortalPage />;
    if (normalized === '/krashivantri/pilot-portal') return <PilotPortalPage />;

    if (normalized === '/login' || normalized === '/forgot-password' || normalized === '/reset-password') return <LoginPage />;
    if (normalized === '/register') return <RegisterPage />;
    if (normalized === '/auth/callback') return <AuthCallbackPage />;

    if (normalized === '/shop' || normalized === '/store') return <ShopListingPage />;
    if (normalized.startsWith('/shop/category/')) {
      const slug = decodeURIComponent(normalized.replace('/shop/category/', ''));
      return <ShopListingPage categorySlug={slug} />;
    }
    if (normalized.startsWith('/store/category/')) {
      const slug = decodeURIComponent(normalized.replace('/store/category/', ''));
      return <ShopListingPage categorySlug={slug} />;
    }
    if (normalized.startsWith('/product/')) {
      const slug = decodeURIComponent(normalized.replace('/product/', ''));
      return <ProductDetailPage slug={slug} />;
    }
    if (normalized.startsWith('/products/')) {
      const slug = decodeURIComponent(normalized.replace('/products/', ''));
      return <ProductDetailPage slug={slug} />;
    }
    if (normalized.startsWith('/p/')) {
      const slug = decodeURIComponent(normalized.replace('/p/', ''));
      return <CustomCmsPage slug={slug} />;
    }
    if (normalized === '/store/3d-printed-products') return <ShopListingPage scope="3d_printed" />;
    if (normalized === '/store/offers' || normalized === '/sale') return <ShopListingPage saleOnly />;

    if (normalized === '/b2b') return <B2BPortalPage />;
    if (normalized === '/blogs') return <BlogsListPage />;
    if (normalized.startsWith('/blogs/')) {
      const slug = decodeURIComponent(normalized.replace('/blogs/', ''));
      return <BlogDetailPage slug={slug} />;
    }

    if (normalized === '/nagpur') return <NagpurPage />;
    if (normalized === '/maharashtra') return <MaharashtraPage />;
    if (normalized === '/contact') return <ContactPage />;
    if (normalized === '/faq') return <FaqPage />;
    if (normalized === '/shipping-policy') {
      return <PolicyPage type="shipping" title="Shipping Policy" />;
    }
    if (normalized === '/return-refund-policy') {
      return <PolicyPage type="returnRefund" title="Return & Refund Policy" />;
    }
    if (normalized === '/privacy-policy') {
      return <PolicyPage type="privacy" title="Privacy Policy" />;
    }
    if (normalized === '/terms-and-conditions') {
      return <PolicyPage type="terms" title="Terms & Conditions" />;
    }

    if (normalized === '/customer/dashboard' || normalized === '/my-account') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/orders' || normalized === '/my-account/orders') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="orders" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/track-orders' || normalized === '/my-account/track-orders') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="tracking" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/invoices' || normalized === '/my-account/invoices') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="invoices" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/addresses' || normalized === '/my-account/addresses') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="addresses" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/enquiries' || normalized === '/my-account/enquiries') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="enquiries" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/reviews' || normalized === '/my-account/reviews') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="reviews" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/wishlist' || normalized === '/my-account/wishlist') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="wishlist" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/profile' || normalized === '/my-account/profile') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="profile" />
        </CustomerRouteGuard>
      );
    }
    if (
      normalized === '/customer/dashboard/project-enquiries' ||
      normalized === '/my-account/project-enquiries' ||
      normalized === '/customer/dashboard/projects' ||
      normalized === '/my-account/projects'
    ) {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="projects" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/cart' || normalized === '/my-account/cart') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="cart" />
        </CustomerRouteGuard>
      );
    }
    if (
      normalized === '/customer/dashboard/3d-printing' ||
      normalized === '/my-account/3d-printing'
    ) {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="printing" />
        </CustomerRouteGuard>
      );
    }
    if (
      normalized === '/customer/dashboard/pcb' ||
      normalized === '/my-account/pcb' ||
      normalized === '/customer/dashboard/pcb-services' ||
      normalized === '/my-account/pcb-services'
    ) {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="pcb" />
        </CustomerRouteGuard>
      );
    }
    if (
      normalized === '/customer/dashboard/b2b-support' ||
      normalized === '/my-account/b2b-support' ||
      normalized === '/customer/dashboard/support' ||
      normalized === '/my-account/support' ||
      normalized === '/customer/dashboard/b2b' ||
      normalized === '/my-account/b2b'
    ) {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="b2b_support" />
        </CustomerRouteGuard>
      );
    }
    if (normalized === '/customer/dashboard/settings' || normalized === '/my-account/settings') {
      return (
        <CustomerRouteGuard>
          <CustomerDashboardPage initialTab="settings" />
        </CustomerRouteGuard>
      );
    }

    if (normalized === '/partner/dashboard') {
      return <RolePortalDashboardRoute expectedRole="drone_partner" />;
    }
    if (normalized === '/mitra/dashboard') {
      return <RolePortalDashboardRoute expectedRole="drone_mitra" />;
    }
    if (normalized === '/fpo/dashboard') {
      return <RolePortalDashboardRoute expectedRole="fpo" />;
    }

    if (normalized === '/cart') return <CartPage />;
    if (normalized === '/checkout') return <CheckoutPage />;
    if (normalized === '/track-order') return <TrackOrderPage />;
    if (normalized === '/admin/login') return <AdminLoginPage />;
    if (normalized === '/admin' || normalized === '/admin/dashboard') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/website-editor') {
      return (
        <AdminRouteGuard>
          <WebsiteEditorPage />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/project-enquiries' || normalized === '/admin/projects') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="projects" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/project-settings' || normalized === '/admin/settings/project-payments') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="project_payment_settings" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/project-finance') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="project_finance" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/settings/payments') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="payment_settings" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/farmers') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_farmers" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/drone-pilots') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_pilots" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/live-tracking') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_live_tracking" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/orders/live') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_orders_live" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/farmer-payments') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_farmer_payments" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/pilot-payouts') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_pilot_payouts" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/penalties') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_penalties" />
        </AdminRouteGuard>
      );
    }
    if (normalized === '/admin/finance') {
      return (
        <AdminRouteGuard>
          <AdminDashboardPage initialTab="krash_finance" />
        </AdminRouteGuard>
      );
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center space-y-5">
        <div className="font-mono text-xs font-semibold text-[#64B5F6]">404 — Route Not Found</div>
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">
          Page Not Available
        </h1>
        <p className="text-sm text-[#263746]">
          The requested path <span className="font-mono font-semibold text-[#123B5D]">{normalized}</span> does not match an active page on NexusTekFusion.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold transition-colors"
          >
            Back to Home
          </button>
          <button
            onClick={() => navigate('/store')}
            className="px-5 py-2.5 rounded-lg border border-[#90CAF9] bg-white text-[#123B5D] text-sm font-semibold hover:bg-[#F0F8FF] hover:border-[#42A5F5] transition-colors"
          >
            Browse Store
          </button>
        </div>
      </div>
    );
  };

  return <Layout>{renderRoute()}</Layout>;
};

export default function App() {
  return (
    <PlatformProvider>
      <AppRouter />
    </PlatformProvider>
  );
}
