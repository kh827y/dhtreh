const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }

class JsonQueueStore {
  constructor(filePath) {
    this.filePath = filePath;
    ensureDir(path.dirname(filePath));
    this.items = this._load();
  }
  _load() {
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); } catch { return []; }
  }
  _save() {
    try { fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2)); } catch {}
  }
  size() { return this.items.length; }
  list(limit = 100) { return this.items.slice(0, limit); }
  add(item) { this.items.push(item); this._save(); }
  removeById(id) { this.items = this.items.filter(i => i.id !== id); this._save(); }
}

class SqliteQueueStore {
  constructor(dbPath) {
    ensureDir(path.dirname(dbPath));
    let sqlite;
    try { sqlite = require('better-sqlite3'); } catch { sqlite = null; }
    if (!sqlite) throw new Error('better-sqlite3 not installed');
    this.db = new sqlite(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      body TEXT NOT NULL,
      idemKey TEXT,
      createdAt INTEGER NOT NULL
    )`);
    this.stmts = {
      insert: this.db.prepare('INSERT INTO queue (id,type,body,idemKey,createdAt) VALUES (?,?,?,?,?)'),
      list: this.db.prepare('SELECT id,type,body,idemKey,createdAt FROM queue ORDER BY createdAt ASC LIMIT ?'),
      remove: this.db.prepare('DELETE FROM queue WHERE id = ?'),
      count: this.db.prepare('SELECT COUNT(1) as c FROM queue'),
    };
  }
  size() { try { return this.stmts.count.get().c || 0; } catch { return 0; } }
  list(limit = 100) { return this.stmts.list.all(limit).map(r => ({ id: r.id, type: r.type, body: JSON.parse(r.body), idemKey: r.idemKey })); }
  add(item) { this.stmts.insert.run(item.id, item.type, JSON.stringify(item.body), item.idemKey || null, Date.now()); }
  removeById(id) { this.stmts.remove.run(id); }
}

function createQueueStore() {
  const backend = (process.env.BRIDGE_QUEUE_BACKEND || 'json').toLowerCase();
  if (backend === 'sqlite') {
    try {
      const dbPath = process.env.BRIDGE_DB_PATH || path.join(__dirname, '..', 'data', 'bridge.db');
      return new SqliteQueueStore(dbPath);
    } catch (e) {
      console.warn('[Bridge] SQLite backend unavailable, falling back to JSON:', e.message || e);
    }
  }
  const file = path.join(__dirname, '..', 'data', 'queue.json');
  return new JsonQueueStore(file);
}

function createQueue() {
  const store = createQueueStore();
  return {
    enqueue(type, body, idemKey) {
      const id = uuidv4();
      store.add({ id, type, body, idemKey });
      return id;
    },
    snapshot(limit = 100) { return store.list(limit).map(x => ({ ...x })); },
    remove(id) { store.removeById(id); },
    size() { return store.size(); },
  };
}

module.exports = { createQueue };
