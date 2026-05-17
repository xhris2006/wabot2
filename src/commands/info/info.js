const axios = require('axios')

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

module.exports = {
  weather: {
    desc: 'Meteo d une ville',
    aliases: ['meteo'],
    category: 'info',
    usage: '.weather Douala',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .weather <ville>')
      const city = args.join(' ')
      try {
        const r = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 15000 })
        const c = r.data?.current_condition?.[0]
        if (!c) return reply('Meteo introuvable.')
        await reply(`Meteo ${city}\n${c.weatherDesc?.[0]?.value || ''}\nTemp: ${c.temp_C} C\nRessenti: ${c.FeelsLikeC} C\nHumidite: ${c.humidity}%\nVent: ${c.windspeedKmph} km/h`)
      } catch (e) { reply('Erreur meteo: ' + e.message) }
    }
  },

  crypto: {
    desc: 'Prix crypto CoinGecko',
    aliases: ['coin'],
    category: 'info',
    usage: '.crypto bitcoin',
    handler: async (sock, msg, { args, reply }) => {
      const id = (args[0] || 'bitcoin').toLowerCase()
      try {
        const r = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,eur`, { timeout: 15000 })
        const p = r.data?.[id]
        if (!p) return reply('Crypto introuvable. Utilise l id CoinGecko, ex: bitcoin, ethereum.')
        await reply(`${id}\nUSD: $${p.usd}\nEUR: EUR ${p.eur}`)
      } catch (e) { reply('Erreur crypto: ' + e.message) }
    }
  },

  stock: {
    desc: 'Prix action Yahoo Finance',
    aliases: ['stocks'],
    category: 'info',
    usage: '.stock AAPL',
    handler: async (sock, msg, { args, reply }) => {
      const ticker = (args[0] || '').toUpperCase()
      if (!ticker) return reply('Usage: .stock <ticker>')
      try {
        const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`, { timeout: 15000 })
        const q = r.data?.chart?.result?.[0]?.meta
        if (!q) return reply('Ticker introuvable.')
        await reply(`${ticker}\nPrix: ${q.regularMarketPrice} ${q.currency || ''}\nExchange: ${q.exchangeName || q.fullExchangeName || '-'}`)
      } catch (e) { reply('Erreur stock: ' + e.message) }
    }
  },

  urban: {
    desc: 'Definition Urban Dictionary',
    aliases: ['define'],
    category: 'info',
    usage: '.urban mot',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .urban <terme>')
      try {
        const r = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(args.join(' '))}`, { timeout: 15000 })
        const d = r.data?.list?.[0]
        if (!d) return reply('Definition introuvable.')
        await reply(`${d.word}\n\n${String(d.definition).replace(/\[|\]/g, '').slice(0, 1200)}\n\nEx: ${String(d.example || '').replace(/\[|\]/g, '').slice(0, 300)}`)
      } catch (e) { reply('Erreur urban: ' + e.message) }
    }
  },

  lyrics: {
    desc: 'Paroles de chanson',
    aliases: ['lyric'],
    category: 'info',
    usage: '.lyrics artiste - titre',
    handler: async (sock, msg, { args, reply }) => {
      const raw = args.join(' ')
      const [artist, title] = raw.split(' - ').map(s => s?.trim())
      if (!artist || !title) return reply('Usage: .lyrics artiste - titre')
      try {
        const r = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 15000 })
        const lyr = r.data?.lyrics
        if (!lyr) return reply('Paroles introuvables.')
        await reply(`Lyrics: ${artist} - ${title}\n\n${lyr.slice(0, 3500)}`)
      } catch (e) { reply('Erreur lyrics: ' + e.message) }
    }
  },

  anime: {
    desc: 'Recherche anime MyAnimeList',
    aliases: ['mal'],
    category: 'info',
    usage: '.anime Naruto',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .anime <titre>')
      try {
        const r = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(args.join(' '))}&limit=1`, { timeout: 15000 })
        const a = r.data?.data?.[0]
        if (!a) return reply('Anime introuvable.')
        const text = `${a.title}\nScore: ${a.score || '-'}\nEpisodes: ${a.episodes || '-'}\nStatus: ${a.status || '-'}\n\n${(a.synopsis || '').slice(0, 900)}\n${a.url}`
        if (a.images?.jpg?.image_url) {
          const img = await axios.get(a.images.jpg.image_url, { responseType: 'arraybuffer', timeout: 10000 }).catch(() => null)
          if (img?.data) return sock.sendMessage(msg.key.remoteJid, { image: Buffer.from(img.data), caption: text }, { quoted: msg })
        }
        await reply(text)
      } catch (e) { reply('Erreur anime: ' + e.message) }
    }
  },

  imdb: {
    desc: 'Recherche film/serie OMDb',
    aliases: ['movie'],
    category: 'info',
    usage: '.imdb Inception',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .imdb <titre>')
      const key = process.env.OMDB_API_KEY
      if (!key) return reply('Configure OMDB_API_KEY pour activer .imdb.')
      try {
        const r = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(args.join(' '))}&apikey=${key}`, { timeout: 15000 })
        if (r.data?.Response === 'False') return reply(r.data?.Error || 'Film introuvable.')
        await reply(`${r.data.Title} (${r.data.Year})\nIMDB: ${r.data.imdbRating}\nGenre: ${r.data.Genre}\nActors: ${r.data.Actors}\n\n${r.data.Plot}`)
      } catch (e) { reply('Erreur imdb: ' + e.message) }
    }
  },

  botinfo: {
    desc: 'Informations techniques du bot',
    aliases: ['info', 'specs'],
    category: 'info',
    handler: async (sock, msg, { reply, config }) => {
      const os = require('os')
      const used = Math.round(process.memoryUsage().rss / 1024 / 1024)
      const total = Math.round(os.totalmem() / 1024 / 1024)
      const free = Math.round(os.freemem() / 1024 / 1024)
      const up = Math.floor((Date.now() - (process._botStartTime || Date.now())) / 1000)
      await reply(`${config.botName || 'WaBot'}\nNode: ${process.version}\nPlateforme: ${os.platform()} ${os.arch()}\nRAM bot: ${used} MB\nRAM systeme: ${total - free}/${total} MB\nUptime: ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m\nPID: ${process.pid}`)
    }
  },

  botstats: {
    desc: 'Statistiques d usage du bot',
    aliases: ['stats'],
    category: 'info',
    handler: async (sock, msg, { reply, db }) => {
      const totalActivity = Object.values(db.activity || {}).reduce((acc, day) => {
        for (const g of Object.values(day)) for (const c of Object.values(g)) acc += c
        return acc
      }, 0)
      const totalNotes = Object.values(db.notes || {}).reduce((a, b) => a + b.length, 0)
      const totalTodos = Object.values(db.todos || {}).reduce((a, b) => a + b.length, 0)
      await reply(`Statistiques bot\nMessages traites (7j): ${totalActivity}\nReminders actifs: ${(db.reminders || []).length}\nNotes: ${totalNotes}\nTodos: ${totalTodos}`)
    }
  },

  daily: {
    desc: 'Top 10 du jour dans ce groupe',
    aliases: ['dailystats', 'today'],
    category: 'info',
    groupOnly: true,
    handler: async (sock, msg, { reply, db }) => {
      const stats = db.activity?.[todayKey()]?.[msg.key.remoteJid] || {}
      const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10)
      if (!sorted.length) return reply('Aucune activite aujourd hui.')
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'TOP 10 AUJOURD HUI\n\n' + sorted.map(([num, count], i) => `${i + 1}. @${num} - ${count} messages`).join('\n'),
        mentions: sorted.map(([num]) => num + '@s.whatsapp.net')
      }, { quoted: msg })
    }
  },

  top: {
    desc: 'Top 10 de la semaine',
    aliases: ['leaderboard'],
    category: 'info',
    groupOnly: true,
    handler: async (sock, msg, { reply, db }) => {
      const totals = {}
      for (const d of Object.keys(db.activity || {}).sort().slice(-7)) {
        const dayStats = db.activity[d]?.[msg.key.remoteJid] || {}
        for (const [num, count] of Object.entries(dayStats)) totals[num] = (totals[num] || 0) + count
      }
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10)
      if (!sorted.length) return reply('Aucune activite cette semaine.')
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'LEADERBOARD 7 JOURS\n\n' + sorted.map(([num, count], i) => `${i + 1}. @${num} - ${count} messages`).join('\n'),
        mentions: sorted.map(([num]) => num + '@s.whatsapp.net')
      }, { quoted: msg })
    }
  },

  cmdinfo: {
    desc: 'Explique le role d une commande',
    aliases: ['explain-cmd', 'whatis', 'whatdoes'],
    category: 'info',
    usage: '.cmdinfo <commande>',
    handler: async (sock, msg, { args, reply, commands, prefix }) => {
      if (!args.length) return reply('Usage: .cmdinfo <commande>')
      const name = args[0].toLowerCase().replace(prefix, '')
      let cmd = commands[name]
      if (!cmd) {
        try { cmd = require('../../lib/loader').getCommand(name) } catch {}
      }
      if (!cmd) return reply(`Commande ${name} introuvable.`)
      await reply(`Commande ${prefix}${name}\nDescription: ${cmd.desc || 'Aucune'}\nCategorie: ${cmd.category || 'autres'}\nUsage: ${cmd.usage || prefix + name}${cmd.aliases?.length ? '\nAliases: ' + cmd.aliases.map(a => prefix + a).join(', ') : ''}`)
    }
  },

  webscan: {
    desc: 'Analyser une URL',
    aliases: ['scan', 'urlinfo'],
    category: 'info',
    usage: '.webscan <url>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/^https?:\/\//.test(url)) return reply('Usage: .webscan <url http/https>')
      try {
        const start = Date.now()
        const r = await axios.get(url, { timeout: 15000, maxRedirects: 5, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0 XHRISBot' } })
        const html = String(r.data || '').slice(0, 200000)
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '-'
        const techs = []
        if (/wordpress|wp-content/i.test(html)) techs.push('WordPress')
        if (/__NEXT_DATA__|react/i.test(html)) techs.push('React/Next.js')
        if (/tailwind/i.test(html)) techs.push('Tailwind')
        const sec = ['strict-transport-security', 'x-frame-options', 'content-security-policy'].filter(h => r.headers[h])
        await reply(`Web scan\nURL: ${url}\nStatus: ${r.status}\nTemps: ${Date.now() - start}ms\nTitre: ${title}\nTechnos: ${techs.join(', ') || 'Aucune detectee'}\nSecurite: ${sec.join(', ') || 'Aucun header majeur'}\nHTTPS: ${url.startsWith('https') ? 'oui' : 'non'}`)
      } catch (e) { reply('Erreur scan: ' + e.message) }
    }
  }
}
