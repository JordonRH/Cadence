import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { digest, identity, fail, throttle } from './auth.mjs';
import { readBody, escapeHtml } from './http.mjs';

export const SCOPES = ['learning.read','learning.write'];
const CHATGPT_CLIENT_DOCUMENT = 'https://chatgpt.com/oauth/client.json';
const CHATGPT_STABLE_CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';
const fresh = () => randomBytes(40).toString('base64url');
const callbacks = value => {
  try {
    const u = new URL(value);
    return u.origin === 'https://chatgpt.com' && !u.username && !u.password && !u.search && !u.hash &&
      (u.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname));
  } catch { return false; }
};
const scopesFor = value => typeof value === 'string' && value.length < 200 && value.trim() ? [...new Set(value.split(/\s+/))].sort() : [];
const validScopes = values => values.length > 0 && values.every(value => SCOPES.includes(value));

async function verifyChatGPTClient() {
  try {
    const response = await fetch(CHATGPT_CLIENT_DOCUMENT, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok || !response.body) return false;
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 16384) return false;
      chunks.push(chunk);
    }
    const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const methods = metadata.token_endpoint_auth_methods_supported ?? [metadata.token_endpoint_auth_method];
    return metadata.client_id === CHATGPT_CLIENT_DOCUMENT &&
      Array.isArray(metadata.redirect_uris) && metadata.redirect_uris.includes(CHATGPT_STABLE_CALLBACK) &&
      Array.isArray(methods) && methods.includes('none');
  } catch {
    return false;
  }
}

export function createOAuth(db, origin) {
  const resource = origin + '/mcp/';
  function cleanup() { db.prepare('DELETE FROM oauth_grants WHERE expires < ?').run(Date.now()); }
  function save(value, kind, client, family, payload, duration) {
    db.prepare('INSERT INTO oauth_grants VALUES (?,?,?,?,?,?)').run(digest(value),kind,client,family,JSON.stringify(payload),Date.now()+duration);
  }
  function bearer(req) {
    const auth = req.headers.authorization || '';
    if (!/^Bearer [A-Za-z0-9_-]{40,100}$/.test(auth)) return null;
    const grant = db.prepare("SELECT * FROM oauth_grants WHERE id=? AND kind='access'").get(digest(auth.slice(7)));
    if (!grant || grant.expires <= Date.now()) return null;
    const payload = JSON.parse(grant.payload);
    return payload.resource === resource && validScopes(payload.scopes) ? { ...payload, client:grant.client_id, family:grant.family } : null;
  }
  function challenge(res, status=401, error='invalid_token') {
    res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp/", scope="learning.read learning.write", error="${error}"`);
    res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify({error}));
  }
  async function handle(req,res,url,json) {
    const path = url.pathname;
    if (req.method === 'GET' && path === '/.well-known/oauth-authorization-server') {
      json(200,{issuer:origin,authorization_endpoint:origin+'/oauth/authorize',token_endpoint:origin+'/oauth/token',registration_endpoint:origin+'/oauth/register',revocation_endpoint:origin+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:SCOPES,authorization_response_iss_parameter_supported:true,client_id_metadata_document_supported:true}); return true;
    }
    if (req.method === 'GET' && ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-protected-resource/mcp/','/mcp/.well-known/oauth-protected-resource'].includes(path)) {
      json(200,{resource,authorization_servers:[origin],scopes_supported:SCOPES,bearer_methods_supported:['header']}); return true;
    }
    if (!path.startsWith('/oauth/')) return false;
    cleanup();
    try {
      if(path === '/oauth/register' && req.method === 'POST') {
        throttle(db,'oauth-register:'+(req.socket.remoteAddress || 'unknown'));
        const data = await readBody(req);
        if ((data.token_endpoint_auth_method || 'none') !== 'none' || !Array.isArray(data.redirect_uris) || data.redirect_uris.length < 1 || data.redirect_uris.length > 5 || !data.redirect_uris.every(uri => typeof uri === 'string' && uri.length < 1024 && callbacks(uri))) fail(400,'Only public ChatGPT OAuth clients are supported.');
        const client_id = fresh(); const name = 'ChatGPT';
        db.prepare('INSERT INTO oauth_clients VALUES (?,?,?)').run(client_id,name,JSON.stringify([...new Set(data.redirect_uris)]));
        json(201,{client_id,client_name:name,redirect_uris:data.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']}); return true;
      }
      if(path === '/oauth/authorize' && req.method === 'GET') {
        const query = Object.fromEntries(url.searchParams);
        const clientId = query.client_id || '';
        const usesClientDocument = clientId === CHATGPT_CLIENT_DOCUMENT;
        const client = usesClientDocument ? null : db.prepare('SELECT redirects FROM oauth_clients WHERE id=?').get(clientId);
        const allowedCallback = usesClientDocument ? query.redirect_uri === CHATGPT_STABLE_CALLBACK : client && JSON.parse(client.redirects).includes(query.redirect_uri);
        const scopes = scopesFor(query.scope || SCOPES.join(' '));
        if (!allowedCallback || query.response_type !== 'code' || query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge || '') || query.resource !== resource || !validScopes(scopes) || (query.state || '').length > 2048) fail(400,'Invalid authorization request.');
        let browser;
        try { browser=identity(db,req); } catch(error) {
          if(error.status !== 401) throw error;
          res.writeHead(303,{Location:'/?connect='+encodeURIComponent(url.pathname+url.search)}); res.end(); return true;
        }
        if (usesClientDocument) {
          if (!await verifyChatGPTClient()) fail(503,'Could not verify the ChatGPT OAuth client. Please try again.');
          db.prepare('INSERT OR IGNORE INTO oauth_clients VALUES (?,?,?)').run(clientId,'ChatGPT',JSON.stringify([CHATGPT_STABLE_CALLBACK]));
        }
        const nonce = fresh();
        const payload = { redirect:query.redirect_uri,state:query.state || '',challenge:query.code_challenge,scopes,resource,browser };
        save(nonce,'consent',clientId,fresh(),payload,600000);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        res.end(`<!doctype html><html lang="en" data-theme="meadow"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ChatGPT · Cadence</title><link rel="stylesheet" href="/style.css"></head><body><main class="connection-consent"><img src="/assets/echo.png" alt="Echo, your learning companion" width="100" height="110"><p class="eyebrow">YOUR LEARNING, CONNECTED</p><h1>Learn with Echo<br>and ChatGPT.</h1><p>Allow ChatGPT to ${scopes.includes('learning.read') ? 'read your learning profile, lesson summaries and saved phrases' : 'save learning results'}${scopes.includes('learning.read') && scopes.includes('learning.write') ? ', and save lessons and review phrases you choose' : ''}.</p><p>Your password and browser session are never shared. You can revoke access in Cadence at any time.</p><form action="/oauth/authorize" method="post"><input type="hidden" name="consent" value="${escapeHtml(nonce)}"><button class="primary" name="decision" value="allow">Connect ChatGPT →</button><button class="text-button" name="decision" value="deny">Cancel connection</button></form></main></body></html>`); return true;
      }
      if(path === '/oauth/authorize' && req.method === 'POST') {
        if(req.headers.origin !== origin) fail(403,'Request origin rejected.');
        const browser = identity(db,req);
        const form = await readBody(req,'form');
        const row = db.prepare("SELECT * FROM oauth_grants WHERE id=? AND kind='consent'").get(digest(String(form.consent || '')));
        if(!row || row.expires <= Date.now()) fail(400,'Consent expired. Please reconnect.');
        const payload = JSON.parse(row.payload);
        if(payload.browser !== browser) fail(403,'Consent belongs to another browser session.');
        db.prepare('DELETE FROM oauth_grants WHERE id=?').run(row.id);
        const redirect = new URL(payload.redirect); redirect.searchParams.set('state',payload.state); redirect.searchParams.set('iss',origin);
        if(form.decision === 'allow') { const code=fresh(); delete payload.browser; save(code,'code',row.client_id,row.family,payload,300000); redirect.searchParams.set('code',code); }
        else redirect.searchParams.set('error','access_denied');
        res.writeHead(303,{Location:redirect.href}); res.end(); return true;
      }
      if(path === '/oauth/token' && req.method === 'POST') {
        throttle(db,'oauth-token:'+(req.socket.remoteAddress || 'unknown'));
        const form = await readBody(req,'form');
        if(form.resource !== resource) fail(400,'Invalid resource.');
        const kind = form.grant_type === 'authorization_code' ? 'code' : form.grant_type === 'refresh_token' ? 'refresh' : '';
        if(!kind) fail(400,'Unsupported grant type.');
        const supplied = kind === 'code' ? form.code : form.refresh_token;
        if(typeof supplied !== 'string' || supplied.length > 200) fail(400,'Invalid grant.');
        const row = db.prepare('SELECT * FROM oauth_grants WHERE id=?').get(digest(supplied));
        if(row?.kind === 'used_refresh' && row.client_id === form.client_id) { db.prepare('DELETE FROM oauth_grants WHERE family=?').run(row.family); fail(400,'Refresh token was already used. Reconnect Cadence.'); }
        if(!row || row.kind !== kind || row.expires <= Date.now() || row.client_id !== form.client_id) fail(400,'Invalid or expired grant.');
        const payload = JSON.parse(row.payload);
        if(payload.resource !== resource) fail(400,'Invalid resource.');
        if(kind === 'code') {
          const verifier = form.code_verifier || '';
          const challenge = createHash('sha256').update(verifier).digest('base64url');
          if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || form.redirect_uri !== payload.redirect || !timingSafeEqual(Buffer.from(challenge),Buffer.from(payload.challenge))) fail(400,'Invalid verifier or callback.');
        }
        if(form.scope && scopesFor(form.scope).join(' ') !== payload.scopes.join(' ')) fail(400,'Scope changes require consent.');
        const access=fresh(), refresh=fresh();
        db.exec('BEGIN IMMEDIATE');
        try {
          if(kind === 'refresh') db.prepare("UPDATE oauth_grants SET kind='used_refresh' WHERE id=?").run(row.id);
          else db.prepare('DELETE FROM oauth_grants WHERE id=?').run(row.id);
          save(access,'access',row.client_id,row.family,payload,3600000);
          save(refresh,'refresh',row.client_id,row.family,payload,30*86400000);
          db.exec('COMMIT');
        } catch(error) { db.exec('ROLLBACK'); throw error; }
        json(200,{access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:payload.scopes.join(' ')},{Pragma:'no-cache'}); return true;
      }
      if(path === '/oauth/revoke' && req.method === 'POST') {
        const form=await readBody(req,'form');
        const row=db.prepare('SELECT client_id,family FROM oauth_grants WHERE id=?').get(digest(String(form.token || '')));
        if(row && row.client_id === form.client_id) db.prepare('DELETE FROM oauth_grants WHERE family=?').run(row.family);
        json(200,{}); return true;
      }
      fail(404,'Not found.');
    } catch(error) { json(error.status || 500,{error:error.status ? 'invalid_request' : 'server_error',error_description:error.status ? error.message : 'Please try again.'}); return true; }
  }
  return {handle,bearer,challenge,resource};
}
