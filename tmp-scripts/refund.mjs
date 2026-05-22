import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const pi = 'pi_3TZlrhEFKvOVcKUh030qoRhu';
const orderId = '1c2a9da4-ac2d-4787-922e-5fb711cbf98d';
const refund = await stripe.refunds.create({
  payment_intent: pi,
  reverse_transfer: true,
  refund_application_fee: true,
  reason: 'requested_by_customer',
  metadata: { order_id: orderId, manual: 'support_refund_timothy_35' },
}, { idempotencyKey: `refund:${orderId}` });
console.log(JSON.stringify(refund, null, 2));
