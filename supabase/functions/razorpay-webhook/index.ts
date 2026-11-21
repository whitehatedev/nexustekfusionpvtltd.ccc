// Supabase Edge Function: razorpay-webhook
// Endpoint: https://leawuzhjkuzwgzdduwzq.supabase.co/functions/v1/razorpay-webhook
// Required Edge Function Secrets:
//   RAZORPAY_WEBHOOK_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-razorpay-event-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return constantTimeEqualHex(computedHex.toLowerCase(), signatureHeader.trim().toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'RAZORPAY_WEBHOOK_SECRET is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    const isValid = await verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid Razorpay webhook signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.parse(rawBody || '{}');
    const eventType = String(payload?.event || 'unknown');
    const paymentEntity = payload?.payload?.payment?.entity || null;
    const refundEntity = payload?.payload?.refund?.entity || null;
    const paymentLinkEntity = payload?.payload?.payment_link?.entity || null;

    const razorpayPaymentId = String(paymentEntity?.id || refundEntity?.payment_id || '');
    const razorpayOrderId = String(paymentEntity?.order_id || '');
    const razorpayRefundId = String(refundEntity?.id || '');
    const paymentLinkId = String(paymentLinkEntity?.id || paymentEntity?.notes?.payment_link_id || '');
    const eventId = String(
      req.headers.get('x-razorpay-event-id') ||
        `${eventType}_${razorpayRefundId || razorpayPaymentId || paymentLinkId || razorpayOrderId || Date.now()}`
    );

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ received: true, warning: 'Supabase admin env not set' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Idempotency guard: skip duplicate webhook deliveries safely
    const { data: existingEvent } = await supabase
      .from('payment_webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingEvent) {
      return new Response(JSON.stringify({ received: true, duplicate: true, eventId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('payment_webhook_events').insert({
      event_id: eventId,
      event_type: eventType,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      payment_link_id: paymentLinkId,
      razorpay_refund_id: razorpayRefundId,
      payload,
      processing_status: 'processed',
    });

    const amountPaise = Number(
      paymentEntity?.amount || paymentLinkEntity?.amount_paid || paymentLinkEntity?.amount || refundEntity?.amount || 0
    );
    const amountInr = Math.round(amountPaise / 100);

    if (
      paymentLinkId &&
      ['payment_link.paid', 'payment_link.partially_paid', 'payment_link.cancelled', 'payment_link.expired'].includes(
        eventType
      )
    ) {
      const nextStatus =
        eventType === 'payment_link.paid'
          ? 'paid'
          : eventType === 'payment_link.partially_paid'
          ? 'partially_paid'
          : eventType === 'payment_link.cancelled'
          ? 'cancelled'
          : 'expired';
      await supabase
        .from('razorpay_payment_links')
        .update({
          status: nextStatus,
          ...(razorpayPaymentId ? { razorpay_payment_id: razorpayPaymentId } : {}),
          ...(eventType === 'payment_link.paid' ? { payment_date: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('payment_link_id', paymentLinkId);
    }

    if (eventType === 'payment.authorized' || eventType === 'payment.captured' || eventType === 'order.paid' || eventType === 'payment_link.paid') {
      if (razorpayOrderId) {
        await supabase
          .from('store_orders')
          .update({
            payment_status: 'paid',
            order_status: 'Payment Confirmed',
            razorpay_payment_id: razorpayPaymentId,
          })
          .eq('razorpay_order_id', razorpayOrderId);

        await supabase
          .from('printing_orders')
          .update({
            payment_status: 'paid',
            refund_status: 'none',
            payment_verified_at: new Date().toISOString(),
            order_status: 'Payment Completed',
            razorpay_payment_id: razorpayPaymentId,
          })
          .eq('razorpay_order_id', razorpayOrderId);

        const { data: matchedQuote } = await supabase
          .from('project_quotations')
          .select('*')
          .eq('razorpay_order_id', razorpayOrderId)
          .maybeSingle();

        if (matchedQuote && (eventType === 'payment.captured' || eventType === 'order.paid')) {
          const newPaid = Math.min(
            Number(matchedQuote.total_amount_inr || 0),
            Number(matchedQuote.paid_amount_inr || 0) + amountInr
          );
          const fullyPaid = newPaid >= Number(matchedQuote.total_amount_inr || 0);
          await supabase
            .from('project_quotations')
            .update({
              paid_amount_inr: newPaid,
              payment_status: fullyPaid ? 'paid' : 'partial',
              razorpay_payment_id: razorpayPaymentId,
            })
            .eq('id', matchedQuote.id);

          await supabase.from('project_payments').upsert(
            {
              payment_ref: `WH-${razorpayPaymentId.slice(-8).toUpperCase()}`,
              registration_number: matchedQuote.registration_number,
              quotation_number: matchedQuote.quotation_number,
              payment_stage: Number(matchedQuote.paid_amount_inr || 0) === 0 && !fullyPaid ? 'advance' : 'final',
              amount_inr: amountInr,
              amount_paise: amountPaise,
              razorpay_order_id: razorpayOrderId,
              razorpay_payment_id: razorpayPaymentId,
              status: 'verified',
              verified_at: new Date().toISOString(),
            },
            { onConflict: 'razorpay_payment_id' }
          );
        }
      }

      if (razorpayPaymentId && (eventType === 'payment.captured' || eventType === 'order.paid')) {
        await supabase.from('razorpay_payments').upsert(
          {
            payment_ref: `WH-${razorpayPaymentId.slice(-8).toUpperCase()}`,
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            amount_inr: amountInr,
            amount_paise: amountPaise,
            status: 'captured',
            verified_at: new Date().toISOString(),
          },
          { onConflict: 'razorpay_payment_id' }
        );

        // Also reconcile matching KRASHIVANTRI mobile order if referenced in notes
        const orderRef = paymentEntity?.notes?.krashivantri_order_id || paymentEntity?.notes?.order_id;
        if (orderRef) {
          await supabase
            .from('orders')
            .update({ payment_status: 'paid', razorpay_payment_id: razorpayPaymentId })
            .eq('id', String(orderRef));
        }
      }
    } else if (eventType === 'payment.failed') {
      const errorCode = String(paymentEntity?.error_code || 'PAYMENT_FAILED');
      const failureReason = String(
        paymentEntity?.error_description || paymentEntity?.error_reason || 'Payment failed at gateway'
      );

      if (razorpayOrderId) {
        await supabase
          .from('store_orders')
          .update({ payment_status: 'failed' })
          .eq('razorpay_order_id', razorpayOrderId)
          .neq('payment_status', 'paid');

        await supabase
          .from('printing_orders')
          .update({ payment_status: 'failed', order_status: 'Payment Pending' })
          .eq('razorpay_order_id', razorpayOrderId)
          .neq('payment_status', 'paid');
      }

      if (razorpayPaymentId) {
        await supabase.from('razorpay_payments').upsert(
          {
            payment_ref: `WHF-${razorpayPaymentId.slice(-8).toUpperCase()}`,
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            amount_inr: amountInr,
            amount_paise: amountPaise,
            status: 'failed',
            error_code: errorCode,
            failure_reason: failureReason,
          },
          { onConflict: 'razorpay_payment_id' }
        );
      }
    } else if (eventType === 'refund.processed' || eventType === 'refund.created') {
      if (razorpayRefundId) {
        await supabase.from('payment_refunds').upsert(
          {
            refund_ref: `RFND-${razorpayRefundId.slice(-8).toUpperCase()}`,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_refund_id: razorpayRefundId,
            amount_inr: amountInr,
            amount_paise: amountPaise,
            status: eventType === 'refund.processed' ? 'processed' : 'pending',
            processed_at: eventType === 'refund.processed' ? new Date().toISOString() : null,
          },
          { onConflict: 'razorpay_refund_id' }
        );
      }

      if (razorpayPaymentId && eventType === 'refund.processed') {
        await supabase
          .from('razorpay_payments')
          .update({
            status: 'refunded',
            refund_status: 'full',
            refunded_amount_inr: amountInr,
          })
          .eq('razorpay_payment_id', razorpayPaymentId);

        await supabase
          .from('store_orders')
          .update({
            payment_status: 'refunded',
            refund_status: 'full',
          })
          .eq('razorpay_payment_id', razorpayPaymentId);

        await supabase
          .from('printing_orders')
          .update({
            payment_status: 'refunded',
            refund_status: 'full',
          })
          .eq('razorpay_payment_id', razorpayPaymentId);
      }
    } else if (eventType === 'refund.failed') {
      if (razorpayRefundId) {
        await supabase
          .from('payment_refunds')
          .update({ status: 'failed' })
          .eq('razorpay_refund_id', razorpayRefundId);
      }
      if (razorpayPaymentId) {
        await supabase
          .from('store_orders')
          .update({ refund_status: 'failed' })
          .eq('razorpay_payment_id', razorpayPaymentId);
      }
    }

    return new Response(
      JSON.stringify({ received: true, eventId, eventType }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Webhook processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
