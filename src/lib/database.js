/**
 * lib/database.js — VERSION CORRIGÉE
 *
 * - Pool PostgreSQL OPTIONNEL : si DATABASE_URL absent, hasDB() = false
 *   et toutes les fonctions deviennent des no-op safe
 * - Permet au bot de tourner SANS base de données externe
 */

require('dotenv').config()
const { Pool } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL
const HAS_DB       = Boolean(DATABASE_URL && DATABASE_URL.trim())

let pool = null

if (HAS_DB) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ||
         DATABASE_URL.includes('supabase') ||
         DATABASE_URL.includes('neon') ||
         DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  })

  pool.on('error', (err) => {
    console.error('⚠️  PostgreSQL pool error:', err.message)
  })
} else {
  // Stub pool : toutes les requêtes renvoient un résultat vide
  pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    on: () => {},
    end: async () => {}
  }
}

const hasDB = () => HAS_DB

const init = async () => {
  if (!HAS_DB) {
    console.log('ℹ️  database.init() ignoré (pas de DATABASE_URL)')
    return
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warns (
      id SERIAL PRIMARY KEY,
      jid TEXT NOT NULL,
      group_id TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS groups (
      group_id TEXT PRIMARY KEY,
      antilink BOOLEAN DEFAULT FALSE,
      antilink_action TEXT DEFAULT 'warn',
      antispam BOOLEAN DEFAULT FALSE,
      antispam_action TEXT DEFAULT 'warn',
      antitag BOOLEAN DEFAULT FALSE,
      antibot BOOLEAN DEFAULT FALSE,
      antifake BOOLEAN DEFAULT FALSE,
      antifake_prefixes TEXT DEFAULT '',
      welcome BOOLEAN DEFAULT FALSE,
      welcome_msg TEXT DEFAULT 'Bienvenue @user dans *@group* ! 🎉',
      goodbye BOOLEAN DEFAULT FALSE,
      mute BOOLEAN DEFAULT FALSE
    );
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS antilink_action TEXT DEFAULT 'warn';
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS antispam_action TEXT DEFAULT 'warn';
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS antitag BOOLEAN DEFAULT FALSE;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS antibot BOOLEAN DEFAULT FALSE;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS antifake BOOLEAN DEFAULT FALSE;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS antifake_prefixes TEXT DEFAULT '';

    CREATE TABLE IF NOT EXISTS afk (
      jid TEXT PRIMARY KEY,
      reason TEXT,
      since BIGINT
    );
  `)
  console.log('✅ PostgreSQL initialisé')
}

// ─── WARNS ────────────────────────────────────────────────────────────────────
const addWarn = async (jid, groupId, reason = '') => {
  if (!HAS_DB) return 0
  const ex = await pool.query('SELECT * FROM warns WHERE jid=$1 AND group_id=$2', [jid, groupId])
  if (ex.rows.length) {
    const r = await pool.query(
      'UPDATE warns SET count=count+1, reason=$1 WHERE jid=$2 AND group_id=$3 RETURNING count',
      [reason, jid, groupId]
    )
    return r.rows[0].count
  }
  await pool.query('INSERT INTO warns(jid, group_id, reason) VALUES($1, $2, $3)', [jid, groupId, reason])
  return 1
}

const getWarns = async (jid, groupId) => {
  if (!HAS_DB) return null
  const r = await pool.query('SELECT * FROM warns WHERE jid=$1 AND group_id=$2', [jid, groupId])
  return r.rows[0] || null
}

const resetWarns = async (jid, groupId) => {
  if (!HAS_DB) return
  await pool.query('DELETE FROM warns WHERE jid=$1 AND group_id=$2', [jid, groupId])
}

// ─── GROUPS ───────────────────────────────────────────────────────────────────
const getGroup = async (groupId) => {
  if (!HAS_DB) return null
  await pool.query(
    'INSERT INTO groups(group_id) VALUES($1) ON CONFLICT DO NOTHING',
    [groupId]
  )
  const r = await pool.query('SELECT * FROM groups WHERE group_id=$1', [groupId])
  return r.rows[0] || null
}

const setGroup = async (groupId, key, value) => {
  if (!HAS_DB) return
  const allowed = ['antilink', 'antilink_action', 'antispam', 'antispam_action', 'antitag', 'antibot', 'antifake', 'antifake_prefixes', 'welcome', 'welcome_msg', 'goodbye', 'mute']
  if (!allowed.includes(key)) throw new Error(`Colonne inconnue: ${key}`)
  await pool.query(
    `INSERT INTO groups(group_id, ${key}) VALUES($1, $2)
     ON CONFLICT(group_id) DO UPDATE SET ${key} = $2`,
    [groupId, value]
  )
}

// ─── AFK ──────────────────────────────────────────────────────────────────────
const setAfk = async (jid, reason) => {
  if (!HAS_DB) return
  await pool.query(
    'INSERT INTO afk(jid, reason, since) VALUES($1, $2, $3) ON CONFLICT(jid) DO UPDATE SET reason=$2, since=$3',
    [jid, reason, Date.now()]
  )
}

const getAfk = async (jid) => {
  if (!HAS_DB) return null
  const r = await pool.query('SELECT * FROM afk WHERE jid=$1', [jid])
  return r.rows[0] || null
}

const removeAfk = async (jid) => {
  if (!HAS_DB) return
  await pool.query('DELETE FROM afk WHERE jid=$1', [jid])
}

// Re-export loadDB pour les commandes qui font require('./lib/database')
// (vraie implémentation dans lib/db.js)
let _loadDB = null, _saveDB = null
try {
  ({ loadDB: _loadDB, saveDB: _saveDB } = require('./db'))
} catch {}
const loadDB = _loadDB || (() => ({}))
const saveDB = _saveDB || (() => {})

module.exports = {
  init, pool, hasDB,
  addWarn, getWarns, resetWarns,
  getGroup, setGroup,
  setAfk, getAfk, removeAfk,
  loadDB, saveDB,
}
