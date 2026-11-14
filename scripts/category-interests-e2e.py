import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
out=Path('/tmp/browser/interests')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  ctx=await b.new_context(viewport={'width':1280,'height':1800})
  page=await ctx.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  await page.goto('http://localhost:8080/settings',wait_until='networkidle')
  if await page.get_by_role('heading',name='Pull Bid Live — Beta Access').count():
   await page.get_by_placeholder('••••••••').fill(os.environ['BETA_PASSWORD'])
   await page.get_by_role('button',name='Enter beta',exact=True).click()
   await page.get_by_role('heading',name='Pull Bid Live — Beta Access').wait_for(state='hidden')
   print('verified beta access through existing form')
  await page.get_by_role('button',name='Interests',exact=True).click()
  await page.get_by_role('checkbox',name='Trading Cards & Collectibles',exact=True).wait_for()
  boxes=page.get_by_role('checkbox')
  initial={await boxes.nth(i).get_attribute('aria-label'):await boxes.nth(i).is_checked() for i in range(await boxes.count())}
  print('interest choices',len(initial))
  original=await page.evaluate('async()=>{ const {supabase}=await import("/src/integrations/supabase/client.ts");const {data:{user}}=await supabase.auth.getUser();const {data,error}=await supabase.from("profiles").select("interests").eq("id",user.id).single();if(error)throw Error(error.message);return data.interests;}')
  (out/'original-interests.json').write_text(json.dumps(original))
  changed=False
  try:
   for i in range(await boxes.count()):
    name=await boxes.nth(i).get_attribute('aria-label')
    await boxes.nth(i).set_checked(name in ['Trading Cards & Collectibles','Gaming','Electronics'])
   async with page.expect_response(lambda r: '/rest/v1/profiles?' in r.url and r.request.method=='PATCH') as resp:
    await page.get_by_role('button',name='Save interests',exact=True).click()
   print('save response',(await resp.value).status)
   changed=True
   await page.wait_for_timeout(1800)
   await page.goto('http://localhost:8080/settings',wait_until='networkidle')
   await page.get_by_role('button',name='Interests',exact=True).click()
   for name in ['Trading Cards & Collectibles','Gaming','Electronics']:
    assert await page.get_by_role('checkbox',name=name,exact=True).is_checked()
   await page.screenshot(path=str(out/'saved.png'))
   print('saved interests read back through settings PASS')
   await page.goto('http://localhost:8080',wait_until='networkidle')
   rail=page.get_by_role('navigation',name='Shopping departments',exact=True)
   names=await rail.locator('a').all_text_contents()
   print('personalized homepage first departments',names[:3])
   assert names[:3]==['Trading Cards & Collectibles','Electronics','Gaming']
   await page.get_by_role('button',name='Categories',exact=True).filter(visible=True).click()
   dialog=page.get_by_role('dialog')
   assert await dialog.locator('a[href^="/marketplace/"]').count()>=11
   await page.get_by_role('textbox',name='Search departments').fill('garden')
   await dialog.get_by_role('link',name='Garden & Outdoors',exact=False).last.click()
   await page.wait_for_url('**/marketplace/garden-outdoors')
   print('signed-in category navigation PASS')
   await page.set_viewport_size({'width':390,'height':844})
   await page.get_by_role('button',name='Categories',exact=True).filter(visible=True).click()
   await page.screenshot(path=str(out/'signed-in-mobile.png'))
   print('signed-in mobile overflow',await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await page.goto('http://localhost:8080/settings',wait_until='networkidle')
   await page.get_by_role('button',name='Interests',exact=True).click()
   for box in await page.get_by_role('checkbox').all(): await box.set_checked(False)
   await page.get_by_role('button',name='Save interests',exact=True).click()
   await page.wait_for_timeout(1800)
   await page.goto('http://localhost:8080/settings',wait_until='networkidle')
   await page.get_by_role('button',name='Interests',exact=True).click()
   assert await page.get_by_role('checkbox').filter(has=page.locator('[aria-checked=true]')).count()==0
   assert not any([await box.is_checked() for box in await page.get_by_role('checkbox').all()])
   print('zero-interest save and readback PASS')
  finally:
   if changed:
    await page.goto('http://localhost:8080/settings',wait_until='networkidle')
    await page.evaluate('async(interests)=>{const {supabase}=await import("/src/integrations/supabase/client.ts");const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from("profiles").update({interests}).eq("id",user.id);if(error)throw Error(error.message);}',original)
    await page.goto('http://localhost:8080/settings',wait_until='networkidle')
    await page.get_by_role('button',name='Interests',exact=True).click()
    for name,checked in initial.items(): assert await page.get_by_role('checkbox',name=name,exact=True).is_checked()==checked
    print('restored original interests and verified through UI')
  print('page errors',errors)
  await b.close()
asyncio.run(main())
