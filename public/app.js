const $ = selector => document.querySelector(selector);
const themes = new Set(['meadow','paper','dusk','ocean','contrast']);
let user = null;
function theme(value) {
  if (!themes.has(value)) value = 'meadow';
  document.documentElement.dataset.theme = value;
  $('#login-theme').value = value; $('#app-theme').value = value;
  try { localStorage.setItem('cadence-theme', value); } catch {}
}
try { theme(localStorage.getItem('cadence-theme')); } catch { theme('meadow'); }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, credentials:'same-origin', headers: { 'Content-Type':'application/json', 'X-Cadence-Request':'1' }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== '/login') signedOut(); throw new Error(data.error || 'Please try again.'); }
  return data;
}
function signedOut() { user = null; $('#login-screen').hidden = false; $('#app-screen').hidden = true; }
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = false; }
function page(name) {
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `page-${name}`; });
  document.querySelectorAll('[data-page]').forEach(el => { el.classList.toggle('active',el.dataset.page === name); if(el.dataset.page === name) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  if(user && ['library','progress'].includes(name)) refreshLearning().catch(error=>notice(error.message));
  if(user && name === 'connect') refreshConnection().catch(error=>notice(error.message));
}
async function refreshLearning() {
  const data=await api('/learning');
  const phrases=$('#phrase-list'); phrases.replaceChildren();
  if(!data.review.items.length) phrases.append(message('Your first useful words belong here. Ask ChatGPT to save selected phrases to Cadence after a lesson.'));
  for(const item of data.review.items) {
    const card=document.createElement('article'); card.className='activity';
    const heading=document.createElement('h3'); heading.textContent=item.phrase;
    const language=message(item.language,'subtle');
    const details=document.createElement('details'); const summary=document.createElement('summary'); summary.textContent='Recall it, then reveal';
    details.append(summary,message(item.meaning));
    if(item.context) details.append(message(item.context,'subtle'));
    card.append(language,heading,details); phrases.append(card);
  }
  if(data.review.next_offset !== null) phrases.append(message(`Showing ${data.review.items.length} of ${data.review.total} saved phrases. ChatGPT can retrieve the rest.`,'subtle'));
  const lessons=$('#lesson-list'); lessons.replaceChildren();
  if(!data.recent_lessons.length) lessons.append(message('No sessions saved yet. Connect ChatGPT to begin your first lesson.'));
  for(const item of data.recent_lessons) {
    const card=document.createElement('article'); card.className='activity';
    const heading=document.createElement('h3'); heading.textContent=item.title;
    card.append(heading,message(`${item.language} · ${item.minutes} min · ${new Date(item.created).toLocaleDateString()}`,'subtle'),message(item.summary),message(item.skills.join(' · '),'subtle')); lessons.append(card);
  }
}
function message(text,className) {const p=document.createElement('p'); p.textContent=text; if(className) p.className=className; return p;}
async function refreshConnection() {
  const data=await api('/connections'); $('#mcp-address').value=data.mcp_url;
  $('#connection-status').textContent=data.connections.length ? 'ChatGPT has an active Cadence connection.' : 'No active connection yet. Connect the Cadence plugin in ChatGPT to get started.';
  $('#revoke-connection').hidden=!data.connections.length;
}
function render() {
  $('#greeting').textContent = `A little hello, ${user.name}.`;
  const profile = user.profile;
  $('#profile-badge').textContent = profile ? profile.language : 'A fresh start';
  $('#language').value = profile?.language || ''; $('#goal').value = profile?.goal || ''; $('#minutes').value = profile?.minutes || 15;
  $('#hero-title').textContent = profile ? `A little closer to ${profile.language}.` : 'Every adventure starts with hello.';
  $('#hero-description').textContent = profile?.goal || 'Choose the language and real-life moments you want to make your own.';
  $('#open-plan').textContent = profile ? 'Refine my direction →' : 'Find your starting point →';
  document.querySelectorAll('[data-minutes]').forEach(el => el.setAttribute('aria-pressed',String(Number(el.dataset.minutes) === (profile?.minutes || 15))));
}
async function enter() {
  user = await api('/me'); theme(user.theme); render();
  const next=new URLSearchParams(location.search).get('connect');
  if(next?.startsWith('/oauth/authorize?') && new URL(next,location.origin).origin === location.origin) {location.assign(next); return;}
  $('#login-screen').hidden = true; $('#app-screen').hidden = false; page('today');
}
$('#login-theme').onchange = event => theme(event.target.value);
$('#app-theme').onchange = async event => {
  const before = user.theme; const value = event.target.value; theme(value);
  try { await api('/theme','PUT',{theme:value}); user.theme = value; }
  catch(error) { theme(before); notice(error.message); }
};
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; $('#login-error').textContent = '';
  try { await api('/login','POST',Object.fromEntries(new FormData(event.target))); event.target.reset(); await enter(); }
  catch(error) { $('#password').value = ''; $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
$('#logout').onclick = async () => { try { await api('/logout','POST',{}); signedOut(); } catch(error) { notice(error.message); } };
$('#refresh-connection').onclick=()=>refreshConnection().catch(error=>notice(error.message));
$('#revoke-connection').onclick=async()=>{try{await api('/connections/revoke','POST',{}); await refreshConnection(); notice('ChatGPT access revoked. You can reconnect whenever you like.');}catch(error){notice(error.message);}};
document.querySelectorAll('[data-page]').forEach(el => el.onclick = () => page(el.dataset.page));
$('#open-plan').onclick = () => { page('path'); $('#language').focus(); };
document.querySelectorAll('[data-go-path]').forEach(el => el.onclick = () => page('path'));
$('#profile-form').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  try { const data = Object.fromEntries(new FormData(event.target)); data.minutes = Number(data.minutes); user.profile = await api('/profile','PUT',data); render(); page('today'); notice('Your starting point is saved. One little step, taken.'); }
  catch(error) { notice(error.message); } finally { button.disabled = false; }
};
document.querySelectorAll('[data-minutes]').forEach(el => el.onclick = async () => {
  const minutes = Number(el.dataset.minutes);
  if (!user.profile) { page('path'); $('#minutes').value = minutes; return; }
  try { user.profile = await api('/profile','PUT',{...user.profile,minutes}); render(); notice('Your session length is saved.'); } catch(error) { notice(error.message); }
});
enter().catch(error => { if (error.message !== 'Please sign in.') $('#login-error').textContent = error.message; });
