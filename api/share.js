'use strict';
const { SITE, validId, escaped, responseHeaders, publicPost, coverPath, description, title } = require('../lib/preview');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  const id = typeof req.query?.id === 'string' ? req.query.id : '';
  if (!validId(id)) return res.status(404).end('Publicación no encontrada');
  let post;
  try { post = await publicPost(id); } catch (_) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('Vista previa temporalmente no disponible');
  }
  if (!post) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).end('Publicación no disponible'); }
  const cover = await coverPath(id).catch(() => null);
  const url = `${SITE}/api/share?id=${encodeURIComponent(id)}`;
  const destination = `${SITE}/?mascota=${encodeURIComponent(id)}`;
  const image = cover ? `${SITE}/api/pet-image?id=${encodeURIComponent(id)}` : `${SITE}/icon-512.png`;
  const imageType = cover ? 'image/jpeg' : 'image/png';
  const imageWidth = cover ? 1200 : 512;
  const imageHeight = cover ? 630 : 512;
  const heading = escaped(title(post));
  const desc = escaped(description(post));
  responseHeaders(res, 'text/html; charset=utf-8', 'public, max-age=0, s-maxage=120, stale-while-revalidate=60');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  const html = `<!doctype html><html lang="es-AR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title><meta name="description" content="${desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Huellitas">
<meta property="og:title" content="${heading}"><meta property="og:description" content="${desc}">
<meta property="og:url" content="${escaped(url)}"><meta property="og:image" content="${escaped(image)}">
<meta property="og:image:secure_url" content="${escaped(image)}"><meta property="og:image:type" content="${imageType}">
<meta property="og:image:width" content="${imageWidth}"><meta property="og:image:height" content="${imageHeight}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${heading}">
<meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${escaped(image)}">
<style>body{background:#164734;color:white;font:18px system-ui,sans-serif;display:grid;place-items:center;min-height:80vh;text-align:center}a{color:#f8d693}</style>
</head><body><main><h1>${heading}</h1><p>${desc}</p><p><a href="${escaped(destination)}">Ver aviso en Huellitas</a></p></main>
<script>location.replace(${JSON.stringify(destination)});</script></body></html>`;
  return res.status(200).end(req.method === 'HEAD' ? '' : html);
};