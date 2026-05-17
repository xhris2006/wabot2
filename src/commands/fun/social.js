const axios = require('axios')

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function mentioned(msg) { return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [] }

module.exports = {
  roast: {
    desc: 'Roast un user',
    category: 'fun',
    usage: '.roast @user',
    handler: async (sock, msg, { reply }) => {
      const target = mentioned(msg)[0]
      const txt = pick(['Ton Wi-Fi a plus de reflexes que toi.', 'Tu es la preuve que le mode avion existe pour les idees.', 'Meme une mise a jour Windows finit plus vite.', 'Ton charisme est en economie d energie.'])
      if (!target) return reply('Roast: ' + txt)
      await sock.sendMessage(msg.key.remoteJid, { text: `@${target.split('@')[0]} ${txt}`, mentions: [target] }, { quoted: msg })
    }
  },
  fact: {
    desc: 'Fait amusant aleatoire',
    category: 'fun',
    handler: async (sock, msg, { reply }) => {
      try {
        const r = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 8000 })
        await reply(`Le savais-tu ?\n\n${r.data?.text || 'Aucun fait disponible.'}`)
      } catch (e) { reply('Erreur fact: ' + e.message) }
    }
  },
  insult: {
    desc: 'Insulte soft aleatoire',
    category: 'fun',
    handler: async (sock, msg, { reply }) => reply(pick(['Tete de bug non corrige.', 'Champion du hors-sujet.', 'Erreur 404: logique introuvable.', 'Mode brouillon permanent.']))
  },
  couple: {
    desc: 'Choisir un couple aleatoire',
    category: 'fun',
    groupOnly: true,
    handler: async (sock, msg, { participants }) => {
      const list = participants.map(p => p.id)
      const a = pick(list); let b = pick(list)
      while (b === a) b = pick(list)
      await sock.sendMessage(msg.key.remoteJid, { text: `Couple du jour: @${a.split('@')[0]} et @${b.split('@')[0]}`, mentions: [a, b] }, { quoted: msg })
    }
  },
  ship: {
    desc: 'Score de compatibilite',
    category: 'fun',
    handler: async (sock, msg, { reply }) => {
      const ms = mentioned(msg)
      const score = Math.floor(Math.random() * 101)
      if (ms.length >= 2) return sock.sendMessage(msg.key.remoteJid, { text: `Ship: @${ms[0].split('@')[0]} x @${ms[1].split('@')[0]} = ${score}%`, mentions: ms.slice(0, 2) }, { quoted: msg })
      reply(`Compatibilite: ${score}%`)
    }
  },
  brat: {
    desc: 'Image brat style',
    category: 'fun',
    usage: '.brat <texte>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .brat <texte>')
      try {
        const prompt = `lime green square brat album style with black blurry text: ${args.join(' ')}`
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`
        const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 50 * 1024 * 1024 })
        await sock.sendMessage(msg.key.remoteJid, { image: Buffer.from(r.data), caption: args.join(' ') }, { quoted: msg })
      } catch (e) { reply('Erreur brat: ' + e.message) }
    }
  },
  meme: {
    desc: 'Generer un meme simple',
    category: 'fun',
    usage: '.meme top | bottom',
    handler: async (sock, msg, { args, reply }) => {
      const parts = args.join(' ').split('|').map(s => s.trim())
      if (parts.length < 2) return reply('Usage: .meme texte haut | texte bas')
      const url = `https://api.memegen.link/images/drake/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}.png`
      try {
        const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 })
        await sock.sendMessage(msg.key.remoteJid, { image: Buffer.from(r.data), caption: 'Meme' }, { quoted: msg })
      } catch (e) { reply('Erreur meme: ' + e.message) }
    }
  },
  shadow: { desc: 'Texte shadow', category: 'fun', handler: async (sock, msg, { args, reply }) => reply(args.join(' ').split('').map(c => c + '̷').join('') || 'Usage: .shadow texte') },
  emoji: { desc: 'Emoji aleatoire', category: 'fun', handler: async (sock, msg, { reply }) => reply(pick(['😀','😂','🔥','💡','🎯','✨','✅','🚀','❤️','🤝'])) },
  confess: {
    desc: 'Confession anonyme',
    category: 'fun',
    groupOnly: true,
    usage: '.confess <message>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .confess <message>')
      try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }) } catch {}
      await sock.sendMessage(msg.key.remoteJid, { text: `Confession anonyme\n\n"${args.join(' ')}"` })
    }
  },
  ask: {
    desc: 'Question anonyme',
    category: 'fun',
    groupOnly: true,
    usage: '.ask <question>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .ask <question>')
      try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }) } catch {}
      await sock.sendMessage(msg.key.remoteJid, { text: `Question anonyme\n\n${args.join(' ')}` })
    }
  },
  truth: { desc: 'Action ou verite: verite', category: 'fun', handler: async (sock, msg, { reply }) => reply(pick(['Quelle est ta plus grande peur ?', 'Quel secret gardes-tu ?', 'Qui admires-tu ici ?', 'Ton dernier mensonge ?'])) },
  dare: { desc: 'Action ou verite: action', category: 'fun', handler: async (sock, msg, { reply }) => reply(pick(['Envoie un vocal de 10s.', 'Complimente la derniere personne qui a parle.', 'Change ta photo 5 minutes.', 'Ecris sans voyelles pendant 5 minutes.'])) }
}
