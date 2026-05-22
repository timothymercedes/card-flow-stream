UPDATE orders
SET payment_status='refunded',
    stripe_payment_intent_id='pi_3TZlrhEFKvOVcKUh030qoRhu',
    refunded_amount=33.98,
    refunded_at=now(),
    refunded_tax_cents=0
WHERE id='1c2a9da4-ac2d-4787-922e-5fb711cbf98d';