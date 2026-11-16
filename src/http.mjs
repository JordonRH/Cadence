import { fail } from './auth.mjs';
export async function readBody(req, kind = 'json', limit = 65536) {
  const type = kind === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';
  if ((req.headers['content-type'] || '').split(';')[0].trim() !== type) fail(415, 'Unsupported request format.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Request too large.'); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (kind === 'form') return Object.fromEntries(new URLSearchParams(raw));
  let data; try { data = JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Invalid request.');
  return data;
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
