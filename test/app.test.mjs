import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';
import { hashPassword, digest, COOKIE } from '../src/auth.mjs';

// Isolated synthetic credentials; never an actual user account or production store.
const password = 'synthetic-test-password-only';
test('authentication, request protections, preferences and persistence', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cadence-test-'));
  const path = join(directory, 'fixture.sqlite');
  const origin = 'https://learning.jrhtechservices.party';
  const app = await createApp({path, origin});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, options);
  const post = (path, data, headers = {}) => request(path,{method:'POST',headers:{origin,'content-type':'application/json','x-cadence-request':'1',...headers},body:JSON.stringify(data)});
  let cookie;
  try {
    await t.test('public health and app; protected data denied', async () => {
      assert.equal((await request('/api/health')).status,200);
      assert.equal((await request('/')).status,200);
      assert.equal((await request('/api/me')).status,401);
      assert.equal((await post('/api/login',{email:'owner@example.test',password})).status,401);
    });
    app.db.prepare('INSERT INTO owner(id,email,name,password) VALUES (1,?,?,?)').run('owner@example.test','Test learner',await hashPassword(password));
    await t.test('origin/header checks and generic failure', async () => {
      assert.equal((await post('/api/login',{email:'owner@example.test',password},{origin:'https://attacker.example'})).status,403);
      assert.equal((await post('/api/login',{email:'owner@example.test',password},{'x-cadence-request':'0'})).status,403);
      const response = await post('/api/login',{email:'missing@example.test',password});
      assert.equal(response.status,401);
      assert.equal((await response.json()).error,'Email or password not accepted.');
    });
    await t.test('session cookie and hashed server storage', async () => {
      const response = await post('/api/login',{email:'OWNER@example.test',password});
      assert.equal(response.status,200);
      const header = response.headers.get('set-cookie');
      assert.match(header,/^__Host-cadence_session=/);
      for (const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/']) assert.ok(header.includes(flag));
      cookie = header.split(';')[0];
      assert.ok(app.db.prepare('SELECT id FROM sessions WHERE id=?').get(digest(cookie.slice(COOKIE.length+1))));
      const me = await request('/api/me',{headers:{cookie}});
      assert.equal(me.status,200);
      const data = await me.json(); assert.equal(data.name,'Test learner'); assert.ok(!('password' in data));
    });
    await t.test('validates and saves theme and learning profile', async () => {
      const put = (path,data) => request(path,{method:'PUT',headers:{origin,cookie,'content-type':'application/json','x-cadence-request':'1'},body:JSON.stringify(data)});
      assert.equal((await put('/api/theme',{theme:'invalid'})).status,422);
      assert.equal((await put('/api/theme',{theme:'dusk'})).status,200);
      assert.equal((await put('/api/profile',{language:'Japanese',goal:'Travel conversations',minutes:15})).status,200);
      assert.equal((await put('/api/profile',{language:'',goal:'',minutes:99})).status,422);
      assert.equal((await request('/api/me',{headers:{cookie}})).status,200);
    });
    await t.test('logout revokes the session', async () => {
      assert.equal((await post('/api/logout',{}, {cookie})).status,200);
      assert.equal((await request('/api/me',{headers:{cookie}})).status,401);
    });
    await t.test('absolute expiry cannot be extended', async () => {
      const response = await post('/api/login',{email:'owner@example.test',password});
      const expired = response.headers.get('set-cookie').split(';')[0];
      app.db.prepare('UPDATE sessions SET absolute_expires=0').run();
      assert.equal((await request('/api/me',{headers:{cookie:expired}})).status,401);
    });
    await t.test('login limiter survives repeated attempts', async () => {
      for(let i=0;i<15;i++) await post('/api/login',{email:'none',password:'bad'});
      assert.equal((await post('/api/login',{email:'owner@example.test',password})).status,429);
    });
    await t.test('body bounds and content-type validation', async () => {
      assert.equal((await post('/api/login',{email:'x'.repeat(9000),password:'bad'})).status,413);
      const r = await request('/api/login',{method:'POST',headers:{origin,'x-cadence-request':'1','content-type':'text/plain'},body:'x'});
      assert.equal(r.status,415);
    });
  } finally {
    await new Promise(resolve => app.server.close(resolve)); app.db.close();
  }
  const restarted = await createApp({path, origin});
  try {
    assert.equal(restarted.db.prepare('SELECT theme FROM owner WHERE id=1').get().theme,'dusk');
    assert.equal(restarted.db.prepare('SELECT language FROM profile WHERE id=1').get().language,'Japanese');
  } finally { restarted.db.close(); await rm(directory,{recursive:true,force:true}); }
});
