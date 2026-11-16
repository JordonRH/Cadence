import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const COOKIE = '__Host-cadence_session';
export const themes = ['meadow', 'paper', 'dusk', 'ocean', 'contrast'];
export const digest = value => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64, options)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function csrf(req, origin) {
  if (req.headers.origin !== origin || req.headers['x-cadence-request'] !== '1') fail(403, 'Request verification failed.');
}
export function throttle(db, address) {
  const now = Date.now();
  db.prepare('DELETE FROM limits WHERE expires < ?').run(now);
  const id = digest(address);
  const row = db.prepare('SELECT count FROM limits WHERE id=?').get(id);
  if (row?.count >= 12) fail(429, 'Too many attempts. Please try again in ten minutes.');
  db.prepare('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').run(id, now + 600000);
}
export function issueSession(db) {
  const token = randomBytes(48).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires < ? OR absolute_expires < ?').run(now, now);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), now + 86400000, now + 7 * 86400000);
  return token;
}
export function identity(db, req) {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const key = raw && raw.length < 256 ? digest(raw) : '';
  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(key);
  if (!row || Math.min(row.expires, row.absolute_expires) <= Date.now()) fail(401, 'Please sign in.');
  db.prepare('UPDATE sessions SET expires=? WHERE id=?').run(Math.min(Date.now() + 86400000, row.absolute_expires), key);
  return key;
}
export function sessionCookie(token, maxAge = 604800) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
