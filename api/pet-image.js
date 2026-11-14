'use strict';
const sharp = require('sharp');
const { validId, responseHeaders, publicPost, coverPath, signedCover } = require('../lib/preview');

async function shrinkPicture(input) {
  const bg = await sharp(input, { limitInputPixels: 50e6, failOn: 'error' }).rotate()
    .resize(1200, 630, { fit: 'cover' }).blur(24)
    .modulate({ brightness: 0.55, saturation: 0.85 })
    .jpeg({ quality: 67, mozjpeg: true }).toBuffer();
  const foreground = await sharp(input, { limitInputPixels: 50e6, failOn: 'error' }).rotate()
    .resize(1180, 610, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  // Keep the entire portrait visible without distorting the pet's face.
  return sharp(bg).composite([{ input: foreground, gravity: 'centre' }])
    .jpeg({ quality: 73, mozjpeg: true }).toBuffer();
}
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  const id = typeof req.query?.id === 'string' ? req.query.id : '';
  if (!validId(id)) return res.status(404).end();
  try {
    const post = await publicPost(id);
    if (!post) return res.status(404).end();
    const path = await coverPath(id);
    if (!path) return res.redirect(302, '/icon-512.png');
    const remote = await signedCover(path);
    const imageResponse = await fetch(remote, { signal: AbortSignal.timeout(6500) });
    if (!imageResponse.ok) throw new Error('Storage image unavailable');
    const mime = (imageResponse.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Unsupported image type');
    const len = Number(imageResponse.headers.get('content-length') || '0');
    if (len > 6 * 1024 * 1024) throw new Error('Unexpectedly large image');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length > 6 * 1024 * 1024) throw new Error('Unexpectedly large image');
    let output = await shrinkPicture(buffer);
    // Meta's link-preview image size guidance is below 600 KB.
    if (output.length > 550 * 1024) output = await sharp(output).jpeg({ quality: 55, mozjpeg: true }).toBuffer();
    responseHeaders(res, 'image/jpeg', 'public, max-age=0, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).end(req.method === 'HEAD' ? '' : output);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/icon-512.png');
  }
};