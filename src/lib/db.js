/**
 * lib/db.js
 * Base de données locale JSON simple
 * Stocke: messages sauvegardés, sticker cmds, warns, afk, etc.
 */

const fs = require('fs-extra')
const path = require('path')

const DB_PATH = path.join(__dirname, '../database.json')

const DEFAULT_DB = {
  saved: {},        // messages perso: { jid: { nom: contenu } }
  stickerCmds: {},  // sticker→commande: { hash: 'cmdname' }
  warns: {},        // avertissements: { jid: { user: count } }
  afk: {},          // afk: { jid: { reason, time } }
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeJsonSync(DB_PATH, DEFAULT_DB, { spaces: 2 })
      return { ...DEFAULT_DB }
    }
    return fs.readJsonSync(DB_PATH)
  } catch (_) {
    return { ...DEFAULT_DB }
  }
}

function saveDB(db) {
  try {
    fs.writeJsonSync(DB_PATH, db, { spaces: 2 })
  } catch (e) {
    console.error('[DB] Erreur sauvegarde:', e.message)
  }
}

module.exports = { loadDB, saveDB, DB_PATH }
