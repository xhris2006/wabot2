const { reply, react } = require('../../lib/utils')
const axios = require('axios')

// ─── Multi-API fallback helpers ───────────────────────────────────────────────
async function ytSearch(query) {
  const apis = [
    { url: 'https://apis.davidcyriltech.my.id/youtube/search', q: 'query' },
    { url: 'https://api.dreaded.site/api/ytsearch',            q: 'query' },
    { url: 'https://api.giftedtech.web.id/api/search/yts',     q: 'query' },
  ]
  for (const api of apis) {
    try {
      const r = await axios.get(`${api.url}?${api.q}=${encodeURIComponent(query)}`, { timeout: 12000 })
      const raw = r.data?.results || r.data?.data || r.data?.result || []
      const items = Array.isArray(raw) ? raw : (raw.videos || [])
      if (items.length) {
        const v = items[0]
        return {
          title:     v.title,
          url:       v.url || v.link,
          duration:  v.duration?.timestamp || v.duration?.seconds || v.duration || '?',
          author:    v.author?.name || v.channel?.name || v.channel || '',
          thumbnail: v.thumbnail || v.image
        }
      }
    } catch {}
  }
  return null
}

async function ytAudioDl(url) {
  const apis = [
    `https://apis.davidcyriltech.my.id/youtube/mp3?url=${encodeURIComponent(url)}`,
    `https://api.giftedtech.web.id/api/download/dlmp3?apikey=gifted&url=${encodeURIComponent(url)}`,
    `https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(url)}`,
  ]
  for (const apiUrl of apis) {
    try {
      const r = await axios.get(apiUrl, { timeout: 30000 })
      const dlUrl = r.data?.download_url || r.data?.url || r.data?.result?.download_url
        || r.data?.result?.url || r.data?.audio
      if (dlUrl) return dlUrl
    } catch {}
  }
  return null
}

module.exports = [

  // ─── PLAY ────────────────────────────────────────────────────────────────
  {
    name: 'play',
    aliases: ['ytmp3', 'music', 'song'],
    category: 'media',
    desc: 'Rechercher et télécharger une musique YouTube',
    usage: '.play <nom de la chanson ou URL>',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .play <chanson ou URL YouTube>')
      await react(sock, msg, '🔍')
      const query = args.join(' ')
      try {
        const isUrl = /^https?:\/\//.test(query) && query.includes('youtu')
        let videoInfo = null

        if (isUrl) {
          videoInfo = { url: query, title: 'YouTube Video', duration: '?', author: '' }
          try {
            const o = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`, { timeout: 5000 })
            videoInfo.title  = o.data?.title || videoInfo.title
            videoInfo.author = o.data?.author_name || ''
          } catch {}
        } else {
          videoInfo = await ytSearch(query)
          if (!videoInfo) return reply(sock, msg, '❌ Aucun résultat trouvé. Réessaie avec d\'autres mots-clés.')
        }

        const infoText =
          `🎵 *${videoInfo.title}*\n\n` +
          (videoInfo.author ? `👤 *Auteur:* ${videoInfo.author}\n` : '') +
          `⏱️ *Durée:* ${videoInfo.duration}\n` +
          `🔗 ${videoInfo.url}\n\n` +
          `📥 _Téléchargement en cours..._`

        if (videoInfo.thumbnail) {
          try {
            const tRes = await axios.get(videoInfo.thumbnail, { responseType: 'arraybuffer', timeout: 8000 })
            await sock.sendMessage(from, { image: Buffer.from(tRes.data), caption: infoText }, { quoted: msg })
          } catch { await reply(sock, msg, infoText) }
        } else {
          await reply(sock, msg, infoText)
        }

        await react(sock, msg, '⬇️')

        const dlUrl = await ytAudioDl(videoInfo.url)
        if (!dlUrl) return reply(sock, msg, '❌ Impossible de récupérer l\'audio. Service temporairement indisponible.')

        const audioRes = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 60000 })
        await sock.sendMessage(from, {
          audio:    Buffer.from(audioRes.data),
          mimetype: 'audio/mpeg',
          fileName: `${videoInfo.title.replace(/[\\/:*?"<>|]/g, '')}.mp3`
        }, { quoted: msg })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── YTVIDEO (ancien .video) ──────────────────────────────────────────────
  {
    name: 'ytvideo',
    aliases: ['ytmp4'],
    category: 'media',
    desc: 'Télécharger une vidéo YouTube',
    usage: '.ytvideo nom de la vidéo',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .ytvideo nom de la vidéo')
      await react(sock, msg, '🔍')
      const query = args.join(' ')
      try {
        const searchRes = await axios.get(`https://apis.davidcyriltech.my.id/youtube/search?query=${encodeURIComponent(query)}`)
        const video = searchRes.data?.results?.[0]
        if (!video) return reply(sock, msg, '❌ Aucun résultat trouvé.')

        await reply(sock, msg, `🎬 *${video.title}*\n⏱️ Durée: ${video.duration}\n📥 Téléchargement en cours...`)

        const dlRes = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp4?url=${encodeURIComponent(video.url)}`)
        const dlUrl = dlRes.data?.download_url || dlRes.data?.url
        if (!dlUrl) return reply(sock, msg, '❌ Impossible de télécharger.')

        const videoRes = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 60000 })
        await sock.sendMessage(from, {
          video:   Buffer.from(videoRes.data),
          caption: `🎬 ${video.title}`
        }, { quoted: msg })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur lors du téléchargement. Réessaie.')
      }
    }
  },

  // ─── VIDEO (audio → vidéo) ────────────────────────────────────────────────
  {
    name: 'video',
    aliases: ['audio2video', 'a2v'],
    category: 'media',
    desc: 'Transformer un audio en vidéo (reply à un audio)',
    usage: '.video (répondre à un audio)',
    execute: async ({ sock, msg, from }) => {
      const ctx    = msg.message?.extendedTextMessage?.contextInfo
      const quoted = ctx?.quotedMessage
      if (!quoted?.audioMessage) return reply(sock, msg, '❌ Réponds à un audio avec .video.')
      await react(sock, msg, '🎬')
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const audioBuf = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer', {}, { logger: { info: () => {}, error: () => {} } }
        )
        await sock.sendMessage(from, {
          video:    audioBuf,
          mimetype: 'video/mp4',
          caption:  '🎬 _Audio converti en vidéo_'
        }, { quoted: msg })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur: ' + e.message)
      }
    }
  },

  // ─── MP3 (extraire audio d'une vidéo) ────────────────────────────────────
  {
    name: 'mp3',
    aliases: ['toaudio', 'extractaudio'],
    category: 'media',
    desc: "Extraire l'audio d'une vidéo (reply à une vidéo)",
    usage: '.mp3 (répondre à une vidéo)',
    execute: async ({ sock, msg, from }) => {
      const ctx    = msg.message?.extendedTextMessage?.contextInfo
      const quoted = ctx?.quotedMessage
      if (!quoted?.videoMessage) return reply(sock, msg, "❌ Réponds à une vidéo avec .mp3 pour extraire l'audio.")
      await react(sock, msg, '🎵')
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const buffer = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer', {}, { logger: { info: () => {}, error: () => {} } }
        )
        await sock.sendMessage(from, {
          audio:    buffer,
          mimetype: 'audio/mp4',
          fileName: 'extracted.mp3'
        }, { quoted: msg })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur extraction audio: ' + e.message)
      }
    }
  },

  // ─── FETCH (télécharger un média depuis une URL) ──────────────────────────
  {
    name: 'fetch',
    aliases: ['url', 'dlurl'],
    category: 'media',
    desc: 'Télécharger un média depuis une URL (image/audio/vidéo)',
    usage: '.fetch <url> [texte optionnel]',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .fetch <url> [texte]\nLe bot téléchargera et enverra le média.')
      const url     = args[0]
      const caption = args.slice(1).join(' ')
      if (!/^https?:\/\//.test(url)) return reply(sock, msg, '❌ URL invalide.')

      await react(sock, msg, '⏳')
      try {
        const head = await axios.head(url, { timeout: 10000, validateStatus: () => true }).catch(() => null)
        const contentType = head?.headers?.['content-type'] || ''

        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 50 * 1024 * 1024 })
        const buf = Buffer.from(res.data)

        const isImage = contentType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
        const isVideo = contentType.startsWith('video/') || /\.(mp4|mov|webm|avi)$/i.test(url)
        const isAudio = contentType.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|aac)$/i.test(url)

        const opts = caption ? { caption } : {}

        if (isImage)      await sock.sendMessage(from, { image: buf, ...opts }, { quoted: msg })
        else if (isVideo) await sock.sendMessage(from, { video: buf, ...opts }, { quoted: msg })
        else if (isAudio) await sock.sendMessage(from, { audio: buf, mimetype: contentType || 'audio/mpeg' }, { quoted: msg })
        else return reply(sock, msg, `❌ Type non supporté: ${contentType || 'inconnu'}`)

        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur fetch: ' + e.message)
      }
    }
  },

  // ─── IMAGE ────────────────────────────────────────────────────────────────
  {
    name: 'image',
    aliases: ['img', 'photo'],
    category: 'media',
    desc: 'Chercher une image',
    usage: '.image chien',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .image [recherche]')
      await react(sock, msg, '🔍')
      const query = args.join(' ')
      try {
        const res = await axios.get(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&client_id=demo`, {
          timeout: 10000
        }).catch(() => null)

        const imgUrl = res?.data?.urls?.regular
          || `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}`

        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 15000 })
        await sock.sendMessage(from, {
          image:   Buffer.from(imgRes.data),
          caption: `🖼️ Résultat pour: *${query}*`
        }, { quoted: msg })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Impossible de trouver une image.')
      }
    }
  },

  // ─── TOIMG ────────────────────────────────────────────────────────────────
  {
    name: 'toimg',
    aliases: ['toimage'],
    category: 'media',
    desc: 'Convertir un sticker en image',
    execute: async ({ sock, msg, from }) => {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      if (!quoted?.stickerMessage) return reply(sock, msg, '❌ Réponds à un sticker.')
      const { downloadMediaMessage } = require('@whiskeysockets/baileys')
      const buffer = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: from } }, 'buffer', {}
      )
      await sock.sendMessage(from, { image: buffer, caption: '🖼️ Sticker converti en image.' }, { quoted: msg })
    }
  }

]
