import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { send, vapidPublicKey } from 'jsr:@daaku/webpush@0.2.0';


// The hosted Supabase Edge Runtime (Deno 2.1.x) predates 2025 Uint8Array
// base64 helpers, which the Web Push library uses.
type Base64Options = { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean };
const Bytes = Uint8Array as unknown as {
 fromBase64?: (data: string, options?: Base64Options) => Uint8Array;
};
if (!Bytes.fromBase64) {
 Bytes.fromBase64 = (value, options) => {
  let normalized = options?.alphabet === 'base64url'
   ? value.replace(/-/g,'+').replace(/_/g,'/') : value;
  normalized = normalized.padEnd(Math.ceil(normalized.length/4)*4,'=');
  const raw = atob(normalized);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
 };
}
const BytesProto = Uint8Array.prototype as Uint8Array & { toBase64?: (options?: Base64Options) => string };
if (!BytesProto.toBase64) {
 BytesProto.toBase64 = function(options?: Base64Options) {
  const bytes = this as Uint8Array;
  let raw=''; for (const b of bytes) raw += String.fromCharCode(b);
  let result=btoa(raw);
  if(options?.alphabet==='base64url')result=result.replace(/\+/g,'-').replace(/\//g,'_');
  if(options?.omitPadding)result=result.replace(/=+$/g,'');
  return result;
 };
}

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(PROJECT_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const SITE = 'https://huellitas-ar.vercel.app';
const CORS = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Vary': 'Origin',
  'Cache-Control': 'no-store'
};
const out = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
const allowedEndpoint = (s: unknown): s is string => {
  if (typeof s !== 'string' || s.length < 25 || s.length > 2000) return false;
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && (
      h === 'fcm.googleapis.com' ||
      h === 'updates.push.services.mozilla.com' ||
      h.endsWith('.push.apple.com') ||
      h.endsWith('.notify.windows.com') ||
      h.endsWith('.wns.windows.com')
    );
  } catch { return false; }
};
const keyText = (s: unknown, min: number, max: number) =>
  typeof s === 'string' && s.length >= min && s.length <= max && /^[a-zA-Z0-9_+/=-]+$/.test(s);
async function config() {
  const { data, error } = await admin.rpc('hu_push_config');
  if (error || !data || !data.vapid || !data.dispatcher) throw new Error('Missing push secrets');
  return { vapid: JSON.parse(data.vapid), dispatcher: String(data.dispatcher) };
}
async function loggedInModerator(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt || jwt.length < 50) return null;
  const { data: userResult, error: authError } = await admin.auth.getUser(jwt);
  const uid = userResult?.user?.id;
  if (authError || !uid) return null;
  const { data, error } = await admin.from('hu_moderators').select('user_id').eq('user_id', uid).maybeSingle();
  return error || !data ? null : uid;
}
async function transmit(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: { title: string; body: string; url: string; tag: string },
  vapid: JsonWebKey
) {
  try {
    if (!allowedEndpoint(subscription.endpoint)) throw new Error('Invalid push destination');
    await send(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
      JSON.stringify(payload),
      { vapid, subscriber: SITE, ttl: 3600, urgency: 'normal' }
    );
    return { ok: true, stale: false };
  } catch (e) {
    const failure = e as { permanent?: boolean; statusCode?: number; message?: string };
    const stale = !!failure.permanent || failure.statusCode === 404 || failure.statusCode === 410;
    console.warn('Push attempt failed', failure.statusCode || failure.message || 'unknown');
    return { ok: false, stale };
  }
}
async function deleteDead(endpoint: string) {
  await admin.from('hu_admin_push_subscriptions').delete().eq('endpoint', endpoint);
}
async function dispatchEvents(vapid: JsonWebKey) {
  const { data: posts, error: claimError } = await admin.rpc('hu_push_claim', { batch: 10 });
  if (claimError) throw claimError;
  if (!posts?.length) return { claimed: 0, successful: 0 };
  const { data: moderators, error: modError } = await admin.from('hu_moderators').select('user_id');
  if (modError) throw modError;
  const ids = (moderators || []).map((m: { user_id: string }) => m.user_id);
  let subs: Array<{ user_id: string; endpoint: string; p256dh: string; auth_key: string }> = [];
  if (ids.length) {
    const found = await admin.from('hu_admin_push_subscriptions')
      .select('user_id,endpoint,p256dh,auth_key').in('user_id', ids).limit(60);
    if (found.error) throw found.error;
    subs = found.data || [];
  }
  let successful = 0;
  for (const event of posts) {
    const payload = {
      title: event.title,
      body: event.body,
      tag: 'hu-' + event.kind + '-' + event.source_id,
      url: SITE + (event.kind === 'report' ? '/?panel=reportes' : '/?panel=moderacion')
    };
    const outcomes = await Promise.all(subs.map(async sub => {
      const state = await transmit(sub,payload,vapid);
      if (state.stale) await deleteDead(sub.endpoint);
      return state;
    }));
    const delivered = outcomes.filter(x=>x.ok).length;
    successful += delivered;
    const completed = delivered > 0 || subs.length === 0;
    const next = {
      processed_at: completed ? new Date().toISOString() : null,
      claim_until: null,
      last_error: subs.length === 0 ? 'no moderator subscriptions' : delivered === 0 ? 'all endpoints failed' : null
    };
    const updated = await admin.from('hu_admin_push_events').update(next).eq('id',event.id);
    if (updated.error) console.error('Failed to finalize queue entry', updated.error.message);
  }
  return { claimed: posts.length, successful };
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers:CORS});
  const origin = req.headers.get('origin');
  if (origin && origin !== SITE) return out({error:'Forbidden origin'},403);
  try {
    const path = new URL(req.url).pathname.split('/').pop();
    if (path === 'public-key' && req.method === 'GET') {
      const cfg = await config();
      return out({ publicKey: await vapidPublicKey(cfg.vapid) });
    }
    if (path === 'dispatch' && req.method === 'POST') {
      const secret = req.headers.get('x-huellitas-dispatch-secret') || '';
      if (secret.length < 32 || secret !== (await config()).dispatcher) return out({error:'Unauthorized'},401);
      return out(await dispatchEvents((await config()).vapid));
    }
    if (req.method !== 'POST') return out({error:'Not found'},404);
    if (!['subscribe','unsubscribe','test'].includes(path || '')) return out({error:'Not found'},404);
    const uid = await loggedInModerator(req);
    if (!uid) return out({error:'Solo moderadores autorizados'},403);
    if (path === 'subscribe') {
      const input = await req.json();
      const endpoint = input?.endpoint;
      const p256dh = input?.keys?.p256dh;
      const authKey = input?.keys?.auth;
      if (!allowedEndpoint(endpoint) || !keyText(p256dh,40,180) || !keyText(authKey,10,120))
        return out({error:'Suscripción inválida'},400);
      const {error} = await admin.from('hu_admin_push_subscriptions').upsert({
        user_id:uid,endpoint,p256dh,auth_key:authKey,updated_at:new Date().toISOString()
      },{onConflict:'endpoint'});
      if (error) throw error;
      return out({ok:true});
    }
    if (path === 'unsubscribe') {
      const input = await req.json();
      const endpoint = input?.endpoint;
      if (typeof endpoint !== 'string' || endpoint.length > 2000) return out({error:'Invalid endpoint'},400);
      const {error} = await admin.from('hu_admin_push_subscriptions').delete().eq('endpoint',endpoint).eq('user_id',uid);
      if (error) throw error;
      return out({ok:true});
    }
    // A private, low-volume delivery test after opting in on a device.
    const {data:rows,error:selectError} = await admin.from('hu_admin_push_subscriptions')
      .select('endpoint,p256dh,auth_key,last_test_at').eq('user_id',uid).limit(6);
    if (selectError) throw selectError;
    if (!rows?.length) return out({error:'Activá notificaciones primero'},409);
    const latest = rows.map((row:{last_test_at?:string})=>new Date(row.last_test_at||0).getTime());
    if (Math.max(...latest) > Date.now()-60_000) return out({error:'Esperá un minuto para repetir la prueba'},429);
    const {error:updatedError} = await admin.from('hu_admin_push_subscriptions')
      .update({last_test_at:new Date().toISOString()}).eq('user_id',uid);
    if (updatedError) throw updatedError;
    const cfg = await config();
    const payload = {title:'Huellitas · Avisos activados',body:'¡Genial! Te avisaremos cuando haya publicaciones o reportes para revisar.',url:SITE+'/?panel=moderacion',tag:'hu-admin-test'};
    const outcomes = await Promise.all(rows.map(async (sub: {endpoint:string;p256dh:string;auth_key:string})=>{
      const state=await transmit(sub,payload,cfg.vapid);
      if(state.stale) await deleteDead(sub.endpoint);
      return state;
    }));
    return out({ok:outcomes.some(o=>o.ok),deliveries:outcomes.filter(o=>o.ok).length},
      outcomes.some(o=>o.ok)?200:502);
  } catch (error) {
    console.error('Push endpoint error', (error as Error).message || 'unknown');
    return out({error:'No pudimos procesar la notificación. Intentá de nuevo.'},500);
  }
});