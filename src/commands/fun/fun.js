const { reply, downloadMedia, react } = require('../../lib/utils')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { setAfk, getAfk, removeAfk } = require('../../lib/database')
const axios = require('axios')
const fs = require('fs-extra')

module.exports = [

  // ─── PING ────────────────────────────────────────────────────────────────
  // FIX : le timing était toujours 0ms car on mesurait avant d'envoyer.
  // On mesure maintenant APRÈS l'envoi du message pour avoir la vraie latence.
  {
    name: 'ping',
    category: 'fun',
    desc: 'Vérifier si le bot répond',
    execute: async ({ sock, msg }) => {
      const start = Date.now()
      // D'abord on envoie un premier message "test"
      const sent = await reply(sock, msg, '🏓 Calcul de la latence...')
      const latency = Date.now() - start
      // Ensuite on édite / répond avec la vraie latence mesurée
      await reply(sock, msg, `🏓 *Pong!*\n⚡ Latence: *${latency}ms*\n✅ Bot opérationnel !`)
    }
  },

  // ─── INFO ────────────────────────────────────────────────────────────────
  {
    name: 'info',
    aliases: ['botinfo', 'status'],
    category: 'fun',
    desc: 'Informations sur le bot',
    execute: async ({ sock, msg }) => {
      const uptime = process.uptime()
      const h = Math.floor(uptime / 3600)
      const m = Math.floor((uptime % 3600) / 60)
      const s = Math.floor(uptime % 60)
      const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
      const text =
        `╔══ *BOT INFO* ══╗\n` +
        `║ 🤖 Nom: ${process.env.BOT_NAME || 'MonBot'}\n` +
        `║ 🟢 Status: En ligne\n` +
        `║ ⏱️ Uptime: ${h}h ${m}m ${s}s\n` +
        `║ 📦 Node: ${process.version}\n` +
        `║ 💾 RAM: ${mem} MB\n` +
        `║ 🔧 Préfixe: ${process.env.PREFIX || '.'}\n` +
        `║ 🏗️ Base: Baileys\n` +
        `╚═══════════════╝`
      await reply(sock, msg, text)
    }
  },

  // ─── HELP ────────────────────────────────────────────────────────────────
  {
    name: 'help',
    aliases: ['menu', 'aide'],
    category: 'fun',
    desc: 'Liste des commandes',
    execute: async ({ sock, msg, isGroup, isSudo, isOwner }) => {
      const { commands } = require('../../lib/loader')
      const prefix = process.env.PREFIX || '.'
      const botName = process.env.BOT_NAME || 'XHRISmd'

      // Ordre d'affichage des catégories
      const ORDER = ['group', 'user', 'fun', 'media', 'ai', 'other']
      const ICONS = {
        group: '👥',
        user:  '👤',
        fun:   '🎮',
        media: '🎬',
        ai:    '🤖',
        other: '📌'
      }
      const LABELS = {
        group: 'Groupe',
        user:  'Utilisateur',
        fun:   'Général',
        media: 'Médias',
        ai:    'Intelligence Artificielle',
        other: 'Autres'
      }

      // ── Fusionner les DEUX systèmes de commandes ─────────────────────────
      // Système 1 : loader.js (format { execute })
      // Système 2 : commands/ (format { handler })
      const { getCommand: _gc, commands: _loaderCmds } = require('../../lib/loader')
      const allCmds = []
      const seen = new Set()

      // Système 2 (nouvelles commandes avec handler, depuis handlers/message.js)
      try {
        const { getNewCommands: _gnc } = require('../../handlers/message')
        for (const [name, cmd] of Object.entries(_gnc())) {
          if (!cmd || cmd._alias || seen.has(name)) continue
          seen.add(name)
          allCmds.push({ name, ...cmd })
        }
      } catch {}

      // Système 1 (anciennes commandes avec execute depuis loader)
      for (const [name, cmd] of _loaderCmds) {
        if (!cmd || seen.has(name)) continue
        seen.add(name)
        allCmds.push({ name, ...cmd })
      }

      // Si le cache __cmdCache n'est pas dispo, utiliser getNewCommands via commands
      if (!allCmds.length) {
        for (const [name, cmd] of commands) {
          if (!cmd || seen.has(name)) continue
          seen.add(name)
          allCmds.push({ name, ...cmd })
        }
      }

      // ── Catégoriser — TOUTES les commandes apparaissent ──────────────────
      // Les commandes groupe ont un badge 👥, pas masquées
      // Seules les commandes owner/sudo sont masquées aux non-privilegiés
      const cats = {}
      for (const cmd of allCmds) {
        const isPrivCmd = cmd.sudo || cmd.ownerOnly
        if (isPrivCmd && !isSudo && !isOwner) continue

        const cat = cmd.category || 'other'
        if (!cats[cat]) cats[cat] = []
        if (!cats[cat].some(c => c.name === cmd.name)) cats[cat].push(cmd)
      }

      let text = ''
      text += `╔═══════════════════╗\n`
      text += `║  🤖 *${botName}*\n`
      text += `║  Préfixe: *${prefix}*  |  Cmds: *${commands.size}*\n`
      text += `╚═══════════════════╝\n\n`

      // Afficher dans l'ordre défini
      const sortedCats = [
        ...ORDER.filter(c => cats[c]),
        ...Object.keys(cats).filter(c => !ORDER.includes(c))
      ]

      for (const cat of sortedCats) {
        const cmds = cats[cat]
        if (!cmds?.length) continue
        const icon = ICONS[cat] || '•'
        const label = LABELS[cat] || cat.toUpperCase()
        text += `${icon} *${label.toUpperCase()}* (${cmds.length})\n`
        text += `${'─'.repeat(22)}\n`
        for (const cmd of cmds) {
          const cmdName = cmd.name || '?'
          const aliases = cmd.aliases?.length ? ` _[${cmd.aliases.slice(0,2).join(', ')}]_` : ''
          const locks = []
          if (cmd.sudo || cmd.ownerOnly)   locks.push('🔑')
          if (cmd.admin)                    locks.push('👑')
          if (cmd.botAdmin)                 locks.push('🤖')
          if (cmd.group || cmd.groupOnly)   locks.push('👥')
          const lock = locks.length ? ` ${locks.join('')}` : ''
          const p = prefix || ''
          text += `  *${p}${cmdName}*${aliases}${lock}\n`
          if (cmd.desc) text += `   ↳ _${cmd.desc}_\n`
        }
        text += '\n'
      }

      text += `╔══════════════════════════╗\n`
      text += `║ 🔑 Sudo  👑 Admin  🤖 Bot  👥 Groupe\n`
      text += `╚══════════════════════════╝`

      await reply(sock, msg, text)
    }
  },

  // ─── AFK ─────────────────────────────────────────────────────────────────
  {
    name: 'afk',
    category: 'fun',
    desc: 'Activer le mode AFK',
    usage: '.afk [raison]',
    execute: async ({ sock, msg, sender, args }) => {
      const reason = args.join(' ') || 'Pas de raison'
      await setAfk(sender, reason)
      await reply(sock, msg, `😴 Tu es maintenant *AFK*.\n📝 Raison: _${reason}_`)
    }
  },

  // ─── QUOTE ───────────────────────────────────────────────────────────────
  {
    name: 'quote',
    aliases: ['citation'],
    category: 'fun',
    desc: 'Citation aléatoire inspirante',
    execute: async ({ sock, msg }) => {
      const quotes = [
        'La vie est ce qui arrive quand on est occupé à faire d\'autres plans. — John Lennon',
        'Soyez le changement que vous voulez voir dans le monde. — Gandhi',
        'Le succès c\'est tomber sept fois, se relever huit. — Proverbe japonais',
        'La seule façon de faire du bon travail est d\'aimer ce que vous faites. — Steve Jobs',
        'Tout ce que l\'esprit peut concevoir et croire, il peut l\'atteindre. — Napoleon Hill',
        'L\'avenir appartient à ceux qui croient à la beauté de leurs rêves. — Eleanor Roosevelt',
        'La créativité, c\'est l\'intelligence qui s\'amuse. — Albert Einstein',
        'Ne rêve pas ta vie, vis tes rêves. — Proverbe'
      ]
      const q = quotes[Math.floor(Math.random() * quotes.length)]
      await reply(sock, msg, `💬 *Citation du moment*\n\n_${q}_`)
    }
  },

  // ─── STICKER ─────────────────────────────────────────────────────────────
  {
    name: 'sticker',
    aliases: ['s', 'stick'],
    category: 'fun',
    desc: 'Convertir une image/vidéo en sticker',
    usage: '.sticker [image jointe ou en réponse]',
    execute: async ({ sock, msg, from }) => {
      const type = Object.keys(msg.message)[0]
      const isImage = type === 'imageMessage' || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
      const isVideo = type === 'videoMessage' || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage

      if (!isImage && !isVideo) return reply(sock, msg, '❌ Envoie ou réponds à une image/vidéo.')

      const targetMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        ? { message: msg.message.extendedTextMessage.contextInfo.quotedMessage, key: { remoteJid: from } }
        : msg

      const filePath = await downloadMedia(targetMsg, isImage ? 'image' : 'video')
      const outPath = filePath.replace(/\.\w+$/, '.webp')

      try {
        // execFile async pour ne pas bloquer le thread Node.js
        await new Promise((resolve, reject) => {
          const { execFile } = require('child_process')
          const ffArgs = isImage
            ? ['-i', filePath, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2', outPath, '-y']
            : ['-i', filePath, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,fps=15', '-t', '10', '-loop', '0', outPath, '-y']
          execFile('ffmpeg', ffArgs, { timeout: 30000 }, (err, _, stderr) => {
            if (err) reject(new Error(stderr || err.message))
            else resolve()
          })
        })
        const sticker = await fs.readFile(outPath)
        await sock.sendMessage(from, { sticker }, { quoted: msg })
      } catch (e) {
        await reply(sock, msg, `❌ Erreur sticker: ${e.message}`)
      } finally {
        await fs.remove(filePath).catch(() => {})
        await fs.remove(outPath).catch(() => {})
      }
    }
  },

  // ─── TTS ─────────────────────────────────────────────────────────────────
  {
    name: 'tts',
    category: 'fun',
    desc: 'Convertir du texte en audio (voix)',
    usage: '.tts [fr/en/es] texte',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .tts [fr/en/es] texte')
      const langs = ['fr', 'en', 'ar', 'es', 'pt']
      let lang = 'fr'
      let textArgs = [...args]
      if (langs.includes(textArgs[0]?.toLowerCase())) {
        lang = textArgs.shift().toLowerCase()
      }
      const text = textArgs.join(' ')
      if (!text) return reply(sock, msg, '❌ Donne un texte.')
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } })
        await sock.sendMessage(from, {
          audio: Buffer.from(res.data),
          mimetype: 'audio/mpeg',
          ptt: true
        }, { quoted: msg })
      } catch (e) {
        await reply(sock, msg, `❌ Erreur TTS: ${e.message}`)
      }
    }
  },

  // ─── MYID ────────────────────────────────────────────────────────────────
  {
    name: 'myid',
    aliases: ['whoami', 'id'],
    category: 'fun',
    desc: 'Afficher ton numéro WhatsApp',
    execute: async ({ sock, msg, sender }) => {
      const num = sender.split('@')[0].split(':')[0]
      await reply(sock, msg, `🆔 Ton numéro: *+${num}*\n📍 JID complet: \`${sender}\``)
    }
  },

  // ─── BOTID ───────────────────────────────────────────────────────────────
  {
    name: 'botid',
    category: 'fun',
    desc: 'Afficher le JID du bot',
    execute: async ({ sock, msg, botId }) => {
      await reply(sock, msg, `🤖 JID Bot: \`${botId}\``)
    }
  },

  // ─── VIEWONCE ────────────────────────────────────────────────────────────
  // Renvoie un média viewonce en message normal (visible plusieurs fois)
  {
    name: 'viewonce',
    aliases: ['vo', 'antiview'],
    category: 'fun',
    desc: 'Voir un média en mode viewonce (reply le message)',
    usage: '.viewonce [reply un message viewonce]',
    execute: async ({ sock, msg }) => {
      try {
        const ctx = msg.message?.extendedTextMessage?.contextInfo
        const quoted = ctx?.quotedMessage

        if (!quoted) return reply(sock, msg, '❌ Reply un message viewonce.')

        // Détecter le type de média dans le message quoté
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage']
        let mediaType = null
        let mediaMsg  = null

        for (const t of mediaTypes) {
          if (quoted[t]) { mediaType = t; mediaMsg = quoted[t]; break }
        }

        // Aussi chercher dans viewOnceMessage / viewOnceMessageV2
        if (!mediaMsg && quoted.viewOnceMessage?.message) {
          const inner = quoted.viewOnceMessage.message
          for (const t of mediaTypes) {
            if (inner[t]) { mediaType = t; mediaMsg = inner[t]; break }
          }
        }
        if (!mediaMsg && quoted.viewOnceMessageV2?.message) {
          const inner = quoted.viewOnceMessageV2.message
          for (const t of mediaTypes) {
            if (inner[t]) { mediaType = t; mediaMsg = inner[t]; break }
          }
        }

        if (!mediaMsg || !mediaType) {
          return reply(sock, msg, '❌ Aucun média trouvé dans ce message.')
        }

        // Construire le message cible pour téléchargement
        // FIX : passer le msg original avec le bon key pour que Baileys
        // retrouve les clés de déchiffrement
        const fakeMsg = {
          key: {
            remoteJid: msg.key.remoteJid,
            id: ctx.stanzaId || msg.key.id,
            fromMe: false,
            // FIX : fallback si ctx.participant absent (DM ou groupe récent)
            participant: ctx.participant || msg.key.participant || msg.key.remoteJid
          },
          message: { [mediaType]: mediaMsg }
        }

        const buffer = await downloadMediaMessage(
          fakeMsg,
          'buffer',
          {},
          {
            logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
            reuploadRequest: sock.updateMediaMessage
          }
        )

        // Renvoyer sans viewOnce
        const caption = mediaMsg.caption || ''
        if (mediaType === 'imageMessage') {
          await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption }, { quoted: msg })
        } else if (mediaType === 'videoMessage') {
          await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption }, { quoted: msg })
        } else if (mediaType === 'audioMessage') {
          await sock.sendMessage(msg.key.remoteJid, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: msg })
        }
      } catch (e) {
        await reply(sock, msg, `❌ Erreur: ${e.message}`)
      }
    }
  },

  // ─── CLEARCHAT ───────────────────────────────────────────────────────────
  // Efface l'historique du chat côté bot (archive + supprime messages locaux)
  {
    name: 'clearchat',
    aliases: ['viderchat', 'clearchat'],
    category: 'fun',
    desc: "Effacer l'historique du chat actuel côté bot",
    usage: '.clearchat',
    execute: async ({ sock, msg, from, isSudo, isOwner }) => {
      if (!isSudo && !isOwner) return reply(sock, msg, '❌ Commande réservée aux admins du bot.')
      await reply(sock, msg, '🗑️ Suppression en cours...')
      await new Promise(r => setTimeout(r, 500))
      let cleared = false
      // Tentative 1 : chatModify clear (Baileys MD)
      if (!cleared) try {
        await sock.chatModify({
          clear: { messages: [{ id: msg.key.id, fromMe: !!msg.key.fromMe, timestamp: Number(msg.messageTimestamp) }] }
        }, from)
        cleared = true
      } catch {}
      // Tentative 2 : delete:true avec lastMessages
      if (!cleared) try {
        await sock.chatModify({ delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] }, from)
        cleared = true
      } catch {}
      // Tentative 3 : archive uniquement
      if (!cleared) try {
        await sock.chatModify({ archive: true }, from)
        cleared = true
      } catch {}
      if (cleared) {
        await reply(sock, msg, '✅ Chat effacé/archivé côté bot.')
      } else {
        await reply(sock, msg, '❌ Impossible d\'effacer ce chat (non supporté sur ce compte).')
      }
    }
  },

  // ─── WALLPAPER ───────────────────────────────────────────────────────────
  {
    name: 'wallpaper',
    aliases: ['wp', 'wallpapers'],
    category: 'fun',
    desc: 'Wallpaper aléatoire ou avec prompt (IA)',
    usage: '.wallpaper [description]',
    execute: async ({ sock, msg, from, args }) => {
      await react(sock, msg, '🖼️')
      try {
        let prompt = args.join(' ')
        if (!prompt) {
          const themes = ['cosmic galaxy nebula', 'tropical beach sunset', 'misty forest mountains', 'cyberpunk neon city', 'abstract geometric art']
          prompt = themes[Math.floor(Math.random() * themes.length)] + ', high quality wallpaper, 4K, ultra detailed'
        }
        const seed = Math.floor(Math.random() * 1e6)
        const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&seed=${seed}&nologo=true`
        const r    = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 })
        await sock.sendMessage(from, {
          image:   Buffer.from(r.data),
          caption: `🖼️ _Wallpaper généré_\n${prompt.slice(0, 80)}`
        }, { quoted: msg })
      } catch (e) { reply(sock, msg, '❌ Erreur: ' + e.message) }
    }
  },

  // ─── IMGTEXT ─────────────────────────────────────────────────────────────
  {
    name: 'imgtext',
    aliases: ['textimg', 'texttoimg'],
    category: 'fun',
    desc: 'Génère une image avec du texte',
    usage: '.imgtext <texte>',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .imgtext <texte>')
      await react(sock, msg, '🎨')
      const text = args.join(' ').slice(0, 200)
      try {
        const prompt = `Beautiful typography poster with the text: "${text}", high quality, artistic, centered`
        const seed   = Math.floor(Math.random() * 1000000)
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`
        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 60000 })
        await sock.sendMessage(from, {
          image:   Buffer.from(imgRes.data),
          caption: `🎨 *Image générée avec :* "${text}"`
        }, { quoted: msg })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur génération: ' + e.message)
      }
    }
  },

]
