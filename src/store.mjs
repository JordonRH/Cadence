import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, theme TEXT NOT NULL DEFAULT 'meadow');
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL, absolute_expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), language TEXT NOT NULL, goal TEXT NOT NULL, minutes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, redirects TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_grants (id TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, family TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS oauth_family ON oauth_grants(family);
    CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, language TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, skills TEXT NOT NULL, minutes INTEGER NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS review_items (id TEXT PRIMARY KEY, language TEXT NOT NULL, phrase TEXT NOT NULL, meaning TEXT NOT NULL, context TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(language,phrase));
  `);
  return db;
}
