import React, { useState } from 'react';
import { AlertCircle, ShieldCheck, CreditCard, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

interface RazorpayModalProps {
  open: boolean;
  onClose: () => void;
  entityType: 'store_order' | 'printing_order' | 'project_quotation' | 'project_installment' | 'pcb_enquiry' | 'b2b_enquiry' | 'farmer_booking';
  entityId: number;
  paymentMode?: 'advance' | 'full' | 'balance';
  title: string;
  amountInr: number;
  createOrderUrl?: string;
  verifyUrl?: string;
  onSuccess: () => void;
}

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export const RazorpayCheckoutModal: React.FC<RazorpayModalProps> = ({
  open,
  onClose,
  entityType,
  entityId,
  paymentMode,
  title,
  amountInr,
  createOrderUrl = '/api/payments/create-order',
  verifyUrl = '/api/payments/verify',
  onSuccess,
}) => {
  const { apiFetch, notify, razorpayMode, settings } = usePlatform();
  const [loading, setLoading] = useState(false);
  const [failureError, setFailureError] = useState('');
  const customerCareEmail = settings.companyInfo?.customerCareEmail || 'info@nexustekfusion.in';

  if (!open) return null;

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePay = async () => {
    setLoading(true);
    setFailureError('');
    try {
      const orderData = await apiFetch<{
        mode: 'live_razorpay' | 'test_mode';
        gatewayMode?: 'live' | 'test' | 'sandbox';
        razorpayOrderId: string;
        keyId: string | null;
        amountPaise: number;
        customer: { name: string; email: string; contact: string };
      }>(createOrderUrl, {
        method: 'POST',
        body: JSON.stringify({ entityType, entityId, paymentMode }),
      });

      if (orderData.keyId) {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          throw new Error('Failed to load Razorpay Checkout script.');
        }

        const rzp = new window.Razorpay({
          key: orderData.keyId,
          amount: orderData.amountPaise,
          currency: 'INR',
          name: 'NEXUSTEKFUSION PRIVATE LIMITED',
          description: title,
          order_id: orderData.razorpayOrderId,
          prefill: orderData.customer,
          handler: async (resp: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              await apiFetch(verifyUrl, {
                method: 'POST',
                body: JSON.stringify({
                  entityType,
                  entityId,
                  paymentMode,
                  razorpayOrderId: resp.razorpay_order_id,
                  razorpayPaymentId: resp.razorpay_payment_id,
                  razorpaySignature: resp.razorpay_signature,
                }),
              });
              notify('Payment verified and confirmed.', 'success');
              onSuccess();
              onClose();
            } catch (verifyErr: any) {
              const msg = verifyErr?.message || 'Payment signature verification failed.';
              setFailureError(msg);
              notify(msg, 'error');
            }
          },
          theme: { color: '#64B5F6' },
        });

        rzp.on('payment.failed', async (resp: any) => {
          const errObj = resp?.error || {};
          const errorCode = errObj.code || 'PAYMENT_FAILED';
          const failureReason =
            errObj.description || errObj.reason || 'Payment declined or cancelled by issuing bank.';
          setFailureError(`${failureReason} (${errorCode})`);
          try {
            await apiFetch('/api/payments/failed', {
              method: 'POST',
              body: JSON.stringify({
                entityType,
                entityId,
                razorpayOrderId: errObj.metadata?.order_id || orderData.razorpayOrderId,
                razorpayPaymentId: errObj.metadata?.payment_id || '',
                errorCode,
                failureReason,
              }),
            });
          } catch {
            // non-blocking failure telemetry
          }
          notify(`Payment failed: ${failureReason}`, 'error');
        });

        rzp.open();
      } else {
        // Explicit server-verified Sandbox Test Mode when RAZORPAY_KEY_ID / SECRET are not configured
        await apiFetch(verifyUrl, {
          method: 'POST',
          body: JSON.stringify({
            entityType,
            entityId,
            paymentMode,
            razorpayOrderId: orderData.razorpayOrderId,
          }),
        });
        notify('Sandbox Test Payment verified on server.', 'success');
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      const msg = err?.message || 'Payment initiation failed.';
      setFailureError(msg);
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123B5D]/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md rounded-xl bg-white border border-[#DCEAF5] p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between border-b border-[#DCEAF5] pb-4">
          <div>
            <div className="text-xs font-medium text-[#263746] flex items-center gap-2">
              <span>Razorpay Secure Checkout</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] text-[#123B5D] uppercase">
                {razorpayMode === 'live' ? 'Live Mode' : razorpayMode === 'test' ? 'Test Mode' : 'Sandbox'}
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-[#123B5D] mt-0.5">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#263746] hover:text-[#123B5D] hover:bg-[#F0F8FF] rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#F0F8FF] border border-[#DCEAF5] rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-[#263746]">Payable Amount</span>
          <span className="font-mono text-xl font-bold text-[#123B5D] tabular-nums">
            ₹{amountInr.toLocaleString('en-IN')}
          </span>
        </div>

        {failureError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold">{failureError}</div>
              <div>
                You can retry payment or{' '}
                <a href={`mailto:${customerCareEmail}`} className="underline font-semibold">
                  Contact Customer Support
                </a>
                .
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-[#263746] space-y-2 leading-relaxed">
          <p className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#64B5F6] shrink-0 mt-0.5" />
            <span>
              Payments are created and HMAC-verified securely on the NexusTekFusion backend server via Razorpay Checkout (UPI, Cards, NetBanking &amp; Wallets).
            </span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#123B5D] bg-white border border-[#90CAF9] rounded-lg hover:bg-[#F0F8FF] hover:border-[#42A5F5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handlePay}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#64B5F6] hover:bg-[#42A5F5] rounded-lg disabled:opacity-50 inline-flex items-center gap-2 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            {loading ? 'Processing...' : `Pay ₹${amountInr.toLocaleString('en-IN')}`}
          </button>
        </div>
      </div>
    </div>
  );
};
