/**
 * src/index.js — VERSION FINALE POUR XHRIS HOST
 *
 * Corrections majeures :
 *  - SESSION_ID : support base64 brut + zlib/gzip/brotli (format CHRIS_MD_eJ...)
 *  - SESSION_DIR configurable via env (BOT_SESSION_DIR)
 *  - Base de données complètement optionnelle (le bot tourne sans DATABASE_URL)
 *  - Logs de readiness qui matchent XHRIS pattern
 *  - emitOwnEvents: true → tes propres messages déclenchent les commandes
 *  - shouldSyncHistoryMessage: () => false → pas de rattrapage d'historique au démarrage
 *  - shouldIgnoreJid → filtre broadcast/newsletter tôt
 *  - getMessage retourne undefined → arrête les retries Signal infinis
 *  - keepAliveIntervalMs porté à 30s, defaultQueryTimeoutMs à 60s
 *  - Auto-injection du connector XHRIS si présent
 */

require('dotenv').config()
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs   = require('fs-extra')
const path = require('path')
const cron = require('node-cron')
const zlib = require('zlib')

const { init: initDB, pool, hasDB } = require('./lib/database')
const { loadCommands }              = require('./lib/loader')
const { handleMessage, invalidateGroupCache } = require('./handlers/message')
const { handleGroupEvents }         = require('./handlers/group')
const { cleanTmp }                  = require('./lib/utils')
const { loadConfig, saveConfig }    = require('./lib/config')
const { handleAutoStatus }          = require('./lib/eventHandlers')

// Connector XHRIS (optionnel)
let xhris = null
try {
  const connectorPath = path.join(__dirname, '..', 'xhrishost-connector.js')
  if (fs.existsSync(connectorPath)) {
    xhris = require(connectorPath)
    console.log('🔌 Connector XHRIS HOST détecté')
  }
} catch (e) {
  console.error('⚠️  Connector XHRIS non chargé:', e.message)
}

// ─── INIT UPTIME GLOBAL ───────────────────────────────────────────────────────
if (!process._botStartTime) process._botStartTime = Date.now()

const SESSION_DIR = process.env.BOT_SESSION_DIR || path.join(__dirname, '../session')
const BOT_NAME    = process.env.BOT_NAME || 'MonBot'
const PREFIX      = process.env.PREFIX || '.'

console.log(`[XHRIS] Bot starting — ${BOT_NAME} (node ${process.version})`)
console.log(`[XHRIS] Session dir: ${SESSION_DIR}`)

// ─── SUDO depuis .env ─────────────────────────────────────────────────────────
const SUDO_PHONES = (process.env.SUDO || '')
  .split(',')
  .map(n => n.trim().replace(/[^0-9]/g, ''))
  .filter(Boolean)
const SUDO_JIDS = SUDO_PHONES.map(p => `${p}@s.whatsapp.net`)

const OWNER_NUMBER_ENV = (process.env.OWNER_NUMBER || process.env.OWNER || '')
  .replace(/[^0-9]/g, '')

// ─── SESSION WHITELIST ────────────────────────────────────────────────────────
const SESSION_FILES_WHITELIST = ['creds.json']

// ─── SAUVEGARDE SESSION DB ───────────────────────────────────────────────────
const saveSessionToDB = async () => {
  if (!hasDB()) return
  try {
    if (!fs.existsSync(SESSION_DIR)) return
    const files = {}
    for (const f of fs.readdirSync(SESSION_DIR)) {
      if (!SESSION_FILES_WHITELIST.includes(f)) continue
      try { files[f] = fs.readFileSync(path.join(SESSION_DIR, f), 'utf8') } catch {}
    }
    if (!files['creds.json']) return
    await pool.query(`
      INSERT INTO bot_session(id, data, updated_at) VALUES(1, $1, NOW())
      ON CONFLICT(id) DO UPDATE SET data=$1, updated_at=NOW()
    `, [JSON.stringify(files)])
  } catch {}
}

// ─── CHARGEMENT SESSION DB ───────────────────────────────────────────────────
const loadSessionFromDB = async () => {
  if (!hasDB()) return false
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_session (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    const r = await pool.query('SELECT data FROM bot_session WHERE id=1')
    if (!r.rows.length) return false
    const files = JSON.parse(r.rows[0].data)
    fs.ensureDirSync(SESSION_DIR)
    for (const [filename, content] of Object.entries(files)) {
      if (!SESSION_FILES_WHITELIST.includes(filename)) continue
      fs.writeFileSync(path.join(SESSION_DIR, filename), content)
    }
    console.log('✅ Session chargée depuis PostgreSQL')
    return true
  } catch (e) {
    console.error('⚠️  Impossible de charger session depuis DB:', e.message)
    return false
  }
}

// ─── RESTAURATION SESSION_ID (base64 brut OU zlib/gzip/brotli+base64) ────────
const restoreSession = () => {
  const sessionId = (process.env.SESSION_ID || '').trim()
  if (!sessionId) {
    console.log('ℹ️  Aucun SESSION_ID dans l\'env — démarrage en mode pairing/QR')
    return
  }

  const credsPath = path.join(SESSION_DIR, 'creds.json')
  if (fs.existsSync(credsPath)) {
    console.log('ℹ️  creds.json déjà présent — SESSION_ID ignoré')
    return
  }

  try {
    // Retirer préfixe connu
    const KNOWN_PREFIXES = ['CHRIS_MD_', 'WABOT_', 'XHRIS_', 'SESSION_']
    let encoded = sessionId
    for (const p of KNOWN_PREFIXES) {
      if (encoded.startsWith(p)) {
        encoded = encoded.slice(p.length)
        console.log(`[Session] Préfixe détecté: ${p}`)
        break
      }
    }

    // Base64 → Buffer
    let buf
    try {
      buf = Buffer.from(encoded, 'base64')
    } catch (e) {
      console.error('❌ SESSION_ID: base64 invalide')
      return
    }

    // Essayer plusieurs méthodes de décompression
    const attempts = [
      { name: 'zlib inflate (raw)',   fn: () => zlib.inflateRawSync(buf) },
      { name: 'zlib inflate (std)',   fn: () => zlib.inflateSync(buf) },
      { name: 'gunzip',               fn: () => zlib.gunzipSync(buf) },
      { name: 'brotli',               fn: () => zlib.brotliDecompressSync(buf) },
      { name: 'raw (no compression)', fn: () => buf },
    ]

    let decoded = null
    let usedMethod = null
    for (const { name, fn } of attempts) {
      try {
        const out = fn()
        const txt = out.toString('utf8')
        JSON.parse(txt)  // valider que c'est du JSON
        decoded = txt
        usedMethod = name
        break
      } catch {
        continue
      }
    }

    if (!decoded) {
      console.error('❌ SESSION_ID: impossible de décoder (essayé base64 + zlib/gzip/brotli/raw)')
      console.error('   → Régénérez votre session sur le site de pairing du bot')
      return
    }

    console.log(`[Session] Décodage réussi: ${usedMethod}`)

    const parsed = JSON.parse(decoded)
    fs.ensureDirSync(SESSION_DIR)

    let files
    if (parsed && (parsed.noiseKey || parsed.signedIdentityKey || parsed.me)) {
      // Le JSON est directement le contenu de creds.json
      files = { 'creds.json': JSON.stringify(parsed) }
    } else if (parsed && typeof parsed === 'object') {
      // Multi-fichiers { "creds.json": "...", "pre-key-1.json": "...", ... }
      files = parsed
    } else {
      console.error('❌ SESSION_ID: structure JSON inattendue')
      return
    }

    let count = 0
    for (const [filename, content] of Object.entries(files)) {
      const safeName = path.basename(filename)
      const finalContent = typeof content === 'string' ? content : JSON.stringify(content)
      fs.writeFileSync(path.join(SESSION_DIR, safeName), finalContent)
      count++
    }
    console.log(`✅ Session restaurée depuis SESSION_ID (${count} fichier${count > 1 ? 's' : ''})`)
  } catch (e) {
    console.error('❌ Erreur restauration session:', e.message)
  }
}

// ─── KEEP ALIVE ──────────────────────────────────────────────────────────────
const keepAlive = () => {
  setInterval(() => {
    process.stdout.write('')
    if (global.botSock) { try { const _ = global.botSock.user } catch {} }
  }, 20000)
}

// ─── ERREURS GLOBALES ────────────────────────────────────────────────────────
process.on('uncaughtException',  err    => console.error('💥 uncaughtException:', err.message))
process.on('unhandledRejection', reason => console.error('💥 unhandledRejection:', reason?.message || reason))

// ─── msgRetryCounterCache ─────────────────────────────────────────────────────
const msgRetryCounterCache = {
  _data: new Map(),
  get (key)        { return this._data.get(key) },
  set (key, val)   { this._data.set(key, val); return this },
  del (key)        { this._data.delete(key) },
  has (key)        { return this._data.has(key) },
  flushAll ()      { this._data.clear() }
}
const msgStore             = new Map()
global.msgStore            = msgStore   // exposé pour .search
let   reconnectCount       = 0

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────────
let _botRunning = false

const startBot = async () => {
  if (_botRunning) {
    console.log('⚠️  startBot() ignoré — instance déjà active')
    return
  }
  _botRunning = true

  if (hasDB()) {
    try {
      await initDB()
    } catch (e) {
      console.error('⚠️  DB init failed (non bloquant):', e.message)
    }
  } else {
    console.log('ℹ️  Pas de DATABASE_URL — fonctionnement sans persistence DB')
  }

  loadCommands()

  // ── Config dynamique ──────────────────────────────────────────────────────
  const config = loadConfig()
  if (!config._prefixSetManually) config.prefix = PREFIX
  if (!config.sudo || config.sudo.length === 0) config.sudo = SUDO_JIDS
  if (!config.botName)   config.botName   = BOT_NAME
  if (!config.packname)  config.packname  = `${BOT_NAME} Pack`
  if (!config.packauthor) config.packauthor = BOT_NAME

  if (OWNER_NUMBER_ENV && !config.ownerNumber) {
    config.ownerNumber = OWNER_NUMBER_ENV
  }
  if (!config.botName || config.botName === 'MonBot') config.botName = 'XHRIS-MD'
  await saveConfig(config)
  if (OWNER_NUMBER_ENV) {
    console.log(`[XHRIS] OWNER_NUMBER gravé: +${OWNER_NUMBER_ENV}`)
  }

  // ── i18n init ─────────────────────────────────────────────────────────────
  try {
    const { setLang } = require('./lib/i18n')
    setLang(config.lang || 'fr')
  } catch {}

  // ── Session ───────────────────────────────────────────────────────────────
  const loadedFromDB = await loadSessionFromDB()
  if (!loadedFromDB) restoreSession()

  fs.ensureDirSync(SESSION_DIR)
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version }          = await fetchLatestBaileysVersion()

  console.log(`[XHRIS] Baileys v${version.join('.')} — connecting to WhatsApp...`)

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal: false,
    logger:            pino({ level: 'silent' }),
    browser:           [BOT_NAME, 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory:   false,
    shouldSyncHistoryMessage: () => false,
    shouldIgnoreJid: (jid) => isJidBroadcast(jid) || (jid && jid.endsWith && jid.endsWith('@newsletter')),
    markOnlineOnConnect: true,
    connectTimeoutMs:  60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    emitOwnEvents:     true,
    fireInitQueries:   true,
    msgRetryCounterCache,
    getMessage: async (key) => {
      const msgs = msgStore.get(key.remoteJid)
      if (msgs) {
        const m = msgs.get(key.id)
        if (m?.message) return m.message
      }
      return undefined
    }
  })

  global.botSock = sock

  if (!global._reminderCronStarted) {
    global._reminderCronStarted = true
    setInterval(async () => {
      try {
        const { loadDB, saveDB } = require('./lib/db')
        const db = loadDB()
        if (!db.reminders?.length || !global.botSock) return
        const now = Date.now()
        const fired = []
        const remaining = []
        for (const r of db.reminders) {
          if (r.triggerAt <= now) fired.push(r)
          else remaining.push(r)
        }
        if (!fired.length) return
        for (const r of fired) {
          try {
            await global.botSock.sendMessage(r.chatId, {
              text: `RAPPEL\n\n${r.message}\n\nProgramme il y a ${Math.floor((now - r.createdAt) / 60000)} min`,
              mentions: [r.userId]
            })
          } catch (e) {
            console.error('[Reminder] echec envoi:', e.message)
          }
        }
        db.reminders = remaining
        saveDB(db)
      } catch (e) {
        console.error('[ReminderCron]', e.message)
      }
    }, 30000)
  }

  // ─── CONNEXION ─────────────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      try {
        const qrcode = require('qrcode-terminal')
        qrcode.generate(qr, { small: true })
      } catch {
        console.log('\n📱 QR disponible — installe qrcode-terminal\n')
      }
      console.log('📱 Scanne le QR code avec WhatsApp → Appareils liés\n')
    }

    if (connection === 'open') {
      reconnectCount = 0

      // ⚠️ LOGS DE READINESS — DOIVENT MATCHER LE PATTERN XHRIS
      console.log(`\n✅ ${BOT_NAME} connecté ! JID: ${sock.user.id}`)
      console.log(`[WA-CONNECT] open — bot connected to WhatsApp\n`)

      await saveSessionToDB()

      const botRawJid = sock.user.id
      const botNumber = botRawJid.split(':')[0].split('@')[0]

      const cfg = loadConfig()
      let cfgChanged = false

      if (!cfg.ownerNumber) {
        cfg.ownerNumber = OWNER_NUMBER_ENV || botNumber
        cfgChanged = true
        console.log(`📱 Owner défini: +${cfg.ownerNumber}`)
      }

      if (!cfg.sudo) { cfg.sudo = []; cfgChanged = true }
      const botSudoJid = botNumber + '@s.whatsapp.net'
      if (!cfg.sudo.includes(botSudoJid)) {
        cfg.sudo.push(botSudoJid)
        cfgChanged = true
      }

      if (cfgChanged) await saveConfig(cfg).catch(() => {})
      console.log(`📱 Owner: +${cfg.ownerNumber} | Connecté: +${botNumber}`)

      if (xhris && typeof xhris.onBotStart === 'function') {
        try {
          const ownerJid = (cfg.ownerNumber || botNumber) + '@s.whatsapp.net'
          await xhris.onBotStart(sock, ownerJid)
          console.log('🔌 XHRIS Host: bot enregistré')
        } catch (e) {
          console.error('⚠️  XHRIS onBotStart failed:', e.message)
        }
      }

      const startMsg =
        `╔══════════════════════╗\n` +
        `║  🤖  *${(cfg.botName || BOT_NAME).padEnd(14)}* ║\n` +
        `╠══════════════════════╣\n` +
        `║ ✅ Bot connecté!\n` +
        `║ 📱 Numéro: *+${botNumber}*\n` +
        `║ ──────────────────────\n` +
        `║ ⚡ Préfixe : *${cfg.prefix || PREFIX}*\n` +
        `║ 🟢 Test   : *${cfg.prefix || PREFIX}alive*\n` +
        `║ 📋 Menu   : *${cfg.prefix || PREFIX}menu*\n` +
        `║ 👑 Owner  : *${cfg.prefix || PREFIX}owner*\n` +
        `║ ──────────────────────\n` +
        `║ 🕐 ${new Date().toLocaleString('fr-FR')}\n` +
        `║ 📦 Node: ${process.version}\n` +
        `╚══════════════════════╝`

      const allTargets = [...new Set([
        botRawJid.split(':')[0] + '@s.whatsapp.net',
        ...SUDO_JIDS,
        ...(cfg.sudo || [])
      ])]
      for (const jid of allTargets) {
        try { await sock.sendMessage(jid, { text: startMsg }) } catch {}
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.log('🔌 Connexion fermée. Raison:', reason)

      _botRunning = false
      global.botSock = null

      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Session expirée — supprimez le bot et redéployez avec une nouvelle session.')
        fs.removeSync(SESSION_DIR)
        process.exit(1)
      } else if (reason === DisconnectReason.badSession) {
        console.log('❌ Session corrompue. Relance...')
        fs.removeSync(SESSION_DIR)
        setTimeout(startBot, 3000)
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log('⚠️  Connexion remplacée. Attente 15s...')
        setTimeout(startBot, 15000)
      } else {
        reconnectCount++
        const delay = Math.min(5000 * Math.min(reconnectCount, 6), 60000)
        console.log(`🔄 Reconnexion dans ${delay / 1000}s... (tentative ${reconnectCount})`)
        setTimeout(startBot, delay)
      }
    }
  })

  // ─── CREDS UPDATE ──────────────────────────────────────────────────────────
  sock.ev.on('creds.update', async () => {
    await saveCreds()
    await saveSessionToDB()
  })

  // ─── MESSAGES ENTRANTS ────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      try {
        const remoteJid = msg.key?.remoteJid || ''

        if (!remoteJid.endsWith('@newsletter')) {
          const msgTypes = msg.message ? Object.keys(msg.message) : []
          console.log(`[RAW] type=${type} | jid=${remoteJid} | fromMe=${msg.key?.fromMe} | keys=${msgTypes.join(',')}`)
        }

        if (!msg.message) continue

        const msgKeys = Object.keys(msg.message)
        if (msgKeys.length === 1 && (msgKeys[0] === 'protocolMessage' || msgKeys[0] === 'senderKeyDistributionMessage')) continue
        if (msgKeys.every(k => ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'].includes(k))) continue

        if (remoteJid === 'status@broadcast') {
          const cfg = loadConfig()
          await handleAutoStatus(sock, msg, cfg)
          continue
        }

        if (isJidBroadcast(remoteJid)) continue
        if (remoteJid.endsWith('@newsletter')) continue

        // Stocker AVANT le filtre fromMe pour que l'antidelete fonctionne sur tous les messages
        if (!msgStore.has(remoteJid)) msgStore.set(remoteJid, new Map())
        const jidMap = msgStore.get(remoteJid)
        jidMap.set(msg.key.id, msg)
        if (jidMap.size > 100) {
          const firstKey = jidMap.keys().next().value
          jidMap.delete(firstKey)
        }
        if (msgStore.size > 200) {
          const oldestJid = msgStore.keys().next().value
          msgStore.delete(oldestJid)
        }

        if (msg.key.fromMe && remoteJid.endsWith('@g.us')) continue

        // ── Mention reply ─────────────────────────────────────────────────
        try {
          const { loadConfig: _lc } = require('./lib/config')
          const _cfg = _lc()
          if (_cfg.mentionReply) {
            const _botNum  = (sock.user?.id || '').split(':')[0].split('@')[0]
            const _mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            const _lidBot    = sock.user?.lid?.split(':')[0].split('@')[0]
            const isMentioned = _mentioned.some(j => {
              const jBase = j.split(':')[0].split('@')[0]
              return jBase === _botNum || (_lidBot && jBase === _lidBot)
            })
            if (isMentioned && !msg.key.fromMe) {
              await sock.sendMessage(remoteJid, {
                text: _cfg.mentionMessage || 'Bonjour ! 👋'
              }, { quoted: msg })
            }
          }
        } catch {}

        // ── XHRIS connector commands (optionnel) ─────────────────────────
        if (xhris && typeof xhris.handleCommand === 'function') {
          try {
            const handled = await xhris.handleCommand(sock, msg)
            if (handled) continue
          } catch (e) {
            console.error('⚠️  XHRIS handleCommand:', e.message)
          }
        }

        await handleMessage(sock, msg)
      } catch (e) {
        console.error('[UPSERT] CRASH:', e)
      }
    }
  })

  // ─── GROUPE EVENTS ────────────────────────────────────────────────────────
  sock.ev.on('groups.update', updates => {
    for (const u of updates) if (u.id) invalidateGroupCache(u.id)
  })

  // ── ANTIDELETE ─────────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages: adMsgs, type: adType }) => {
    if (adType !== 'notify') return
    try {
      const { loadDB }     = require('./lib/database')
      const { loadConfig } = require('./lib/config')
      const { downloadMediaMessage: dlm } = require('@whiskeysockets/baileys')
      const db     = loadDB()
      const config = loadConfig()
      if (!db.antidelete?.enabled) return

      const ownerNum = config.ownerNumber || sock.user?.id?.split(':')[0].split('@')[0]
      const ownerJid = ownerNum ? `${ownerNum}@s.whatsapp.net` : null
      const mode     = db.antidelete?.mode || 'c'

      for (const m2 of adMsgs) {
        const proto = m2.message?.protocolMessage
        if (!proto || proto.type !== 0) continue

        const deletedKey = proto.key
        if (!deletedKey?.id) continue

        const chatJid   = m2.key.remoteJid
        const storedMsg = msgStore.get(chatJid)?.get(deletedKey.id)
        if (!storedMsg?.message) continue

        const senderJid = deletedKey.participant || deletedKey.remoteJid || chatJid
        const senderNum = senderJid.split(':')[0].split('@')[0]
        const chatType  = chatJid.endsWith('@g.us') ? 'groupe' : 'privé'
        const note      = `🗑️ *Message supprimé*\n👤 +${senderNum}\n📍 ${chatType}`
        const sendTo    = mode === 'm' && ownerJid ? ownerJid : chatJid
        const sm        = storedMsg.message
        const dl        = () => dlm(storedMsg, 'buffer', {}, { logger: { info:()=>{}, error:()=>{}, warn:()=>{} } })

        try {
          const text = sm.conversation || sm.extendedTextMessage?.text
          if (text) {
            await sock.sendMessage(sendTo, { text: `${note}\n\n💬 "${text}"` })
          } else if (sm.imageMessage) {
            const buf = await dl()
            await sock.sendMessage(sendTo, { image: buf, caption: `${note}${sm.imageMessage.caption ? '\n' + sm.imageMessage.caption : ''}` })
          } else if (sm.videoMessage) {
            const buf = await dl()
            await sock.sendMessage(sendTo, { video: buf, caption: `${note}${sm.videoMessage.caption ? '\n' + sm.videoMessage.caption : ''}` })
          } else if (sm.stickerMessage) {
            const buf = await dl()
            await sock.sendMessage(sendTo, { sticker: buf })
            await sock.sendMessage(sendTo, { text: note })
          } else if (sm.audioMessage) {
            const buf = await dl()
            await sock.sendMessage(sendTo, { audio: buf, mimetype: 'audio/mp4' })
            await sock.sendMessage(sendTo, { text: note })
          } else {
            await sock.sendMessage(sendTo, { text: `${note}\n_(Média non récupérable)_` })
          }
        } catch (e2) { console.error('[Antidelete send]', e2.message) }
      }
    } catch (e) { console.error('[Antidelete]', e.message) }
  })

  sock.ev.on('group-participants.update', async (update) => {
    invalidateGroupCache(update.id)
    try { await handleGroupEvents(sock, update) } catch (e) {
      console.error('Erreur group-participants.update:', e.message)
    }
  })

  // ─── NETTOYAGE TMP ───────────────────────────────────────────────────────
  cron.schedule('0 * * * *', () => {
    cleanTmp().catch(e => console.error('cleanTmp error:', e.message))
  })

  // ─── CRON REMINDERS (toutes les 30s) ────────────────────────────────────
  setInterval(async () => {
    try {
      const { loadDB, saveDB } = require('./lib/db')
      const db = loadDB()
      if (!db.reminders?.length) return
      const now = Date.now()
      const fired     = db.reminders.filter(r => r.triggerAt <= now)
      const remaining = db.reminders.filter(r => r.triggerAt >  now)
      if (!fired.length) return
      for (const r of fired) {
        try {
          await sock.sendMessage(r.chatId, {
            text:     `🔔 *RAPPEL*\n\n💬 ${r.message}\n\n_Programmé il y a ${Math.floor((now - r.createdAt) / 60000)} min_`,
            mentions: [r.userId]
          })
        } catch (e) {
          console.error('[Reminder] échec envoi:', e.message)
        }
      }
      db.reminders = remaining
      saveDB(db)
    } catch (e) { console.error('[ReminderCron]', e.message) }
  }, 30000)

  return sock
}

// ─── LANCEMENT ────────────────────────────────────────────────────────────────
keepAlive()
startBot().catch(e => {
  console.error('❌ Erreur démarrage:', e)
  setTimeout(startBot, 10000)
})
