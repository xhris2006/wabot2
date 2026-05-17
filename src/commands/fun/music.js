const axios = require('axios')

module.exports = {
  shazam: {
    desc: 'Identifier une musique depuis un audio',
    category: 'fun',
    usage: '.shazam en repondant a un audio',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      const key = process.env.AUDD_API_KEY
      if (!key) return reply('Configure AUDD_API_KEY pour activer .shazam.')
      if (!quoted?.message?.audioMessage) return reply('Reponds a un audio.')
      try {
        const audio = await downloadMedia(quoted)
        const FormData = require('form-data')
        const fd = new FormData()
        fd.append('api_token', key)
        fd.append('file', audio, 'audio.ogg')
        const r = await axios.post('https://api.audd.io/', fd, { headers: fd.getHeaders(), timeout: 30000, maxContentLength: 50 * 1024 * 1024 })
        const x = r.data?.result
        if (!x) return reply('Musique non reconnue.')
        await reply(`Reconnu: ${x.artist} - ${x.title}\nAlbum: ${x.album || '-'}\nLien: ${x.song_link || '-'}`)
      } catch (e) { reply('Erreur shazam: ' + e.message) }
    }
  },

  splay: {
    desc: 'Recherche/play Spotify via YouTube',
    aliases: ['spotifyplay'],
    category: 'fun',
    usage: '.splay <titre>',
    handler: async (sock, msg, { args, reply, commands }) => {
      if (!commands.spotify) return reply('Commande spotify indisponible.')
      return commands.spotify.handler(sock, msg, { args, reply })
    }
  },

  salbum: {
    desc: 'Infos album Spotify',
    category: 'fun',
    usage: '.salbum <url album>',
    handler: async (sock, msg, { args, reply }) => {
      const url = args[0]
      if (!url || !/spotify\.com\/album/.test(url)) return reply('Usage: .salbum <url album Spotify>')
      try {
        const html = (await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } })).data
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(' | Spotify', '') || 'Album Spotify'
        await reply(`${title}\n${url}`)
      } catch (e) { reply('Erreur Spotify: ' + e.message) }
    }
  }
}
