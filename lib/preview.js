'use strict';

// Public, non-privileged credentials only. Data is filtered by PostgREST RLS.
// Never insert a service_role key into this code or a browser bundle.
const SUPABASE = process.env.HUELLITAS_SUPABASE_URL || 'https://sslvugeciizwhcldgiwg.supabase.co';
const KEY = process.env.HUELLITAS_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VyIZSb9AqLvWaRJy4wsgAQ_0X52wdDP';
const SITE = 'https://huellitas-ar.vercel.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const restHeaders = { apikey: KEY, Accept: 'application/json' };
function escaped(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function validId(value) { return typeof value === 'string' && UUID.test(value); }
function responseHeaders(res, type, cache) {
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cache);
}
async function fetchJson(endpoint, init) {
  const response = await fetch(`${SUPABASE}${endpoint}`, {
    ...init,
    headers: { ...restHeaders, ...(init && init.headers) },
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error('Supabase returned '+response.status);
  return response.json();
}
async function publicPost(id) {
  if (!validId(id)) return null;
  const q = new URLSearchParams({
    select: 'id,name,category,locality,species', id: `eq.${id}`,
    status: 'eq.approved', outcome: 'eq.active', limit: '1'
  });
  const rows = await fetchJson(`/rest/v1/hu_pet_posts?${q}`);
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}
async function coverPath(id) {
  const q = new URLSearchParams({
    select: 'storage_path', post_id: `eq.${id}`, position: 'eq.0', limit: '1'
  });
  const rows = await fetchJson(`/rest/v1/hu_pet_photos?${q}`);
  const path = rows && rows[0] && rows[0].storage_path;
  if (typeof path !== 'string') return null;
  const parts = path.split('/');
  if (parts.length !== 3 || !parts.every(p => /^[a-z0-9-]+(?:\.[a-z0-9]+)?$/i.test(p)) || parts[1] !== id) return null;
  return path;
}
async function signedCover(path) {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  const data = await fetchJson(`/storage/v1/object/sign/huellitas-photos/${safePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 120 }),
  });
  const signed = data.signedURL || data.signedUrl || data.signed_url;
  if (typeof signed !== 'string' || !signed) throw new Error('No signed URL returned');
  const url = new URL(signed.startsWith('/object/') ? '/storage/v1' + signed : signed, SUPABASE);
  if (url.origin !== new URL(SUPABASE).origin || !url.pathname.includes('/storage/v1/object/sign/')) throw new Error('Unsafe signed URL');
  return url.href;
}
function description(post) {
  const name = String(post.name || 'Esta mascota').slice(0, 80);
  const zone = String(post.locality || 'San Miguel').slice(0, 120);
  if (post.category === 'lost') return `Se busca a ${name} en ${zone}. ¿Lo viste? Ayudanos a que vuelva a casa.`;
  if (post.category === 'found') return `Encontraron a ${name} en ${zone}. ¿Lo reconocés? Ayudanos a reunirlo con su familia.`;
  return `${name} busca un hogar en ${zone}. Conocé su historia en Huellitas.`;
}
function title(post) {
  const prefix = post.category === 'adoption' ? 'En adopción' : post.category === 'found' ? 'Encontrada' : 'Se busca';
  return `${prefix}: ${post.name} · Huellitas`;
}
module.exports = { SUPABASE, SITE, validId, escaped, responseHeaders, publicPost, coverPath, signedCover, description, title };