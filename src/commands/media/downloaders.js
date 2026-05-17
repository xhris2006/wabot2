const axios = require('axios')

async function sendMediaFromUrl(sock, msg, url, type = 'auto', caption = '') {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: 50 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const buf = Buffer.from(r.data)
  const ct = r.headers['content-type'] || ''
  let detectedType = type
  if (type === 'auto') {
    if (ct.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(url)) detectedType = 'video'
    else if (ct.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(url)) detectedType = 'image'
    else if (ct.startsWith('audio/') || /\.(mp3|m4a|ogg)$/i.test(url)) detectedType = 'audio'
    else detectedType = 'document'
  }
  if (detectedType === 'video') return sock.sendMessage(msg.key.remoteJid, { video: buf, caption }, { quoted: msg })
  if (detectedType === 'image') return sock.sendMessage(msg.key.remoteJid, { image: buf, caption }, { quoted: msg })
  if (detectedType === 'audio') return sock.sendMessage(msg.key.remoteJid, { audio: buf, mimetype: ct || 'audio/mp4' }, { quoted: msg })
  return sock.sendMessage(msg.key.remoteJid, { document: buf, mimetype: ct || 'application/octet-stream', fileName: 'file.bin', caption }, { quoted: msg })
}

module.exports = {
  tiktok: {
    desc: 'Telecharger une video TikTok',
    aliases: ['tt'],
    category: 'download',
    usage: '.tiktok <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/tiktok|vm\.tiktok|vt\.tiktok/.test(url)) return reply('Lien TikTok invalide.')
      await reply('TikTok en cours...')
      try {
        const r = await axios.get(`https://api.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, { timeout: 15000 })
        const videoUrl = r.data?.data?.hdplay || r.data?.data?.play
        if (!videoUrl) return reply('Impossible de telecharger cette video.')
        await sendMediaFromUrl(sock, msg, videoUrl, 'video', `${r.data.data?.title || 'TikTok'}\n${r.data.data?.author?.nickname || ''}`)
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  ytdl: {
    desc: 'Telecharger YouTube mp3/mp4',
    aliases: ['youtube', 'yt'],
    category: 'download',
    usage: '.ytdl <url> [mp3|mp4]',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      const format = args[1]?.toLowerCase() === 'mp3' ? 'mp3' : 'mp4'
      if (!url || !/youtube|youtu\.be/.test(url)) return reply('Lien YouTube invalide.')
      await reply(`YouTube (${format}) en cours...`)
      try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/youtube/${format}?url=${encodeURIComponent(url)}`, { timeout: 30000 })
        const dlUrl = res.data?.download_url || res.data?.url || res.data?.result?.download_url
        if (!dlUrl) return reply('Service YouTube indisponible.')
        await sendMediaFromUrl(sock, msg, dlUrl, format === 'mp3' ? 'audio' : 'video', 'Via .ytdl')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  instagram: {
    desc: 'Telecharger Instagram',
    aliases: ['ig', 'insta'],
    category: 'download',
    usage: '.instagram <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/instagram/.test(url)) return reply('Lien Instagram invalide.')
      await reply('Instagram en cours...')
      try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/instagram?url=${encodeURIComponent(url)}`, { timeout: 20000 })
        const items = Array.isArray(res.data?.result) ? res.data.result : []
        if (!items.length) return reply('Aucun media trouve.')
        for (const item of items.slice(0, 5)) await sendMediaFromUrl(sock, msg, item.url || item, 'auto', 'Via .instagram').catch(() => {})
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  twitter: {
    desc: 'Telecharger video Twitter/X',
    aliases: ['x', 'tweet'],
    category: 'download',
    usage: '.twitter <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/twitter\.com|x\.com/.test(url)) return reply('Lien Twitter/X invalide.')
      await reply('Twitter en cours...')
      try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/twitter?url=${encodeURIComponent(url)}`, { timeout: 20000 })
        const dl = res.data?.video?.[0] || res.data?.result?.video || res.data?.result
        const videoUrl = typeof dl === 'string' ? dl : dl?.url
        if (!videoUrl) return reply('Pas de video trouvee.')
        await sendMediaFromUrl(sock, msg, videoUrl, 'video', 'Via .twitter')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  facebook: {
    desc: 'Telecharger video Facebook',
    aliases: ['fb'],
    category: 'download',
    usage: '.facebook <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/facebook|fb\.watch/.test(url)) return reply('Lien Facebook invalide.')
      await reply('Facebook en cours...')
      try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 })
        const dl = res.data?.video_hd || res.data?.video_sd || res.data?.result?.video
        if (!dl) return reply('Pas de video trouvee.')
        await sendMediaFromUrl(sock, msg, dl, 'video', 'Via .facebook')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  spotify: {
    desc: 'Telecharger morceau Spotify via YouTube',
    aliases: ['sp'],
    category: 'download',
    usage: '.spotify <url ou titre>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Donne une URL Spotify ou un titre.')
      await reply('Recherche Spotify...')
      try {
        let query = args.join(' ')
        if (/spotify\.com/.test(query)) {
          const html = (await axios.get(query, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } })).data
          const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || ''
          query = title.replace(' - song by ', ' ').replace('|', '').split(' - Spotify')[0] || query
        }
        const sr = await axios.get(`https://apis.davidcyriltech.my.id/youtube/search?query=${encodeURIComponent(query)}`, { timeout: 15000 })
        const vid = sr.data?.results?.[0]
        if (!vid) return reply('Aucun resultat.')
        const dl = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp3?url=${encodeURIComponent(vid.url)}`, { timeout: 30000 })
        const dlUrl = dl.data?.download_url || dl.data?.url
        if (!dlUrl) return reply('Telechargement impossible.')
        await sendMediaFromUrl(sock, msg, dlUrl, 'audio')
        await reply(`${vid.title}\nVia .spotify`)
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  soundcloud: {
    desc: 'Telecharger piste SoundCloud',
    aliases: ['sc'],
    category: 'download',
    usage: '.soundcloud <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/soundcloud\.com/.test(url)) return reply('Lien SoundCloud invalide.')
      await reply('SoundCloud en cours...')
      try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 30000 })
        const dl = res.data?.download_url || res.data?.result?.download
        if (!dl) return reply('Telechargement impossible.')
        await sendMediaFromUrl(sock, msg, dl, 'audio')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  mediafire: {
    desc: 'Telecharger MediaFire',
    aliases: ['mf'],
    category: 'download',
    usage: '.mediafire <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/mediafire/.test(url)) return reply('Lien MediaFire invalide.')
      await reply('MediaFire en cours...')
      try {
        const html = (await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } })).data
        const dlLink = html.match(/href="(https:\/\/download[^"]+)"/)?.[1]
        if (!dlLink) return reply('Lien de telechargement introuvable.')
        await sendMediaFromUrl(sock, msg, dlLink, 'auto')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  gdrive: {
    desc: 'Telecharger Google Drive public',
    aliases: ['drive'],
    category: 'download',
    usage: '.gdrive <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/drive\.google\.com/.test(url)) return reply('Lien Drive invalide.')
      const id = url.match(/[-\w]{25,}/)?.[0]
      if (!id) return reply('ID Drive introuvable.')
      await reply('Google Drive en cours...')
      try { await sendMediaFromUrl(sock, msg, `https://drive.google.com/uc?export=download&id=${id}`, 'auto') }
      catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  pinterest: {
    desc: 'Telecharger Pinterest',
    aliases: ['pin'],
    category: 'download',
    usage: '.pinterest <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/pinterest|pin\.it/.test(url)) return reply('Lien Pinterest invalide.')
      await reply('Pinterest en cours...')
      try {
        const html = (await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } })).data
        const m = html.match(/"url":"(https:\/\/i\.pinimg\.com\/originals\/[^"]+)"/) || html.match(/"url":"(https:\/\/i\.pinimg\.com\/[^"]+\.(?:jpg|jpeg|png|webp|mp4))"/)
        if (!m) return reply('Pas de media trouve.')
        await sendMediaFromUrl(sock, msg, m[1], 'auto', 'Via .pinterest')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  telegram: {
    desc: 'Telecharger media Telegram public',
    aliases: ['tg'],
    category: 'download',
    usage: '.telegram <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/t\.me/.test(url)) return reply('Lien Telegram invalide.')
      await reply('Telegram en cours...')
      try {
        const html = (await axios.get(url + '?embed=1&mode=tme', { timeout: 10000, headers: { 'User-Agent': 'TelegramBot' } })).data
        const media = html.match(/data-media-url="([^"]+)"/)?.[1] || html.match(/<img[^>]+src="(https:\/\/cdn[^"]+)"/)?.[1]
        if (!media) return reply('Pas de media trouve.')
        await sendMediaFromUrl(sock, msg, media, 'auto', 'Via .telegram')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  zip: {
    desc: 'Telecharger un fichier zip max 50 MB',
    aliases: ['dlzip'],
    category: 'download',
    usage: '.zip <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/^https?:\/\//.test(url)) return reply('URL invalide.')
      await reply('Telechargement zip...')
      try {
        let finalUrl = url
        if (/github\.com\/[^/]+\/[^/]+\/?$/.test(url.replace(/\.git$/, ''))) finalUrl = url.replace(/\.git$/, '').replace(/\/$/, '') + '/archive/refs/heads/main.zip'
        const res = await axios.get(finalUrl, {
          responseType: 'arraybuffer',
          timeout: 120000,
          maxContentLength: 50 * 1024 * 1024,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        })
        const fileName = finalUrl.split('/').pop().split('?')[0] || 'archive.zip'
        await sock.sendMessage(msg.key.remoteJid, { document: Buffer.from(res.data), mimetype: 'application/zip', fileName }, { quoted: msg })
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  // ═══ SPOTIFY (cross-search YouTube) ══════════════════════════════════════
  spotify: {
    desc: 'Télécharger un morceau Spotify (via YouTube)',
    aliases: ['sp'],
    category: 'download',
    usage: '.spotify <url Spotify ou titre>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('❌ Donne une URL Spotify ou un titre.')
      await reply('⏳ Recherche Spotify...')
      try {
        let query = args.join(' ')
        if (/spotify\.com/.test(query)) {
          try {
            const html = (await axios.get(query, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } })).data
            const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || ''
            query = title.replace(' | Spotify', '').replace('|', '').trim() || query
          } catch {}
        }
        const sr = await axios.get(`https://apis.davidcyriltech.my.id/youtube/search?query=${encodeURIComponent(query + ' audio')}`, { timeout: 15000 })
        const vid = sr.data?.results?.[0]
        if (!vid) return reply('❌ Aucun résultat trouvé pour ce titre.')
        const dl = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp3?url=${encodeURIComponent(vid.url)}`, { timeout: 30000 })
        const dlUrl = dl.data?.download_url || dl.data?.url
        if (!dlUrl) return reply('❌ Téléchargement impossible. Réessaie.')
        await sendMediaFromUrl(sock, msg, dlUrl, 'audio')
        await reply(`🎧 *${vid.title}*\n_Via Spotify → YouTube_`)
      } catch (e) { reply('❌ Erreur: ' + e.message) }
    }
  },

  // ═══ SOUNDCLOUD ═══════════════════════════════════════════════════════════
  soundcloud: {
    desc: 'Télécharger piste SoundCloud',
    aliases: ['sc'],
    category: 'download',
    usage: '.soundcloud <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/soundcloud\.com/.test(url)) return reply('❌ Lien SoundCloud invalide.')
      await reply('⏳ SoundCloud...')
      try {
        const res = await axios.get(`https://apis.davidcyriltech.my.id/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 30000 })
        const dl = res.data?.download_url || res.data?.result?.download
        if (!dl) return reply('❌ Téléchargement impossible. Service indisponible.')
        await sendMediaFromUrl(sock, msg, dl, 'audio')
      } catch (e) { reply('❌ Erreur: ' + e.message) }
    }
  },

  // ═══ MEDIAFIRE ═══════════════════════════════════════════════════════════
  mediafire: {
    desc: 'Télécharger un fichier MediaFire',
    aliases: ['mf'],
    category: 'download',
    usage: '.mediafire <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/mediafire/.test(url)) return reply('❌ Lien MediaFire invalide.')
      await reply('⏳ MediaFire...')
      try {
        const html = (await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } })).data
        const dlLink = html.match(/href="(https:\/\/download[^"]+)"/)?.[1]
          || html.match(/id="downloadButton"[^>]+href="([^"]+)"/)?.[1]
        if (!dlLink) return reply('❌ Lien de téléchargement introuvable (fichier privé ou invalide).')
        await sendMediaFromUrl(sock, msg, dlLink, 'auto')
      } catch (e) { reply('❌ Erreur: ' + e.message) }
    }
  },

  // ═══ GOOGLE DRIVE ════════════════════════════════════════════════════════
  gdrive: {
    desc: 'Télécharger un fichier Google Drive public',
    aliases: ['drive'],
    category: 'download',
    usage: '.gdrive <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/drive\.google\.com/.test(url)) return reply('❌ Lien Google Drive invalide.')
      const idMatch = url.match(/[-\w]{25,}/)
      if (!idMatch) return reply('❌ Impossible d\'extraire l\'ID Drive. Vérifie le lien.')
      const dlUrl = `https://drive.google.com/uc?export=download&id=${idMatch[0]}`
      await reply('⏳ Google Drive...')
      try {
        await sendMediaFromUrl(sock, msg, dlUrl, 'auto')
      } catch (e) { reply('❌ Erreur Drive: ' + e.message + '\n_Le fichier doit être public._') }
    }
  }
}
