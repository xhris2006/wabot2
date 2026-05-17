const axios = require('axios')

async function xhrisCall(endpoint, method = 'GET', body = null) {
  const apiKey = process.env.XHRIS_API_KEY
  const apiUrl = process.env.XHRIS_API_URL || 'https://api.xhrishost.site/api'
  if (!apiKey) throw new Error('XHRIS_API_KEY non configuree')
  const opts = { method, url: apiUrl + endpoint, timeout: 15000, headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
  if (body) opts.data = body
  return (await axios(opts)).data
}

module.exports = {
  referral: {
    desc: 'Lien de parrainage XHRIS Host',
    aliases: ['ref', 'parrainage'],
    category: 'info',
    handler: async (sock, msg, { reply }) => {
      try {
        const r = await xhrisCall('/coins/referral')
        const code = r.data?.referralCode || r.referralCode || ''
        await reply(`Ton lien de parrainage\n\nhttps://xhrishost.site?ref=${code}\n\n+10 coins par filleul inscrit.`)
      } catch (e) { reply('Erreur XHRIS: ' + e.message) }
    }
  },
  coinhistory: {
    desc: 'Historique coins XHRIS Host',
    aliases: ['chistory', 'txns'],
    category: 'info',
    handler: async (sock, msg, { reply }) => {
      try {
        const r = await xhrisCall('/coins/transactions?limit=10')
        const txs = r.data?.transactions || r.data?.data || r.data || []
        if (!Array.isArray(txs) || !txs.length) return reply('Aucune transaction.')
        await reply('Historique XHRIS\n\n' + txs.map(t => `${t.amount > 0 ? '+' : '-'} ${Math.abs(t.amount || 0)} - ${t.description || t.type || ''}`).join('\n'))
      } catch (e) { reply('Erreur XHRIS: ' + e.message) }
    }
  },
  sharebot: {
    desc: 'Partager ce bot',
    aliases: ['share-bot', 'share'],
    category: 'info',
    handler: async (sock, msg, { reply }) => {
      const botNum = (sock.user?.id || '').split(':')[0].split('@')[0]
      await reply(`Partager ce bot\n\nhttps://wa.me/${botNum}?text=Bonjour%2C+je+veux+utiliser+ton+bot+!`)
    }
  },
  donate: {
    desc: 'Soutenir XHRIS Host',
    aliases: ['donation'],
    category: 'info',
    handler: async (sock, msg, { reply }) => reply('Soutenir XHRIS Host\n\nhttps://xhrishost.site/donate')
  },
  testimony: {
    desc: 'Envoyer un temoignage XHRIS Host',
    aliases: ['avis'],
    category: 'info',
    usage: '.testimony <avis>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .testimony <ton avis>')
      try {
        await xhrisCall('/support/testimony', 'POST', { content: args.join(' ') })
        await reply('Merci pour ton temoignage. Il apparaitra apres validation.')
      } catch (e) { reply('Erreur XHRIS: ' + e.message) }
    }
  }
}
