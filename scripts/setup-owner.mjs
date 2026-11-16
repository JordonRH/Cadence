import { createInterface } from 'node:readline/promises';
import { openStore } from '../src/store.mjs';
import { hashPassword } from '../src/auth.mjs';

if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run interactively in a terminal.');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('Owner email: ')).trim().toLowerCase();
const name = (await rl.question('Display name: ')).trim();
rl.close();
async function hidden(prompt) {
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const onData = chunk => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = [...value].slice(0,-1).join('');
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}
const password = await hidden('New password (at least 14 characters; hidden): ');
const confirm = await hidden('Repeat password (hidden): ');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 240 || !name || name.length > 100 || password.length < 14 || Buffer.byteLength(password) > 1024 || password !== confirm) throw new Error('Validation failed. No changes made.');
const encoded = await hashPassword(password);
const db = openStore(process.env.DATA_PATH || './data/cadence.sqlite');
try {
  db.exec('BEGIN IMMEDIATE');
  db.prepare("INSERT INTO owner(id,email,name,password) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,password=excluded.password").run(email,name,encoded);
  db.exec('DELETE FROM sessions; DELETE FROM limits; DELETE FROM oauth_grants; COMMIT;');
  console.log('Owner configured. Previous sessions and ChatGPT connections revoked.');
} finally { db.close(); }
