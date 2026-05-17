/**
 * commands/owner/extra.js
 * Commandes : dev, support, repo, addowner, fancy, download (yt/tiktok/pinterest/telegram)
 */

const { normalizeJid } = require('../../lib/utils')
const { loadConfig, saveConfig } = require('../../lib/config')

// ── Polices fancy ─────────────────────────────────────────────────────────────
const FONTS = {
  bold:        ['𝗮','𝗯','𝗰','𝗱','𝗲','𝗳','𝗴','𝗵','𝗶','𝗷','𝗸','𝗹','𝗺','𝗻','𝗼','𝗽','𝗾','𝗿','𝘀','𝘁','𝘂','𝘃','𝘄','𝘅','𝘆','𝘇'],
  italic:      ['𝘢','𝘣','𝘤','𝘥','𝘦','𝘧','𝘨','𝘩','𝘪','𝘫','𝘬','𝘭','𝘮','𝘯','𝘰','𝘱','𝘲','𝘳','𝘴','𝘵','𝘶','𝘷','𝘸','𝘹','𝘺','𝘻'],
  boldItalic:  ['𝙖','𝙗','𝙘','𝙙','𝙚','𝙛','𝙜','𝙝','𝙞','𝙟','𝙠','𝙡','𝙢','𝙣','𝙤','𝙥','𝙦','𝙧','𝙨','𝙩','𝙪','𝙫','𝙬','𝙭','𝙮','𝙯'],
  script:      ['𝓪','𝓫','𝓬','𝓭','𝓮','𝓯','𝓰','𝓱','𝓲','𝓳','𝓴','𝓵','𝓶','𝓷','𝓸','𝓹','𝓺','𝓻','𝓼','𝓽','𝓾','𝓿','𝔀','𝔁','𝔂','𝔃'],
  double:      ['ａ','ｂ','ｃ','ｄ','ｅ','ｆ','ｇ','ｈ','ｉ','ｊ','ｋ','ｌ','ｍ','ｎ','ｏ','ｐ','ｑ','ｒ','ｓ','ｔ','ｕ','ｖ','ｗ','ｘ','ｙ','ｚ'],
  bubble:      ['ⓐ','ⓑ','ⓒ','ⓓ','ⓔ','ⓕ','ⓖ','ⓗ','ⓘ','ⓙ','ⓚ','ⓛ','ⓜ','ⓝ','ⓞ','ⓟ','ⓠ','ⓡ','ⓢ','ⓣ','ⓤ','ⓥ','ⓦ','ⓧ','ⓨ','ⓩ'],
  square:      ['🄰','🄱','🄲','🄳','🄴','🄵','🄶','🄷','🄸','🄹','🄺','🄻','🄼','🄽','🄾','🄿','🅀','🅁','🅂','🅃','🅄','🅅','🅆','🅇','🅈','🅉'],
  gothic:      ['𝖆','𝖇','𝖈','𝖉','𝖊','𝖋','𝖌','𝖍','𝖎','𝖏','𝖐','𝖑','𝖒','𝖓','𝖔','𝖕','𝖖','𝖗','𝖘','𝖙','𝖚','𝖛','𝖜','𝖝','𝖞','𝖟'],
}
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'

function toFont(text, font) {
  const chars = FONTS[font] || FONTS.bold
  return text.toLowerCase().split('').map(c => {
    const i = ALPHABET.indexOf(c)
    return i >= 0 ? chars[i] : c
  }).join('')
}

module.exports = [

  // ─── DEV ──────────────────────────────────────────────────────────────────
  {
    name: 'dev',
    aliases: ['developer', 'createur'],
    category: 'info',
    desc: 'Infos sur le développeur du bot',
    usage: '.dev',
    handler: async (sock, msg, { reply }) => {
      await reply(
        `👨‍💻 *Développeur — XHRIS-MD*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📱 Contact : *+237694600007*\n` +
        `🌐 Site : https://xhrishost.site\n` +
        `📦 GitHub : https://github.com/xhris2006\n` +
        `📢 Chaîne WA : https://whatsapp.com/channel/0029Vark1I1AYlUR1G8YMX31\n\n` +
        `🚀 *XHRIS Host* — Hébergement de bots WhatsApp\n` +
        `Déploie ton bot en 1 clic depuis le Marketplace !`
      )
    }
  },

  // ─── SUPPORT ──────────────────────────────────────────────────────────────
  {
    name: 'support',
    aliases: ['aide', 'helpdesk'],
    category: 'info',
    desc: 'Lien du support et de la chaîne',
    usage: '.support',
    handler: async (sock, msg, { reply }) => {
      await reply(
        `🛠️ *Support & Communauté*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💬 Groupe support : https://chat.whatsapp.com/VOTRE_LIEN_ICI\n` +
        `📢 Chaîne officielle : https://whatsapp.com/channel/VOTRE_CHAINE_ICI\n\n` +
        `_Remplace les liens par tes vrais liens dans extra.js_`
      )
    }
  },

  // ─── REPO ─────────────────────────────────────────────────────────────────
  {
    name: 'repo',
    aliases: ['github', 'source'],
    category: 'info',
    desc: 'Lien du dépôt GitHub',
    usage: '.repo',
    handler: async (sock, msg, { reply }) => {
      await reply(
        `📦 *Dépôt GitHub*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 https://github.com/xhris84/wabot2\n\n` +
        `⭐ N'oublie pas de mettre une étoile !`
      )
    }
  },

  // ─── ADDOWNER ─────────────────────────────────────────────────────────────
  {
    name: 'addowner',
    aliases: ['setowner'],
    category: 'owner',
    desc: 'Définir le numéro propriétaire du bot',
    usage: '.addowner 237XXXXXXXXX',
    sudo: true,   // sudo (pas ownerOnly) pour que le compte connecté puisse l'utiliser
    handler: async (sock, msg, { args, reply }) => {
      const num = args[0]?.replace(/\D/g, '')
      if (!num || num.length < 8) return reply('❌ Donne un numéro valide.\nEx: .addowner 237694600007')

      const cfg = loadConfig()
      const old = cfg.ownerNumber || '—'
      cfg.ownerNumber = num

      // Ajouter aussi en sudo s'il n'y est pas
      if (!cfg.sudo) cfg.sudo = []
      const newJid = num + '@s.whatsapp.net'
      if (!cfg.sudo.includes(newJid)) cfg.sudo.push(newJid)

      await saveConfig(cfg)
      reply(
        `✅ *Propriétaire mis à jour*\n` +
        `Ancien: *+${old}*\n` +
        `Nouveau: *+${num}*`
      )
    }
  },

  // ─── FANCY ────────────────────────────────────────────────────────────────
  {
    name: 'fancy',
    aliases: ['font', 'police'],
    category: 'fun',
    desc: 'Convertir un texte en police fancy',
    usage: '.fancy <texte> [bold|italic|boldItalic|script|double|bubble|square|gothic]',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply(
        '❌ Usage: .fancy <texte> [style]\n\n' +
        'Styles disponibles:\n' +
        '• bold\n• italic\n• boldItalic\n• script\n• double\n• bubble\n• square\n• gothic'
      )

      const fontNames = Object.keys(FONTS)
      let style = 'bold'
      let textArgs = [...args]

      // Vérifier si le dernier argument est un nom de police
      if (fontNames.includes(args[args.length - 1]?.toLowerCase())) {
        style = textArgs.pop().toLowerCase()
      }

      const text = textArgs.join(' ')
      if (!text) return reply('❌ Donne un texte.')

      // Générer tous les styles ou le style demandé
      if (args[args.length - 1] === 'all') {
        const result = fontNames.map(f => `*${f}:* ${toFont(text, f)}`).join('\n')
        await reply(`🔤 *${text}* en toutes polices:\n\n${result}`)
      } else {
        const converted = toFont(text, style)
        await reply(
          `🔤 *Police: ${style}*\n\n` +
          `Original: ${text}\n` +
          `Converti: ${converted}`
        )
      }
    }
  },

  // ─── DOWNLOAD TIKTOK ──────────────────────────────────────────────────────
  {
    name: 'tiktok',
    aliases: ['tt', 'tikdl'],
    category: 'media',
    desc: 'Télécharger une vidéo TikTok',
    usage: '.tiktok <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !(url.includes('tiktok') || url.includes('vm.tiktok') || url.includes('vt.tiktok'))) {
        return reply('❌ Donne un lien TikTok valide.\nEx: .tiktok https://vm.tiktok.com/...')
      }
      await reply('⏳ Téléchargement TikTok en cours...')
      try {
        const axios = require('axios')
        let videoUrl = null
        let title = 'TikTok'
        let author = ''

        // API 1 : tikwm HD
        try {
          const r = await axios.get(`https://api.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, { timeout: 15000 })
          videoUrl = r.data?.data?.hdplay || r.data?.data?.play
          title    = r.data?.data?.title || 'TikTok'
          author   = r.data?.data?.author?.nickname || ''
        } catch {}

        // Fallback : tikwm sans HD
        if (!videoUrl) {
          try {
            const r2 = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 15000 })
            videoUrl = r2.data?.data?.play
          } catch {}
        }

        if (!videoUrl) return reply('❌ Impossible de télécharger cette vidéo.\n_Lien invalide, privée, ou service indisponible._')

        await sock.sendMessage(msg.key.remoteJid, {
          video:   { url: videoUrl },
          caption: `🎵 *${title}*\n${author ? '👤 ' + author : ''}`
        }, { quoted: msg })
      } catch (e) {
        reply('❌ Erreur TikTok: ' + e.message)
      }
    }
  },

  // ─── DOWNLOAD YOUTUBE ─────────────────────────────────────────────────────
  {
    name: 'ytdl',
    aliases: ['youtube', 'yt'],
    category: 'media',
    desc: 'Télécharger une vidéo/audio YouTube',
    usage: '.ytdl <url> [mp3|mp4]',
    handler: async (sock, msg, { args, reply }) => {
      const url    = args[0]
      const format = args[1]?.toLowerCase() === 'mp3' ? 'mp3' : 'mp4'
      if (!url || !url.includes('youtube') && !url.includes('youtu.be')) {
        return reply('❌ Donne un lien YouTube valide.\nEx: .ytdl https://youtu.be/... mp3')
      }
      try {
        await reply(`⏳ Téléchargement YouTube (${format}) en cours...`)
        const axios = require('axios')

        // API rapide sans installation
        const apiBase = 'https://api.codesandbox.io/yt'
        const res = await axios.get(`https://yt.xhrs.workers.dev/?url=${encodeURIComponent(url)}&format=${format}`, { timeout: 20000 })
          .catch(() => null)

        // Fallback : API alternative
        if (!res?.data?.url) {
          const r2 = await axios.get(`https://api.vevioz.com/@api/button/${format}/${url.includes('youtu.be') ? url.split('/').pop() : new URL(url).searchParams.get('v')}`, { timeout: 15000 }).catch(() => null)
          if (!r2?.data) return reply('❌ Impossible de télécharger.\n_Essaie un autre lien ou format._')
        }

        const dlUrl = res?.data?.url
        if (!dlUrl) return reply('❌ Service temporairement indisponible.\n_Réessaie dans quelques instants._')

        if (format === 'mp3') {
          await sock.sendMessage(msg.key.remoteJid, {
            audio:    { url: dlUrl },
            mimetype: 'audio/mp4',
            ptt:      false
          }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.key.remoteJid, {
            video:   { url: dlUrl },
            caption: '🎬 _Via .ytdl_'
          }, { quoted: msg })
        }
      } catch (e) {
        reply('❌ Erreur YouTube: ' + e.message)
      }
    }
  },

  // ─── DOWNLOAD PINTEREST ───────────────────────────────────────────────────
  {
    name: 'pinterest',
    aliases: ['pin', 'pindl'],
    category: 'media',
    desc: 'Télécharger une image/vidéo Pinterest',
    usage: '.pinterest <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !url.includes('pinterest') && !url.includes('pin.it')) {
        return reply('❌ Donne un lien Pinterest valide.\nEx: .pinterest https://pin.it/...')
      }
      try {
        await reply('⏳ Téléchargement Pinterest en cours...')
        const axios = require('axios')

        // Scraper l'URL directe de l'image
        const { data: html } = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
          timeout: 10000
        })

        // Extraire l'URL de l'image depuis le HTML
        const imgMatch = html.match(/"url":"(https:\/\/i\.pinimg\.com\/originals\/[^"]+)"/)
          || html.match(/"url":"(https:\/\/i\.pinimg\.com\/[^"]+\.(?:jpg|jpeg|png|webp|mp4))"/)

        if (!imgMatch?.[1]) return reply('❌ Impossible d\'extraire le média de cette page Pinterest.')

        const mediaUrl = imgMatch[1]
        const isVideo  = mediaUrl.endsWith('.mp4')

        if (isVideo) {
          await sock.sendMessage(msg.key.remoteJid, { video: { url: mediaUrl }, caption: '📌 _Via .pinterest_' }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaUrl }, caption: '📌 _Via .pinterest_' }, { quoted: msg })
        }
      } catch (e) {
        reply('❌ Erreur Pinterest: ' + e.message)
      }
    }
  },

  // ─── DOWNLOAD TELEGRAM ────────────────────────────────────────────────────
  {
    name: 'telegram',
    aliases: ['tg', 'tgdl'],
    category: 'media',
    desc: 'Télécharger un média depuis un lien Telegram public',
    usage: '.telegram <url_message_public>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !url.includes('t.me')) return reply('❌ Donne un lien Telegram public.\nEx: .telegram https://t.me/channel/123')
      try {
        await reply('⏳ Récupération Telegram en cours...')
        const axios = require('axios')

        // Charger la page du message Telegram
        const embedUrl = url.replace('t.me/', 't.me/') + '?embed=1&mode=tme'
        const { data: html } = await axios.get(embedUrl, {
          headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' },
          timeout: 10000
        })

        // Extraire l'URL du média
        const videoMatch = html.match(/data-media-url="([^"]+)"/)
        const imgMatch   = html.match(/<img[^>]+src="(https:\/\/cdn[^"]+)"/)

        const mediaUrl = videoMatch?.[1] || imgMatch?.[1]
        if (!mediaUrl) return reply('❌ Aucun média trouvé.\n_Ce lien doit pointer vers un message public avec média._')

        const isVideo = mediaUrl.includes('.mp4') || !!videoMatch
        if (isVideo) {
          await sock.sendMessage(msg.key.remoteJid, { video: { url: mediaUrl }, caption: '📱 _Via .telegram_' }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaUrl }, caption: '📱 _Via .telegram_' }, { quoted: msg })
        }
      } catch (e) {
        reply('❌ Erreur Telegram: ' + e.message)
      }
    }
  }

]
