import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from '../src/server.mjs';
import {hashPassword,issueSession,COOKIE,digest} from '../src/auth.mjs';

const origin='https://learning.jrhtechservices.party';
const resource=origin+'/mcp/';
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const clientDocument='https://chatgpt.com/oauth/client.json';
async function fixture(t) {
  const app=await createApp({path:':memory:',origin});
  app.db.prepare('INSERT INTO owner(id,email,name,password) VALUES (1,?,?,?)').run('synthetic@example.test','Synthetic learner',await hashPassword('synthetic-only-not-a-real-account'));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{app.server.closeAllConnections(); await new Promise(resolve=>app.server.close(resolve)); app.db.close();});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const cookie=COOKIE+'='+issueSession(app.db);
  const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
  const json=(path,data,headers={})=>request(path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
  const form=(path,data,headers={})=>request(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(data)});
  const registration=await json('/oauth/register',{redirect_uris:[callback],token_endpoint_auth_method:'none'});
  assert.equal(registration.status,201);
  const client=(await registration.json()).client_id;
  async function authorize({scopes='learning.read learning.write',browser=cookie,decision='allow',clientId=client}={}) {
    const verifier=randomBytes(48).toString('base64url');
    const query=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),resource,scope:scopes,state:'synthetic-state'});
    const page=await request('/oauth/authorize?'+query,{headers:{cookie:browser}});
    assert.equal(page.status,200);
    const html=await page.text(); const nonce=html.match(/name="consent" value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(nonce);
    const consent=await form('/oauth/authorize',{consent:nonce,decision},{origin,cookie:browser});
    assert.equal(consent.status,303);
    const redirect=new URL(consent.headers.get('location'));
    assert.equal(redirect.origin,'https://chatgpt.com'); assert.equal(redirect.searchParams.get('iss'),origin);
    return {verifier,code:redirect.searchParams.get('code'),error:redirect.searchParams.get('error')};
  }
  async function exchange(grant,changes={}) {
    return form('/oauth/token',{grant_type:'authorization_code',code:grant.code,code_verifier:grant.verifier,client_id:client,redirect_uri:callback,resource,...changes});
  }
  async function access(scopes) {const response=await exchange(await authorize({scopes})); assert.equal(response.status,200); return response.json();}
  return {...app,base,cookie,client,request,json,form,authorize,exchange,access};
}
test('OAuth discovery, callback validation, consent and PKCE',async t=>{
  const f=await fixture(t);
  const metadata=await(await f.request('/.well-known/oauth-protected-resource/mcp/')).json();
  assert.equal(metadata.resource,resource);
  const denied=await f.request('/mcp/'); assert.equal(denied.status,401); assert.match(denied.headers.get('www-authenticate'),/resource_metadata=/);
  for(const uri of ['http://chatgpt.com/connector_platform_oauth_redirect','https://attacker.example/connector_platform_oauth_redirect','https://chatgpt.com.evil.example/connector_platform_oauth_redirect','https://chatgpt.com/connector/oauth/','https://chatgpt.com/connector_platform_oauth_redirect?evil=1']) assert.equal((await f.json('/oauth/register',{redirect_uris:[uri]})).status,400);
  const notSignedIn=await f.request('/oauth/authorize?'+new URLSearchParams({client_id:f.client,redirect_uri:callback,response_type:'code',code_challenge_method:'S256',code_challenge:'a'.repeat(43),resource}));
  assert.equal(notSignedIn.status,303); assert.ok(notSignedIn.headers.get('location').startsWith('/?connect='));
  assert.equal((await f.authorize({decision:'deny'})).error,'access_denied');
  const grant=await f.authorize();
  assert.equal((await f.exchange(grant,{code_verifier:'x'.repeat(64)})).status,400);
  assert.equal((await f.exchange(grant,{resource:origin+'/wrong'})).status,400);
  assert.equal((await f.exchange(grant)).status,200);
  assert.equal((await f.exchange(grant)).status,400);
});
test('OAuth nonce is bound to its browser and safe markup is returned',async t=>{
  const f=await fixture(t);
  const q=new URLSearchParams({client_id:f.client,redirect_uri:callback,response_type:'code',code_challenge_method:'S256',code_challenge:'b'.repeat(43),resource,scope:'learning.read'});
  const html=await(await f.request('/oauth/authorize?'+q,{headers:{cookie:f.cookie}})).text();
  const nonce=html.match(/name="consent" value="([A-Za-z0-9_-]+)"/)[1];
  const other=COOKIE+'='+issueSession(f.db);
  assert.equal((await f.form('/oauth/authorize',{consent:nonce,decision:'allow'},{origin,cookie:other})).status,403);
  assert.equal((await f.form('/oauth/authorize',{consent:nonce,decision:'allow'},{origin:'https://attacker.example',cookie:f.cookie})).status,403);
  assert.equal((await f.form('/oauth/authorize',{consent:nonce,decision:'allow'},{origin,cookie:f.cookie})).status,303);
  assert.equal((await f.form('/oauth/authorize',{consent:nonce,decision:'allow'},{origin,cookie:f.cookie})).status,400);
});
test('ChatGPT CIMD uses its verified public client and the existing consent and token flow',async t=>{
  const f=await fixture(t);
  const fetchLocal=globalThis.fetch;
  let documentRequests=0;
  let publishedClientId='https://invalid.example/oauth/client.json';
  t.mock.method(globalThis,'fetch',async (url, options)=>{
    if (url===clientDocument) {
      documentRequests++;
      assert.equal(options.redirect,'error');
      return Response.json({client_id:publishedClientId,redirect_uris:[callback],token_endpoint_auth_method:'private_key_jwt',token_endpoint_auth_methods_supported:['none','private_key_jwt']});
    }
    assert.ok(url.startsWith(f.base+'/'));
    return fetchLocal(url, options);
  });
  const metadata=await(await f.request('/.well-known/oauth-authorization-server')).json();
  assert.equal(metadata.client_id_metadata_document_supported,true);
  assert.equal(metadata.registration_endpoint,origin+'/oauth/register');
  const query=new URLSearchParams({client_id:'https://invalid.example/oauth/client.json',redirect_uri:callback,response_type:'code',code_challenge_method:'S256',code_challenge:'a'.repeat(43),resource});
  const authorize=()=>f.request('/oauth/authorize?'+query,{headers:{cookie:f.cookie}});
  assert.equal((await authorize()).status,400);
  query.set('client_id',clientDocument);
  query.set('redirect_uri','https://chatgpt.com/connector/oauth/different-callback');
  assert.equal((await authorize()).status,400);
  assert.equal(documentRequests,0);
  query.set('redirect_uri',callback);
  assert.equal((await authorize()).status,503);
  publishedClientId=clientDocument;
  const grant=await f.authorize({clientId:clientDocument});
  assert.equal((await f.exchange(grant)).status,400);
  const response=await f.exchange(grant,{client_id:clientDocument});
  assert.equal(response.status,200);
  const tokens=await response.json();
  assert.equal((await f.form('/oauth/token',{grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:clientDocument,resource})).status,200);
  assert.equal(documentRequests,2);
});
test('MCP SDK client can discover tools and persist real-shaped learning records safely',async t=>{
  const f=await fixture(t); const tokens=await f.access();
  assert.ok(f.db.prepare("SELECT id FROM oauth_grants WHERE id=? AND kind='access'").get(digest(tokens.access_token)));
  const client=new Client({name:'cadence-test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(f.base+'/mcp/'),{requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}}));
  t.after(()=>client.close());
  const tools=await client.listTools();
  assert.deepEqual(tools.tools.map(tool=>tool.name).sort(),['get_learning_context','get_review_items','save_lesson','save_review_items','set_learning_profile']);
  const call=(name,args={})=>client.callTool({name,arguments:args});
  assert.equal((await call('get_learning_context')).structuredContent.profile,null);
  assert.ok(!(await call('set_learning_profile',{language:'Spanish',goal:'Travel conversations',minutes:15})).isError);
  const lesson={session_id:'synthetic-session-001',language:'Spanish',title:'A short hello',summary:'Practised greetings and one introduction.',skills:['speaking','vocabulary'],minutes:5};
  assert.ok(!(await call('save_lesson',lesson)).isError);
  assert.equal((await call('save_lesson',lesson)).structuredContent.already_saved,true);
  assert.equal((await call('save_lesson',{...lesson,summary:'Different summary'})).isError,true);
  const phrases={language:'Spanish',items:[{phrase:'Hola',meaning:'Hello',context:'Greeting someone'}]};
  assert.equal((await call('save_review_items',phrases)).structuredContent.added,1);
  assert.equal((await call('save_review_items',phrases)).structuredContent.already_present,1);
  const saved=(await call('get_review_items',{language:'Spanish'})).structuredContent;
  assert.equal(saved.items.length,1); assert.equal(saved.items[0].phrase,'Hola');
  const browser=await f.request('/api/learning',{headers:{cookie:f.cookie}}); assert.equal(browser.status,200);
  const data=await browser.json(); assert.equal(data.recent_lessons.length,1); assert.equal(data.review.total,1);
  const connections=await(await f.request('/api/connections',{headers:{cookie:f.cookie}})).json(); assert.equal(connections.connections.length,1);
  assert.equal((await f.json('/api/connections/revoke',{}, {origin,cookie:f.cookie,'x-cadence-request':'1'})).status,200);
  assert.equal((await f.request('/mcp/',{headers:{Authorization:'Bearer '+tokens.access_token}})).status,401);
});
test('read-only scopes reject writes; expired access and refresh replay are rejected',async t=>{
  const f=await fixture(t); const tokens=await f.access('learning.read');
  const client=new Client({name:'scope-test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(f.base+'/mcp/'),{requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}})); t.after(()=>client.close());
  const result=await client.callTool({name:'set_learning_profile',arguments:{language:'Spanish',goal:'Travel',minutes:15}});
  assert.equal(result.isError,true); assert.ok(result._meta['mcp/www_authenticate']);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM profile').get().count,0);
  const form={grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:f.client,resource};
  const refreshed=await f.form('/oauth/token',form); assert.equal(refreshed.status,200); const rotated=await refreshed.json();
  assert.equal((await f.form('/oauth/token',form)).status,400);
  assert.equal((await f.request('/mcp/',{headers:{Authorization:'Bearer '+rotated.access_token}})).status,401);
  const fresh=await f.access();
  f.db.prepare("UPDATE oauth_grants SET expires=0 WHERE id=?").run(digest(fresh.access_token));
  assert.equal((await f.request('/mcp/',{headers:{Authorization:'Bearer '+fresh.access_token}})).status,401);
});
