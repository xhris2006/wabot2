/**
 * handlers/message.js — VERSION CORRIGÉE
 *
 * FIXES :
 * - ownerNumber = JID du compte connecté (sock.user) et non plus .env
 * - antilink / antispam : appliqués ici directement sur chaque message
 * - downloadMediaMessage : utilise la bonne API Baileys (downloadMediaMessage importé)
 * - block : fonctionne en privé (pas besoin de groupe)
 * - profil : fonctionne en privé avec numéro en argument
 * - ancien système de commandes : reçoit maintenant tous les champs nécessaires
 *   (from, sender, participants, groupMeta, isSudo, botIsAdmin, senderIsAdmin…)
 */

const path = require('path')
const fs   = require('fs')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { loadConfig, saveConfig } = require('../lib/config')
const { loadDB, saveDB }         = require('../lib/db')
const { getCommand }             = require('../lib/loader')
const { getGroup }               = require('../lib/database')
const { normalizeJid, isAdmin }  = require('../lib/utils')

// ─── Regex liens ─────────────────────────────────────────────────────────────
const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com)[^\s]*/i

// ─── Chargement nouvelles commandes (commands/) ───────────────────────────────
let _newCommands = null
function getNewCommands() {
  if (_newCommands) return _newCommands
  _newCommands = {}
  const cmdDir = path.join(__dirname, '../commands')
  if (!fs.existsSync(cmdDir)) return _newCommands

  function readDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        readDir(full)
      } else if (entry.name.endsWith('.js')) {
        try {
          const mod = require(full)
          // Nouveau format : { cmdName: { handler, desc, ... } }
          for (const [name, cmd] of Object.entries(mod)) {
            if (cmd && typeof cmd.handler === 'function') {
              _newCommands[name] = cmd
              if (Array.isArray(cmd.aliases)) {
                for (const alias of cmd.aliases) {
                  _newCommands[alias] = { ...cmd, _alias: name }
                }
              }
            }
          }
        } catch (e) {
          console.error(`[NewCmds] Erreur ${full}:`, e.message)
        }
      }
    }
  }
  readDir(cmdDir)
  console.log(`[NewCmds] ${Object.keys(_newCommands).length} nouvelles commandes chargées`)
  return _newCommands
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function unwrapMessage(message) {
  // Déballer les couches d'encapsulation Baileys (ephemeral, viewOnce, etc.)
  if (!message) return message
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  )
}

function extractText(msg) {
  const raw = msg.message
  if (!raw) return ''
  const m = unwrapMessage(raw)
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  )
}

function extractQuoted(msg) {
  // Chercher contextInfo dans TOUS les types de messages possibles
  const m = msg.message || {}
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo        ||
    m.videoMessage?.contextInfo        ||
    m.audioMessage?.contextInfo        ||
    m.documentMessage?.contextInfo     ||
    m.stickerMessage?.contextInfo      ||
    m.buttonsResponseMessage?.contextInfo ||
    m.listResponseMessage?.contextInfo

  if (!ctx?.quotedMessage) return null

  // Déballer les couches du message quoté aussi (viewonce dans ephemeral, etc.)
  const unwrapped = unwrapMessage(ctx.quotedMessage) || ctx.quotedMessage

  return {
    key: {
      remoteJid:   msg.key.remoteJid,
      id:          ctx.stanzaId,
      participant: ctx.participant || msg.key.participant,
      fromMe:      false
    },
    message:         ctx.quotedMessage,  // original pour Baileys download
    unwrappedMessage: unwrapped           // déballer pour viewonce detection
  }
}

// ─── Déterminer si le sender est owner ───────────────────────────────────────
// FIX : supporte @s.whatsapp.net ET @lid (nouveaux groupes WhatsApp)
function isOwnerFn(sender, config, sock) {
  const normSender = normalizeJid(sender)
  const senderRaw  = normSender.split('@')[0]
  const senderNum  = senderRaw.replace(/[^0-9]/g, '')

  // 0. OWNER_NUMBER d'environnement (gravé, immuable, prioritaire)
  const envOwner = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '')
  if (envOwner && senderNum && senderNum === envOwner) return true

  // 1. Comparaison directe JID → compte connecté (@s.whatsapp.net)
  if (sock?.user?.id) {
    const botJid = normalizeJid(sock.user.id)
    if (normSender === botJid) return true
    const botNum = botJid.split('@')[0].replace(/[^0-9]/g, '')
    if (senderNum && senderNum === botNum) return true
  }

  // 2. Comparaison via @lid du bot (nouveaux groupes WhatsApp)
  // Dans les groupes récents, sender = @lid dont les chiffres ≠ numéro de tél.
  // On compare le JID @lid entier (normalisé).
  const botLid = sock?.authState?.creds?.me?.lid || sock?.user?.lid
  if (botLid) {
    const botLidNorm = botLid.split(':')[0]
    if (normSender === botLidNorm + '@lid') return true
    if (senderRaw === botLidNorm.split('@')[0]) return true
  }

  // 3. ownerNumber dans config.json (numéro de téléphone)
  const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '')
  if (ownerNum && senderNum && senderNum === ownerNum) return true

  // 4. Liste sudo
  return isSudoFn(sender, config, sock)
}

function isSudoFn(sender, config, sock) {
  const num   = normalizeJid(sender).split('@')[0].replace(/[^0-9]/g, '')
  // Config sudo list
  const sudos = config.sudo || []
  if (sudos.some(s => s.split('@')[0].replace(/[^0-9]/g, '') === num)) return true
  // Le numéro connecté est toujours considéré sudo
  if (sock?.user?.id) {
    const botNum = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
    if (num && num === botNum) return true
  }
  return false
}

// ─── Cache groupMetadata (évite rate-limit et faux négatifs admin) ───────────
const _groupMetaCache = new Map() // jid → { meta, ts }
const GROUP_CACHE_TTL = 45_000    // 45 secondes

async function getCachedGroupMeta(sock, jid) {
  const now = Date.now()
  const cached = _groupMetaCache.get(jid)
  if (cached && (now - cached.ts) < GROUP_CACHE_TTL) return cached.meta
  try {
    const meta = await sock.groupMetadata(jid)
    _groupMetaCache.set(jid, { meta, ts: now })
    return meta
  } catch (e) {
    // Retourner les données périmées si disponibles plutôt que planter
    if (cached) return cached.meta
    throw e
  }
}

// Invalider le cache quand un membre rejoint/quitte (appelé depuis index.js via sock.ev)
function invalidateGroupCache(jid) { _groupMetaCache.delete(jid) }

// ─── isAdminFlex : détection admin compatible @s.whatsapp.net ET @lid ──────────
// Problème : dans les nouveaux groupes WhatsApp, les participants sont en @lid
// (ex: 110574453129452@lid) dont les chiffres ≠ numéro de téléphone.
// isAdmin() de utils.js compare par numéro → échoue sur @lid.
// Solution : on récupère aussi le @lid du bot via sock.authState.creds.me.lid
// et on compare directement les JID normalisés en plus de la comparaison numéro.
function isAdminFlex(participants, jid, sock) {
  if (!jid || !participants?.length) return false

  // Construire l'ensemble de tous les identifiants possibles du compte
  // (numéro de tél @s.whatsapp.net ET @lid depuis sock.user.lid / authState)
  const candidates = new Set()

  // 1. JID passé en paramètre (ex: sock.user.id = 237690768603:1@s.whatsapp.net)
  const rawNum = jid.split(':')[0].split('@')[0]
  candidates.add(rawNum + '@s.whatsapp.net')

  // 2. @lid depuis sock.user.lid — PRIORITÉ : c'est le vrai identifiant groupe
  //    Format: "110574453129452:1@lid" → on normalise en "110574453129452@lid"
  try {
    const lid = sock?.user?.lid || sock?.authState?.creds?.me?.lid
    if (lid) {
      const lidNum = lid.split(':')[0].split('@')[0]
      candidates.add(lidNum + '@lid')
      candidates.add(lidNum + ':0@lid')
      candidates.add(lidNum + ':1@lid')
    }
  } catch {}

  const found = participants.find(p => {
    // Normaliser l'id participant (retirer suffix :X)
    const pBase = p.id.split(':')[0].split('@')[0]
    const pDomain = p.id.split('@')[1] || ''

    for (const c of candidates) {
      const cBase = c.split(':')[0].split('@')[0]
      const cDomain = c.split('@')[1] || ''
      // Même base + même domaine (@lid ou @s.whatsapp.net)
      if (cBase === pBase && cDomain === pDomain) return true
      // Même base peu importe le domaine (cas mixte)
      if (cBase === pBase) return true
    }
    return false
  })

  return !!(found && (found.admin === 'admin' || found.admin === 'superadmin'))
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
const handleMessage = async (sock, msg) => {
  if (!msg.message) return

  const remoteJid = msg.key.remoteJid
  const isGroup   = remoteJid.endsWith('@g.us')

  // FIX self-DM : en DM fromMe=true, remoteJid = @lid opaque du destinataire,
  // pas le numéro du bot. Le vrai sender = sock.user.id (le compte connecté).
  const sender = (() => {
    if (!isGroup && msg.key.fromMe) return normalizeJid(sock.user?.id || remoteJid)
    return normalizeJid(msg.key.participant || remoteJid)
  })()
  const text      = extractText(msg)
  const quoted    = extractQuoted(msg)

  const config = loadConfig()
  // FIX : si prefix = 'null' (string) ou vide → pas de préfixe requis
  const rawPrefix = config.prefix ?? process.env.PREFIX ?? '.'
  const prefix = (!rawPrefix || rawPrefix === 'null' || rawPrefix === 'none') ? '' : rawPrefix

  // FIX : enregistrer ownerNumber depuis sock.user si vide
  if (!config.ownerNumber && sock?.user?.id) {
    config.ownerNumber = sock.user.id.split(':')[0].split('@')[0]
    saveConfig(config).catch(() => {})
  }

  const ownerCheck  = isOwnerFn(sender, config, sock)
  const sudoCheck   = isSudoFn(sender, config) || ownerCheck

  // ── Métadonnées groupe ────────────────────────────────────────────────────
  let groupMeta    = null
  let participants = []
  let senderIsAdmin = false
  let botIsAdmin    = false

  if (isGroup) {
    try {
      groupMeta    = await getCachedGroupMeta(sock, remoteJid)
      participants = groupMeta.participants || []
      senderIsAdmin = isAdminFlex(participants, sender, sock)
      // FIX : fallback creds.me.id si sock.user.id absent
      const _botId = sock.user?.id || sock.authState?.creds?.me?.id || ''
      botIsAdmin    = isAdminFlex(participants, _botId, sock)
      const _lid = sock?.user?.lid || sock?.authState?.creds?.me?.lid || 'n/a'
      console.log(`[ADM] botIsAdmin=${botIsAdmin} | botId=${sock.user?.id} | botLid=${_lid}`)
      if (!botIsAdmin) {
        // Debug : afficher les IDs participants pour diagnostic
        const admParts = participants.filter(p => p.admin).map(p => `${p.id}[${p.admin}]`)
        console.log(`[ADM] admins dans groupe:`, admParts)
      }
    } catch (e) {
      console.error('[ADM] Erreur groupMetadata:', e.message)
    }
  }

  // ── ANTILINK ─────────────────────────────────────────────────────────────
  if (isGroup && text && LINK_REGEX.test(text)) {
    try {
      const groupData = await getGroup(remoteJid)
      if (groupData?.antilink && !senderIsAdmin && !ownerCheck) {
        await sock.sendMessage(remoteJid, { delete: msg.key })
        const action = groupData.antilink_action || 'warn'
        if (action === 'kick') {
          // Kick direct
          const sNum = sender.split(':')[0].split('@')[0]
          const kickP = participants.find(p => p.id.split(':')[0].split('@')[0] === sNum)
          const kickJid = kickP?.id || sender
          await sock.sendMessage(remoteJid, {
            text: `🚫 @${sender.split('@')[0]} a été expulsé(e) pour avoir envoyé un lien.`,
            mentions: [sender]
          })
          await sock.groupParticipantsUpdate(remoteJid, [kickJid], 'remove').catch(() => {})
        } else {
          // Warn
          const { addWarn } = require('./lib/database') // relative à message.js
          const count = await addWarn(sender, remoteJid, 'Envoi de lien').catch(() => 1)
          const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3')
          if (count >= WARN_LIMIT) {
            const sNum = sender.split(':')[0].split('@')[0]
            const kickP = participants.find(p => p.id.split(':')[0].split('@')[0] === sNum)
            const kickJid = kickP?.id || sender
            await sock.sendMessage(remoteJid, {
              text: `🚫 @${sender.split('@')[0]} expulsé(e) — ${WARN_LIMIT} avertissements atteints (liens).`,
              mentions: [sender]
            })
            await sock.groupParticipantsUpdate(remoteJid, [kickJid], 'remove').catch(() => {})
          } else {
            await sock.sendMessage(remoteJid, {
              text: `⛔ @${sender.split('@')[0]} — lien interdit ! Avertissement *${count}/${WARN_LIMIT}*.`,
              mentions: [sender]
            })
          }
        }
        return
      }
    } catch {}
  }

  // ── ANTISPAM ─────────────────────────────────────────────────────────────
  // Mécanisme simple basé sur la fréquence des messages par utilisateur
  if (isGroup && !senderIsAdmin && !ownerCheck) {
    try {
      const groupData = await getGroup(remoteJid)
      if (groupData?.antispam) {
        const db = loadDB()
        if (!db.spamTrack) db.spamTrack = {}
        if (!db.spamTrack[remoteJid]) db.spamTrack[remoteJid] = {}
        const now = Date.now()
        const userTrack = db.spamTrack[remoteJid][sender] || { count: 0, first: now }

        // Reset si plus de 5 secondes depuis le premier message
        if (now - userTrack.first > 5000) {
          userTrack.count = 1
          userTrack.first = now
        } else {
          userTrack.count++
        }

        db.spamTrack[remoteJid][sender] = userTrack
        saveDB(db)

        // 5 messages en 5 secondes = spam
        if (userTrack.count >= 5) {
          await sock.sendMessage(remoteJid, { delete: msg.key })
          const spamAction = groupData.antispam_action || 'warn'
          const sNum = sender.split(':')[0].split('@')[0]
          const kickP = participants.find(p => p.id.split(':')[0].split('@')[0] === sNum)
          const kickJid = kickP?.id || sender

          if (spamAction === 'kick' || userTrack.count >= 10) {
            await sock.sendMessage(remoteJid, {
              text: `🚫 @${sender.split('@')[0]} expulsé(e) pour spam.`,
              mentions: [sender]
            })
            await sock.groupParticipantsUpdate(remoteJid, [kickJid], 'remove').catch(() => {})
            db.spamTrack[remoteJid][sender] = { count: 0, first: now }
            saveDB(db)
          } else if (userTrack.count === 5) {
            // Warn
            const { addWarn } = require('../lib/database')
            const wCount = await addWarn(sender, remoteJid, 'Spam').catch(() => 1)
            const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3')
            await sock.sendMessage(remoteJid, {
              text: `⚠️ @${sender.split('@')[0]} — spam détecté ! Avertissement *${wCount}/${WARN_LIMIT}*.`,
              mentions: [sender]
            })
            if (wCount >= WARN_LIMIT) {
              await sock.groupParticipantsUpdate(remoteJid, [kickJid], 'remove').catch(() => {})
              db.spamTrack[remoteJid][sender] = { count: 0, first: now }
              saveDB(db)
            }
          }
          return
        }
      }
    } catch {}
  }

  // ── Protections avancees: antitag / antifake ─────────────────────────────
  if (isGroup && !senderIsAdmin && !ownerCheck) {
    try {
      const groupData = await getGroup(remoteJid)
      const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (groupData?.antitag && mentions.length > 5) {
        await sock.sendMessage(remoteJid, { delete: msg.key }).catch(() => {})
        await sock.sendMessage(remoteJid, {
          text: `Mass-mention interdit (max 5). @${sender.split('@')[0]}`,
          mentions: [sender]
        })
        return
      }

      if (groupData?.antifake && groupData?.antifake_prefixes) {
        const prefixes = String(groupData.antifake_prefixes).split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean)
        const senderNum = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        if (senderNum && prefixes.length && !prefixes.some(pre => senderNum.startsWith(pre))) {
          await sock.sendMessage(remoteJid, { delete: msg.key }).catch(() => {})
          await sock.sendMessage(remoteJid, { text: `Numero non autorise par antifake: @${senderNum}`, mentions: [sender] })
          if (botIsAdmin) await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove').catch(() => {})
          return
        }
      }
    } catch {}
  }

  // ── Activite et AFK ──────────────────────────────────────────────────────
  try {
    const db = loadDB()
    const today = new Date().toISOString().slice(0, 10)
    const num = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
    if (num) {
      db.activity ||= {}
      db.activity[today] ||= {}
      db.activity[today][remoteJid] ||= {}
      db.activity[today][remoteJid][num] = (db.activity[today][remoteJid][num] || 0) + 1
      const keep = Object.keys(db.activity).sort().slice(-7)
      for (const k of Object.keys(db.activity)) if (!keep.includes(k)) delete db.activity[k]
    }

    if (isGroup) {
      const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (db.afk && mentions.length) {
        for (const m of mentions) {
          const mNum = m.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
          const afkData = db.afk[mNum]
          if (afkData) {
            const since = Math.floor((Date.now() - afkData.since) / 60000)
            await sock.sendMessage(remoteJid, {
              text: `@${mNum} est AFK depuis ${since} min\n${afkData.reason}`,
              mentions: [m]
            }, { quoted: msg })
          }
        }
      }
      const sNum = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
      if (db.afk?.[sNum] && !text.toLowerCase().startsWith(`${prefix}afk`)) {
        delete db.afk[sNum]
        await sock.sendMessage(remoteJid, { text: `@${sNum} est de retour.`, mentions: [sender] })
      }
    }
    saveDB(db)
  } catch {}

  // ── Mode privé du bot : seuls owner + sudo peuvent exécuter des commandes ─
  if (config.botMode === 'private' && !ownerCheck && !sudoCheck) return

  // ── Sticker → commande associée ───────────────────────────────────────────
  const stickerMsg = msg.message?.stickerMessage
  if (stickerMsg) {
    const db   = loadDB()
    const raw  = stickerMsg.fileSha256 || stickerMsg.fileEncSha256
    const hash = raw ? Buffer.from(raw).toString('hex') : null

    if (hash && db.stickerCmds?.[hash]) {
      const cmdName = db.stickerCmds[hash]
      // Chercher dans les deux systèmes
      const newCmd = getNewCommands()[cmdName]
      if (newCmd) {
        await runNewCommand(sock, msg, newCmd, cmdName, [], {
          sender, isGroup, config, quoted, prefix,
          ownerCheck, sudoCheck, groupMeta, participants,
          senderIsAdmin, botIsAdmin
        })
        return
      }
      // Fallback : ancien système
      const oldSCmd = getCommand(cmdName)
      if (oldSCmd) {
        try {
          await oldSCmd.execute({
            sock, msg, from: msg.key.remoteJid, rawFrom: msg.key.remoteJid,
            sender, args: [], prefix, config, isGroup,
            groupMeta, participants, senderIsAdmin, botIsAdmin,
            isSudo: sudoCheck, isOwner: ownerCheck,
            botId: normalizeJid(sock.user?.id || '')
          })
        } catch (e) { console.error('[StickerCmd]', e.message) }
        return
      }
    }
  }

  // ── Vérifier prefix ───────────────────────────────────────────────────────
  // FIX : si prefix vide, toute commande sans prefix est valide
  if (prefix && !text.startsWith(prefix)) return

  const body = prefix ? text.slice(prefix.length).trim() : text.trim()
  if (!body) return

  const [cmdRaw, ...args] = body.split(/\s+/)
  const cmdName = cmdRaw.toLowerCase()

  // ── 1. Nouveau système (commands/) ───────────────────────────────────────
  const newCmd = getNewCommands()[cmdName]
  if (newCmd) {
    await runNewCommand(sock, msg, newCmd, cmdName, args, {
      sender, isGroup, config, quoted, prefix,
      ownerCheck, sudoCheck, groupMeta, participants,
      senderIsAdmin, botIsAdmin
    })
    return
  }

  // ── 2. Ancien système (loader.js) ────────────────────────────────────────
  const oldCmd = getCommand(cmdName)
  if (oldCmd) {
    // Vérification groupe pour l'ancien système
    if (oldCmd.group && !isGroup) {
      return sock.sendMessage(remoteJid, {
        text: '👥 Cette commande ne fonctionne qu\'en groupe.'
      }, { quoted: msg })
    }
    if (oldCmd.admin && !senderIsAdmin && !sudoCheck) {
      return sock.sendMessage(remoteJid, {
        text: '❌ Tu dois être admin pour utiliser cette commande.'
      }, { quoted: msg })
    }
    if (oldCmd.botAdmin && !botIsAdmin) {
      return sock.sendMessage(remoteJid, {
        text: '❌ Le bot doit être admin pour cette commande.'
      }, { quoted: msg })
    }
    if (oldCmd.sudo && !sudoCheck) {
      return sock.sendMessage(remoteJid, {
        text: '🛡️ Cette commande est réservée aux admins du bot.'
      }, { quoted: msg })
    }

    try {
      // FIX : passer tous les champs dont les commandes ont besoin
      await oldCmd.execute({
        sock,
        msg,
        from:         remoteJid,
        rawFrom:      remoteJid,
        sender,
        args,
        prefix,
        config,
        isGroup,
        groupMeta,
        participants,
        senderIsAdmin,
        botIsAdmin,
        isSudo:       sudoCheck,
        isOwner:      ownerCheck,
        botId:        normalizeJid(sock.user?.id || '')
      })
    } catch (e) {
      console.error(`[OldCmd] Erreur ${cmdName}:`, e.message)
      await sock.sendMessage(remoteJid, {
        text: `❌ Erreur commande *${prefix}${cmdName}*:\n${e.message}`
      }, { quoted: msg })
    }
  }
}

// ─── EXÉCUTER UNE NOUVELLE COMMANDE ──────────────────────────────────────────
async function runNewCommand(sock, msg, cmd, cmdName, args, ctx) {
  const {
    sender, isGroup, config, quoted, prefix,
    ownerCheck, sudoCheck, groupMeta, participants,
    senderIsAdmin, botIsAdmin
  } = ctx
  const remoteJid = msg.key.remoteJid

  const reply = (text) =>
    sock.sendMessage(remoteJid, { text }, { quoted: msg })

  // Permissions
  if (cmd.ownerOnly && !ownerCheck) {
    return reply('👑 Cette commande est réservée au propriétaire du bot.')
  }
  if (cmd.sudoOnly && !sudoCheck) {
    return reply('🛡️ Cette commande est réservée aux admins du bot.')
  }
  if (cmd.groupOnly && !isGroup) {
    return reply('👥 Cette commande ne fonctionne qu\'en groupe.')
  }
  if ((cmd.admin || cmd.adminOnly) && isGroup && !senderIsAdmin && !sudoCheck) {
    return reply('Tu dois etre admin pour utiliser cette commande.')
  }
  if ((cmd.botAdmin || cmd.botAdminOnly) && isGroup && !botIsAdmin) {
    return reply('Le bot doit etre admin pour cette commande.')
  }
  if (cmd.privateOnly && isGroup) {
    return reply('🔒 Cette commande ne fonctionne qu\'en message privé.')
  }

  const db = loadDB()
  const dbProxy = new Proxy(db, {
    set(target, key, value) {
      target[key] = value
      saveDB(target)
      return true
    }
  })

  try {
    await cmd.handler(sock, msg, {
      args,
      reply,
      sender,
      isOwner:      ownerCheck,
      isSudo:       sudoCheck,
      isGroup,
      from:         remoteJid,
      quoted,
      config,
      db:           dbProxy,
      commands:     getNewCommands(),
      prefix,
      groupMeta,
      participants,
      senderIsAdmin,
      botIsAdmin,
      // FIX : downloadMedia helper qui utilise la bonne API Baileys
      downloadMedia: (targetMsg) => downloadMediaMessage(
        targetMsg,
        'buffer',
        {},
        { logger: { info: () => {}, error: () => {} } }
      ),
      saveConfig: async (cfg) => {
        // Sauvegarder sur disque
        await saveConfig(cfg)
        // Mettre à jour la copie locale pour que la réponse voit déjà le nouveau config
        Object.assign(config, cfg)
        // Forcer le rechargement du fichier (vide le cache require)
        try {
          const { CONFIG_PATH } = require('../lib/config')
          // Pas de require() cache pour JSON — loadConfig() lit toujours le disque
        } catch {}
      }
    })
  } catch (e) {
    console.error(`[NewCmd] Erreur ${cmdName}:`, e)
    reply(`❌ Erreur commande *${prefix}${cmdName}*:\n${e.message}`)
  }

  saveDB(db)
}

module.exports = { handleMessage, invalidateGroupCache, getNewCommands }
