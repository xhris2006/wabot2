/**
 * commands/owner/owner.js — VERSION CORRIGÉE
 *
 * FIXES :
 * - startTime : singleton global partagé avec menu.js (process._botStartTime)
 * - setprefix : marque config._prefixSetManually = true pour survivre aux restarts
 * - ownerNumber : auto-détecté depuis sock.user.id si vide
 */

const { exec } = require('child_process')

// FIX : utiliser process._botStartTime pour partager le startTime avec menu.js
// Initialisé UNE SEULE FOIS au premier require
if (!process._botStartTime) process._botStartTime = Date.now()

module.exports = {

  // ─── CHANGER LE PRÉFIXE ──────────────────────────────────────────────────
  setprefix: {
    desc: 'Changer le préfixe du bot',
    category: 'owner',
    usage: '.setprefix <nouveau_prefix>',
    ownerOnly: true,
    async handler(sock, msg, { args, reply, config, saveConfig }) {
      try {
        const newPrefix = args[0]
        if (!newPrefix) return reply('❌ Usage: .setprefix <nouveau_prefix>\nEx: .setprefix !\nEx: .setprefix null (aucun préfixe)')

        // FIX : 'null' ou 'none' = désactiver le préfixe
        const resolvedPrefix = (newPrefix.toLowerCase() === 'null' || newPrefix.toLowerCase() === 'none')
          ? ''
          : newPrefix
        if (resolvedPrefix.length > 3) return reply('❌ Max 3 caractères.')

        const oldPrefix = config.prefix || '.'
        config.prefix = resolvedPrefix
        // FIX : marquer que le prefix a été changé manuellement
        // pour qu'index.js ne l'écrase pas au prochain démarrage
        config._prefixSetManually = true
        await saveConfig(config)
        const displayNew = resolvedPrefix || '(aucun)'
        const menuCmd = resolvedPrefix ? `${resolvedPrefix}menu` : 'menu'
        reply(`✅ Préfixe changé!\n\n📌 Ancien: *${oldPrefix || '(aucun)'}*\n📌 Nouveau: *${displayNew}*\n\nUtilise *${menuCmd}* pour voir les commandes.`)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── AJOUTER UN SUDO ─────────────────────────────────────────────────────
  addsudo: {
    desc: 'Ajouter un numéro sudo (admin du bot)',
    category: 'owner',
    usage: '.addsudo @mention | .addsudo 237XXXXXXX',
    ownerOnly: true,
    async handler(sock, msg, { args, reply, quoted, config, saveConfig }) {
      try {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        let jid = mentioned
        if (!jid && quoted) jid = quoted.key.participant || quoted.key.remoteJid
        if (!jid && args[0]) jid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        if (!jid) return reply('❌ Mentionne ou donne un numéro.')

        const number = jid.split('@')[0]
        if (!config.sudo) config.sudo = []
        if (config.sudo.some(s => s.split('@')[0] === number)) {
          return reply(`⚠️ +${number} est déjà sudo.`)
        }
        config.sudo.push(jid)
        await saveConfig(config)
        reply(`✅ +${number} ajouté comme *sudo*!`)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── RETIRER UN SUDO ─────────────────────────────────────────────────────
  delsudo: {
    desc: 'Retirer un numéro sudo',
    category: 'owner',
    usage: '.delsudo @mention | .delsudo 237XXXXXXX',
    ownerOnly: true,
    async handler(sock, msg, { args, reply, quoted, config, saveConfig }) {
      try {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        let jid = mentioned
        if (!jid && quoted) jid = quoted.key.participant || quoted.key.remoteJid
        if (!jid && args[0]) jid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        if (!jid) return reply('❌ Mentionne ou donne un numéro.')

        const number = jid.split('@')[0]
        if (!config.sudo?.some(s => s.split('@')[0] === number)) {
          return reply(`❌ +${number} n'est pas sudo.`)
        }
        config.sudo = config.sudo.filter(s => s.split('@')[0] !== number)
        await saveConfig(config)
        reply(`✅ +${number} retiré des *sudo*.`)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── LISTE DES SUDOS ─────────────────────────────────────────────────────
  sudolist: {
    desc: 'Voir la liste des numéros sudo',
    category: 'owner',
    usage: '.sudolist',
    ownerOnly: true,
    async handler(sock, msg, { reply, config }) {
      try {
        const sudos = config.sudo || []
        if (!sudos.length) return reply('ℹ️ Aucun numéro sudo configuré.')
        let txt = `╔══════════════════╗\n║  🛡️  SUDO LIST   ║\n╚══════════════════╝\n\n`
        sudos.forEach((jid, i) => {
          txt += `${i + 1}. +${jid.split('@')[0]}\n`
        })
        reply(txt)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── REDÉMARRER ──────────────────────────────────────────────────────────
  restart: {
    desc: 'Redémarrer le bot (Docker le relancera automatiquement)',
    category: 'owner',
    usage: '.restart',
    ownerOnly: true,
    async handler(sock, msg, { reply }) {
      try {
        await reply('♻️ *Redémarrage du bot...*\n_Reviens dans 30 secondes._')
        // ExitCode 2 → Docker restart=on-failure relancera le container
        setTimeout(() => process.exit(2), 2000)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── UPTIME ──────────────────────────────────────────────────────────────
  // FIX : utilise process._botStartTime (partagé avec menu.js)
  uptime: {
    desc: 'Voir depuis combien de temps le bot est en ligne',
    category: 'info',
    usage: '.uptime',
    async handler(sock, msg, { reply }) {
      try {
        const up  = Date.now() - process._botStartTime
        const sec = Math.floor(up / 1000)
        const min = Math.floor(sec / 60)
        const hr  = Math.floor(min / 60)
        const day = Math.floor(hr / 24)

        const filled = Math.min(Math.floor((up / (24 * 3600000)) * 10), 10)
        const bar    = '▰'.repeat(filled) + '▱'.repeat(10 - filled)

        let txt = `╔══════════════════╗\n`
        txt += `║  ⏱️   UPTIME      ║\n`
        txt += `╚══════════════════╝\n\n`
        txt += `📅 *${day}j ${hr % 24}h ${min % 60}m ${sec % 60}s*\n\n`
        txt += `${bar}\n\n`
        txt += `🟢 Bot opérationnel`
        reply(txt)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── ALIVE ───────────────────────────────────────────────────────────────
  // FIX : utilise process._botStartTime
  alive: {
    desc: 'Vérifier que le bot est actif',
    category: 'info',
    usage: '.alive',
    async handler(sock, msg, { reply, config }) {
      try {
        const up  = Date.now() - process._botStartTime
        const sec = Math.floor(up / 1000)
        const min = Math.floor(sec / 60)
        const hr  = Math.floor(min / 60)
        const day = Math.floor(hr / 24)

        const mem   = process.memoryUsage()
        const memMB = (mem.heapUsed / 1024 / 1024).toFixed(1)

        // FIX : afficher le vrai numéro du compte connecté
        const botNum = sock.user?.id
          ? sock.user.id.split(':')[0].split('@')[0]
          : config.ownerNumber || '?'

        let txt = `╔══════════════════════╗\n`
        txt += `║  ✅  XHRIS-MD ALIVE! ║\n`
        txt += `╚══════════════════════╝\n\n`
        txt += `🤖 *Nom:* ${config.botName || 'XHRIS-MD'}\n`
        txt += `📱 *Numéro:* +${botNum}\n`
        txt += `⚡ *Préfixe:* ${config.prefix || '.'}\n`
        txt += `🟢 *Statut:* En ligne\n`
        txt += `⏱️ *Uptime:* ${day}j ${hr % 24}h ${min % 60}m ${sec % 60}s\n`
        txt += `💾 *RAM:* ${memMB} MB\n`
        txt += `📦 *Node:* ${process.version}\n\n`
        txt += `🌐 xhrishost.site\n`
        txt += `📢 https://whatsapp.com/channel/0029Vark1I1AYlUR1G8YMX31`
        reply(txt)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── AUTOSTATUS ──────────────────────────────────────────────────────────
  autostatus: {
    desc: 'Activer/désactiver la vue automatique des statuts',
    category: 'owner',
    usage: '.autostatus on/off',
    ownerOnly: true,
    async handler(sock, msg, { args, reply, config, saveConfig }) {
      try {
        const toggle = args[0]?.toLowerCase()
        if (!toggle || !['on', 'off'].includes(toggle)) {
          const current = config.autoReadStatus ? '✅ Activée' : '❌ Désactivée'
          return reply(`👁️ *Vue auto des statuts*\n\nStatut actuel: ${current}\n\nUsage: .autostatus on/off`)
        }
        config.autoReadStatus = toggle === 'on'
        await saveConfig(config)
        reply(toggle === 'on'
          ? '✅ Vue automatique des statuts *activée*!'
          : '❌ Vue automatique des statuts *désactivée*.')
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── ADDSCMD (sticker → commande) ────────────────────────────────────────
  addscmd: {
    desc: 'Associer une commande à un sticker',
    category: 'owner',
    usage: '.addscmd <commande> (répondre à un sticker)',
    ownerOnly: true,
    async handler(sock, msg, { args, reply, quoted, db }) {
      try {
        if (!quoted?.message?.stickerMessage) return reply('❌ Réponds à un sticker.')
        const cmd = args[0]?.toLowerCase()
        if (!cmd) return reply('❌ Usage: .addscmd <commande>')

        const raw  = quoted.message.stickerMessage.fileSha256 ||
                     quoted.message.stickerMessage.fileEncSha256
        const hash = raw ? Buffer.from(raw).toString('hex') : Date.now().toString()

        if (!db.stickerCmds) db.stickerCmds = {}
        db.stickerCmds[hash] = cmd
        reply(`✅ Sticker associé à la commande *${cmd}*!`)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── DELSCMD ─────────────────────────────────────────────────────────────
  delscmd: {
    desc: 'Retirer la commande associée à un sticker',
    category: 'owner',
    usage: '.delscmd (répondre au sticker)',
    ownerOnly: true,
    async handler(sock, msg, { reply, quoted, db }) {
      try {
        if (!quoted?.message?.stickerMessage) return reply('❌ Réponds au sticker.')
        const raw  = quoted.message.stickerMessage.fileSha256 ||
                     quoted.message.stickerMessage.fileEncSha256
        const hash = raw ? Buffer.from(raw).toString('hex') : null
        if (!hash || !db.stickerCmds?.[hash]) return reply('❌ Aucune commande associée.')
        const cmd = db.stickerCmds[hash]
        delete db.stickerCmds[hash]
        reply(`✅ Commande *${cmd}* retirée de ce sticker.`)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── MODE PRIVÉ DU BOT (bot-wide) ────────────────────────────────────────
  privatemode: {
    desc: 'Activer le mode privé — seuls owner + sudo peuvent utiliser le bot',
    aliases: ['private'],
    category: 'owner',
    usage: '.private',
    ownerOnly: true,
    async handler(sock, msg, { reply, config, saveConfig }) {
      try {
        config.botMode = 'private'
        await saveConfig(config)
        reply('🔒 Mode *privé* activé — seuls owner et sudo peuvent utiliser le bot.')
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── MODE PUBLIC DU BOT (bot-wide) ───────────────────────────────────────
  publicmode: {
    desc: 'Désactiver le mode privé — tout le monde peut utiliser le bot',
    aliases: ['public'],
    category: 'owner',
    usage: '.public',
    ownerOnly: true,
    async handler(sock, msg, { reply, config, saveConfig }) {
      try {
        config.botMode = 'public'
        await saveConfig(config)
        reply('🌐 Mode *public* activé — tout le monde peut utiliser le bot.')
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── UPDATE / REDÉPLOIEMENT ───────────────────────────────────────────────
  update: {
    desc: 'Redéployer le bot avec les dernières mises à jour du repo',
    aliases: ['redeploy', 'rebuild'],
    category: 'owner',
    usage: '.update',
    ownerOnly: true,
    async handler(sock, msg, { reply }) {
      const apiKey = process.env.XHRIS_API_KEY
      const apiUrl = process.env.XHRIS_API_URL || 'https://api.xhrishost.site/api'
      const botId  = process.env.BOT_ID

      await reply('🔄 *Redéploiement en cours...*\n_Le bot va redémarrer dans quelques secondes._')

      // Méthode 1 : endpoint XHRIS Host
      if (apiKey && botId) {
        try {
          const axios = require('axios')
          const res = await axios.post(`${apiUrl}/bots/${botId}/redeploy`, {}, {
            headers: { 'x-api-key': apiKey },
            timeout: 15000
          })
          if (res.data?.success) {
            await reply('✅ *Redéploiement initié via XHRIS Host*\nLe bot revient dans 1-2 min.')
            return
          }
        } catch (e) {
          console.log('[update] endpoint redeploy KO:', e.message)
        }
      }

      // Méthode 2 : exit process (Docker/PM2 redémarre + re-clone)
      await reply('⏳ Redémarrage forcé dans 3s...\n_Le repo sera re-cloné automatiquement._')
      setTimeout(() => process.exit(2), 3000)
    }
  },

  // ─── SETLANG ─────────────────────────────────────────────────────────────
  setlang: {
    desc: 'Changer la langue du bot (fr/en)',
    aliases: ['lang', 'language'],
    category: 'owner',
    ownerOnly: true,
    usage: '.setlang fr|en',
    async handler(sock, msg, { args, reply, config, saveConfig }) {
      const lang = args[0]?.toLowerCase()
      if (!['fr', 'en'].includes(lang)) {
        return reply('❌ Available: fr, en\n❌ Disponibles: fr, en')
      }
      config.lang = lang
      await saveConfig(config)
      try {
        const { setLang, t } = require('../../lib/i18n')
        setLang(lang)
        reply(t('lang_changed', { lang: lang.toUpperCase() }))
      } catch {
        reply(`✅ Langue changée en *${lang.toUpperCase()}*.`)
      }
    }
  },

  // ─── SCMDLIST ─────────────────────────────────────────────────────────────
  scmdlist: {
    desc: 'Voir tous les stickers avec commandes',
    category: 'owner',
    usage: '.scmdlist',
    ownerOnly: true,
    async handler(sock, msg, { reply, db }) {
      try {
        const cmds    = db.stickerCmds || {}
        const entries = Object.entries(cmds)
        if (!entries.length) return reply('ℹ️ Aucun sticker avec commande.')
        let txt = `╔══════════════════╗\n║  🎭 STICKER CMDS ║\n╚══════════════════╝\n\n`
        entries.forEach(([hash, cmd], i) => {
          txt += `${i + 1}. *${cmd}* → ${hash.slice(0, 12)}...\n`
        })
        reply(txt)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  }
}
