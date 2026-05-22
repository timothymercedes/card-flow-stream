import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const customer = 'cus_UYOuiYHbZEc8Aw';
const charges = await stripe.charges.list({ customer, limit: 20 });
for (const c of charges.data) {
  console.log(c.id, c.amount/100, c.currency, c.status, 'refunded:', c.refunded, 'amount_refunded:', c.amount_refunded/100, 'pi:', c.payment_intent, 'created:', new Date(c.created*1000).toISOString());
  console.log('  desc:', c.description, 'meta:', JSON.stringify(c.metadata));
}
