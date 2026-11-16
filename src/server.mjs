import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import { csrf, throttle, identity, issueSession, sessionCookie, verifyPassword, hashPassword, themes, fail } from './auth.mjs';
import { createOAuth } from './oauth.mjs';
import { createLearning } from './learning.mjs';
import { handleMCP } from './mcp.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/assets/echo.png', ['assets/echo.png', 'image/png']],
]);
export async function createApp({ path = process.env.DATA_PATH || './data/cadence.sqlite', origin = process.env.BASE_URL || 'https://learning.jrhtechservices.party', revision = process.env.CADENCE_REVISION || 'development' } = {}) {
  if (new URL(origin).origin !== origin) throw new Error('BASE_URL must be an origin without a trailing slash.');
  const db = openStore(path);
  const oauth = createOAuth(db,origin);
  const learning = createLearning(db);
  const dummy = await hashPassword('invalid account timing placeholder');
  let activeLogins = 0;
  const server = createServer(async (req, res) => {
    res.setTimeout(15000);
    const headers = {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      'Cache-Control': 'no-store',
    };
    if(req.url?.startsWith('/oauth/authorize')) headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace("form-action 'self'", "form-action 'self' https://chatgpt.com");
    for(const [name,value] of Object.entries(headers)) res.setHeader(name,value);
    const json = (status, body, extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, origin);
      if(await oauth.handle(req,res,url,json)) return;
      if(url.pathname === '/mcp' || url.pathname === '/mcp/') return await handleMCP(req,res,{oauth,learning,origin});
      if (req.method === 'GET' && url.pathname === '/api/health') {
        db.prepare('SELECT 1').get();
        return json(200, { status: 'ok', service: 'cadence', revision });
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        const body = await readFile(resolve(publicDir, name));
        res.writeHead(200, { ...headers, 'Content-Type': type }); return res.end(body);
      }
      if (!url.pathname.startsWith('/api/')) fail(404, 'Not found.');
      if (!['GET', 'HEAD'].includes(req.method)) csrf(req, origin);
      let data = {};
      if (['POST', 'PUT'].includes(req.method)) {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Use JSON.');
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 8192) fail(413, 'Request too large.'); chunks.push(chunk); }
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid JSON.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Invalid request.');
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        // Deliberately ignore untrusted forwarded client-IP headers.
        throttle(db, req.socket.remoteAddress || 'unknown');
        if (activeLogins >= 2) fail(429, 'Please try again shortly.');
        if (typeof data.email !== 'string' || typeof data.password !== 'string' || data.email.length > 240 || Buffer.byteLength(data.password) > 1024) fail(401, 'Email or password not accepted.');
        const owner = db.prepare('SELECT * FROM owner WHERE id=1').get();
        activeLogins++;
        let accepted;
        try { accepted = await verifyPassword(data.password, owner?.password || dummy); } finally { activeLogins--; }
        if (!owner || data.email.trim().toLowerCase() !== owner.email || !accepted) fail(401, 'Email or password not accepted.');
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(issueSession(db)) });
      }
      const key = identity(db, req);
      if(url.pathname === '/api/connections' && req.method === 'GET') {
        const clients=db.prepare("SELECT DISTINCT c.id,c.name FROM oauth_clients c JOIN oauth_grants g ON g.client_id=c.id WHERE g.kind IN ('access','refresh') AND g.expires > ?").all(Date.now());
        return json(200,{mcp_url:oauth.resource,connections:clients});
      }
      if(url.pathname === '/api/connections/revoke' && req.method === 'POST') {
        db.exec('DELETE FROM oauth_grants;');
        return json(200,{revoked:true});
      }
      if(url.pathname === '/api/learning' && req.method === 'GET') return json(200,{...learning.context(),review:learning.listPhrases({})});
      if (url.pathname === '/api/me' && req.method === 'GET') {
        const owner = db.prepare('SELECT name,theme FROM owner WHERE id=1').get();
        return json(200, { ...owner, profile: db.prepare('SELECT language,goal,minutes FROM profile WHERE id=1').get() || null });
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE id=?').run(key);
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
      }
      if (url.pathname === '/api/theme' && req.method === 'PUT') {
        if (!themes.includes(data.theme)) fail(422, 'Choose a supported theme.');
        db.prepare('UPDATE owner SET theme=? WHERE id=1').run(data.theme);
        return json(200, { theme: data.theme });
      }
      if (url.pathname === '/api/profile' && req.method === 'PUT') {
        return json(200, learning.setProfile(data).profile);
      }
      fail(404, 'Not found.');
    } catch (error) { json(error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' }); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxHeadersCount = 50;
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, db } = await createApp();
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Cadence is ready.'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
