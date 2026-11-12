"""Real, opt-in sandbox regression: python3 scripts/marketplace-payment-e2e.py.

Requires a managed browser session (lovable auth-session --json --self),
the linked sandbox gateway credentials, webhook secret, and BETA_PASSWORD
when beta access is enabled. Uses localhost only, never live credentials.
Temporary unpaid orders are deleted in finally; no payout requests are created.
Evidence stays under /tmp/browser/marketplace-payment-e2e.
"""
import asyncio
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import time
import uuid

import requests
from playwright.async_api import async_playwright, expect

ORIGIN = "http://localhost:8080"
EVIDENCE = Path("/tmp/browser/marketplace-payment-e2e")
EVIDENCE.mkdir(parents=True, exist_ok=True)


def stripe(path, params=None):
    response = requests.get(
        "https://connector-gateway.lovable.dev/stripe/v1/" + path,
        headers={"X-Connection-Api-Key": os.environ["STRIPE_SANDBOX_API_KEY"],
                 "Lovable-API-Key": os.environ["LOVABLE_API_KEY"]},
        params=params, timeout=45,
    )
    assert response.status_code == 200, f"Sandbox Stripe read failed: HTTP {response.status_code}"
    return response.json()


async def order_state(page, order_id):
    return await page.evaluate("""async id => {
      const {supabase} = await import('/src/integrations/supabase/client.ts');
      const r = await supabase.from('orders').select('*').eq('id',id).single();
      if(r.error) throw new Error(r.error.message); return r.data;
    }""", order_id)


async def balances(page, user_id):
    return await page.evaluate("""async user => {
      const {supabase} = await import('/src/integrations/supabase/client.ts');
      const {getSellerPayableFn} = await import('/src/lib/payouts.functions.ts');
      const requests = await supabase.from('payout_requests').select('id,status,amount_cents').eq('user_id',user).order('id');
      if(requests.error) throw new Error(requests.error.message);
      return {payable: await getSellerPayableFn({}), requests: requests.data};
    }""", user_id)


async def notify(page, event_type, obj, suffix):
    # Signed sandbox notification exercises the actual public handler, including retries.
    event = {"id": "evt_regression_" + suffix, "object": "event", "livemode": False,
             "type": event_type, "data": {"object": obj}}
    body = json.dumps(event, separators=(",", ":"))
    timestamp = str(int(time.time()))
    signature = hmac.new(os.environ["PAYMENTS_SANDBOX_WEBHOOK_SECRET"].encode(),
                         (timestamp + "." + body).encode(), hashlib.sha256).hexdigest()
    for _ in range(2):
        response = await page.request.post(ORIGIN + "/api/public/payments/webhook?env=sandbox",
            data=body, headers={"Content-Type": "application/json", "stripe-signature": f"t={timestamp},v1={signature}"})
        assert response.status == 200, "Signed test notification was not accepted"
        assert (await response.json()).get("test") is True


async def checkout_frame(page):
    for _ in range(90):
        for frame in page.frames:
            if await frame.get_by_text("Card", exact=True).count():
                return frame
        await page.wait_for_timeout(1000)
    raise AssertionError("Embedded Stripe checkout did not render")


async def fill_card(frame, card):
    opener = frame.get_by_role("button", name="Pay with card", exact=True)
    if await opener.count():
        await opener.dispatch_event("click")
    email = frame.locator('input[name="email"]')
    if await email.count() and not await email.input_value():
        await email.fill("checkout-test@example.com")
    await frame.get_by_label("Card number", exact=True).fill(card)
    await frame.get_by_label("Expiration", exact=True).fill("1230")
    await frame.get_by_role("textbox", name="Credit or debit card CVC/CVV").fill("123")
    name = frame.get_by_placeholder("Full name on card")
    if await name.count():
        await name.fill("Sandbox Regression")
    country = frame.locator('select[name="billingCountry"]')
    if await country.count():
        await country.select_option("US")
    postal = frame.locator('input[name="billingPostalCode"]')
    if await postal.count():
        await postal.fill("10001")
    pay = frame.get_by_role("button", name="Pay", exact=True)
    await pay.scroll_into_view_if_needed()
    await pay.click()


async def run_case(page, user_id, outcome):
    order_id = str(uuid.uuid4())
    title = "Sandbox regression " + outcome + " " + order_id
    baseline = await balances(page, user_id)
    transfers_before = stripe("transfers", {"limit": 100})
    payouts_before = stripe("payouts", {"limit": 100})
    created = False
    session = None
    try:
        await page.evaluate("""async ([id,user,title]) => {
          const {supabase}=await import('/src/integrations/supabase/client.ts');
          const r=await supabase.from('orders').insert({id,buyer_id:user,seller_id:user,title,
            amount:10,shipping_amount:0,ship_name:'Sandbox Regression',ship_address:'Test only',
            ship_city:'Test',ship_zip:'10001',ship_country:'US'});
          if(r.error) throw new Error(r.error.message);
        }""", [order_id, user_id, title])
        created = True
        before = await order_state(page, order_id)
        assert before["payment_status"] == "awaiting_payment"
        await page.goto(ORIGIN + "/cart")
        await expect(page.get_by_text(title, exact=True)).to_be_visible(timeout=45000)
        await page.get_by_role("button", name=re.compile(r"^Checkout \$")).click()
        await expect(page.get_by_text("Test mode — no real money charged; your orders remain unpaid.", exact=True)).to_be_visible(timeout=30000)
        frame = await checkout_frame(page)
        await fill_card(frame, "4242424242424242" if outcome == "success" else "4000000000000002")
        if outcome == "success":
            await page.wait_for_url("**/checkout/return?**", timeout=60000)
            await expect(page.get_by_text("Test payment confirmed — no real money charged", exact=True)).to_be_visible(timeout=45000)
            await page.locator("main").screenshot(path=str(EVIDENCE / "success.png"))
        else:
            try:
                await expect(frame.get_by_text(re.compile(r"declined", re.I)).first).to_be_visible(timeout=45000)
            except AssertionError:
                print("Stripe validation:", await frame.locator('[role=alert], [class*=error], [class*=Error]').all_text_contents())
                print("Submit state:", await frame.get_by_role("button", name=re.compile("Pay|Processing")).all_text_contents())
                raise
            # Only screenshot the error: never capture customer autofill or card fields.
            await frame.get_by_text(re.compile(r"declined", re.I)).first.screenshot(path=str(EVIDENCE / "decline.png"))
            assert "/checkout/return" not in page.url
        sessions = stripe("checkout/sessions", {"limit": 100})["data"]
        matches = [s for s in sessions if s.get("metadata", {}).get("order_ids") == order_id]
        assert len(matches) == 1, "Expected exactly one idempotent checkout for this order"
        session = matches[0]
        assert session["livemode"] is False
        assert session["ui_mode"] == "embedded_page"
        assert session["payment_status"] == ("paid" if outcome == "success" else "unpaid")
        intent = stripe("payment_intents/" + session["payment_intent"])
        assert intent["livemode"] is False
        assert intent.get("transfer_data") is None, "Checkout must not route money to a seller"
        assert intent.get("application_fee_amount") is None
        assert intent["status"] == ("succeeded" if outcome == "success" else "requires_payment_method")
        if outcome == "decline":
            assert intent["last_payment_error"]["code"] == "card_declined"
        charges = stripe("charges", {"payment_intent": intent["id"], "limit": 100})["data"]
        assert charges, "Expected a Stripe charge attempt"
        assert all(c.get("transfer") is None and c.get("transfer_data") is None for c in charges)
        await notify(page, "payment_intent.succeeded" if outcome == "success" else "payment_intent.payment_failed", intent, order_id)
        if outcome == "success":
            await notify(page, "checkout.session.completed", session, order_id + "_checkout")
        assert await order_state(page, order_id) == before, "Test checkout or notifications changed an order"
        assert await balances(page, user_id) == baseline, "Test checkout changed seller balances or payout requests"
        assert stripe("transfers", {"limit": 100}) == transfers_before, "A seller transfer occurred"
        assert stripe("payouts", {"limit": 100}) == payouts_before, "A bank payout occurred"
        await page.goto(ORIGIN + "/orders")
        await expect(page.get_by_text(title, exact=True).first).to_be_visible(timeout=45000)
        await page.goto(ORIGIN + "/cart")
        await expect(page.get_by_text(title, exact=True)).to_be_visible(timeout=45000)
        print(f"PASS {outcome}: real Stripe test attempt, unchanged unpaid order, signed retries safe, no transfers or payouts")
    finally:
        if created:
            # Never delete real orders or silently hide a mistakenly paid fixture.
            deleted = await page.evaluate("""async ([id,title]) => {
              const {supabase}=await import('/src/integrations/supabase/client.ts');
              const r=await supabase.from('orders').delete().eq('id',id).eq('title',title)
                .eq('payment_status','awaiting_payment').select('id');
              if(r.error) throw new Error(r.error.message); return r.data.length;
            }""", [order_id, title])
            assert deleted == 1, f"Fixture {order_id} could not be safely cleaned up"


async def main():
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
        session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
        storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
        user_id = json.loads(session_json)["user"]["id"]
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
    else:
        with open(Path.home() / ".cache/lovable-auth/session.json") as f:
            minted = json.load(f)
        session_json = json.dumps(minted["session"])
        storage_key, user_id = minted["storage_key"], minted["user_id"]
        cookies = minted.get("cookies") or []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        if cookies:
            await context.add_cookies([{**c, "url": ORIGIN} for c in cookies])
        page = await context.new_page()
        try:
            await page.goto(ORIGIN)
            await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [storage_key, session_json])
            await page.goto(ORIGIN + "/cart")
            await page.wait_for_timeout(10000)
            if await page.get_by_text("Pull Bid Live — Beta Access", exact=True).count():
                await page.locator('input[type="password"]').fill(os.environ["BETA_PASSWORD"])
                await page.get_by_role("button", name="Enter beta").click()
                await expect(page.get_by_text("Pull Bid Live — Beta Access", exact=True)).to_be_hidden(timeout=30000)
            # Refuse grouped checkout of unrelated existing unpaid orders.
            count = await page.evaluate("""async user => {
              const {supabase}=await import('/src/integrations/supabase/client.ts');
              const r=await supabase.from('orders').select('id',{count:'exact',head:true})
                .eq('buyer_id',user).eq('payment_status','awaiting_payment');
              if(r.error) throw new Error(r.error.message); return r.count;
            }""", user_id)
            assert count == 0, "Use an account with an empty cart; never pay existing orders in regression tests"
            # Exercises the actual payout handler: guard must reject before DB insertion.
            before = await balances(page, user_id)
            blocked = await page.evaluate("""async () => {
              const {requestPayout}=await import('/src/lib/payouts.functions.ts');
              try {await requestPayout({data:{amountCents:500}});return false;}
              catch {return true;}
            }""")
            assert blocked and await balances(page, user_id) == before, "Preview withdrawal was not blocked"
            print("PASS preview withdrawal: rejected, no payout request or balance changes")
            for outcome in ["decline", "success"]:
                await run_case(page, user_id, outcome)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())