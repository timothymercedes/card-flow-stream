import os,json,requests,uuid
BASE=os.environ['SUPABASE_URL'].rstrip('/')
assert requests.utils.urlparse(BASE).hostname in ('localhost','127.0.0.1'), 'Isolated local backend required'
key=os.environ['SUPABASE_PUBLISHABLE_KEY']; admin=os.environ['SUPABASE_SERVICE_ROLE_KEY']
A={'apikey':admin,'Authorization':'Bearer '+admin}
P={'apikey':key}
checks=[]
def check(ok,name):
 assert ok,name
 checks.append(name)
def auth(role):
 email=role+'-privacy-test@example.com'
 r=requests.post(BASE+'/auth/v1/admin/users',headers=A,json={'email':email,'email_confirm':True,'password':'Fictional-only-'+role+'-9247'}); r.raise_for_status()
 uid=r.json()['id']
 t=requests.post(BASE+'/auth/v1/token?grant_type=password',headers=P,json={'email':email,'password':'Fictional-only-'+role+'-9247'});t.raise_for_status()
 return uid,{**P,'Authorization':'Bearer '+t.json()['access_token']}
users={r:auth(r) for r in ['owner','follower','friend','unrelated','blocked']}
owner,H=users['owner']
def req(method,table,h,**kwargs): return requests.request(method,BASE+'/rest/v1/'+table,headers={**h,'Prefer':'return=representation'},**kwargs)
r=req('POST','personal_social_identities',H,json={'user_id':owner,'username':'matrix.owner','display_name':'Fictional Matrix Owner'});check(r.ok,'owner creates identity')
pids=[]
for a in ['public','followers','friends','only_me']:
 r=req('POST','personal_social_posts',H,json={'user_id':owner,'caption':'Matrix '+a,'audience':a});check(r.ok,'owner creates '+a);pids.append(r.json()[0]['id'])
pid=pids[0]
r=req('POST','personal_social_comments',H,json={'post_id':pid,'user_id':owner,'content':'private child'});check(r.ok,'owner comment create');cid=r.json()[0]['id']
for role,h in [('guest',P)]+[(r,h) for r,(u,h) in users.items() if r!='owner']:
 for table in ['personal_social_identities','personal_social_posts','personal_social_comments','personal_social_reactions','personal_social_media']:
  r=req('GET',table,h);check((not r.ok) or r.json()==[],role+' denied '+table)
 for table,body in [('personal_social_comments',{'post_id':pid,'user_id':users.get(role,('00000000-0000-4000-8000-000000000003',))[0],'content':'attack'}),('personal_social_reactions',{'post_id':pid,'user_id':users.get(role,('00000000-0000-4000-8000-000000000003',))[0]})]:
  r=req('POST',table,h,json=body);check(not r.ok,role+' denied child insert '+table)
 r=req('PATCH','personal_social_posts?id=eq.'+pid,h,json={'caption':'attack'});check(not r.ok or r.json()==[],role+' denied direct edit')
path=owner+'/'+str(uuid.uuid4())+'.jpg'
r=req('POST','personal_social_media',H,json={'user_id':owner,'post_id':pid,'slot':'post','kind':'image','object_path':path});check(r.ok,'exact media binding');mid=r.json()[0]['id']
photo=open('src/assets/profile-demo/grading-desk.jpg','rb').read()
r=requests.post(BASE+'/storage/v1/object/personal-profile-media/'+path,headers={**H,'Content-Type':'image/jpeg'},data=photo);check(r.ok,'owner upload')
for role,h in [('guest',P)]+[(r,h) for r,(u,h) in users.items()]:
 r=requests.get(BASE+'/storage/v1/object/authenticated/personal-profile-media/'+path,headers=h);check(r.ok==(role=='owner'),role+' direct authenticated media')
 r=requests.get(BASE+'/storage/v1/object/public/personal-profile-media/'+path,headers=h);check(not r.ok,role+' public URL denied')
 req('GET','personal_social_identities?select=phone',h);check(not req('GET','personal_social_identities?select=phone',h).ok,role+' no private profile column')
r=req('PATCH','personal_social_comments?id=eq.'+cid,H,json={'post_id':pids[1]});check(not r.ok,'comment parent immutable')
r=req('PATCH','personal_social_posts?id=eq.'+pid,H,json={'allow_comments':False});check(r.ok,'disable comments')
r=req('POST','personal_social_comments',H,json={'post_id':pid,'user_id':owner,'content':'disabled'});check(not r.ok,'disabled comment rejected')
r=req('DELETE','personal_social_media?id=eq.'+mid,H);check(r.ok,'revoke exact binding')
r=requests.get(BASE+'/storage/v1/object/authenticated/personal-profile-media/'+path,headers=H);check(not r.ok,'revoked binding denies owner object')
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
# Disposable test accounts and content never enter application fixtures.
for uid,h in users.values(): requests.delete(BASE+'/auth/v1/admin/users/'+uid,headers=A)
