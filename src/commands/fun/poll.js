module.exports = {
  poll: {
    desc: 'Creer un sondage',
    category: 'fun',
    groupOnly: true,
    usage: '.poll Question | option1 | option2',
    handler: async (sock, msg, { args, reply }) => {
      const raw = args.join(' ')
      const parts = raw.split('|').map(x => x.trim()).filter(Boolean)
      if (parts.length < 3) return reply('Usage: .poll Question | option1 | option2')
      const [name, ...values] = parts
      await sock.sendMessage(msg.key.remoteJid, { poll: { name, values: values.slice(0, 12), selectableCount: 1 } }, { quoted: msg })
    }
  },

  match: {
    desc: 'Match aleatoire entre deux membres',
    category: 'fun',
    groupOnly: true,
    handler: async (sock, msg, { participants }) => {
      const members = participants.map(p => p.id).filter(Boolean)
      if (members.length < 2) return sock.sendMessage(msg.key.remoteJid, { text: 'Pas assez de membres.' }, { quoted: msg })
      const a = members[Math.floor(Math.random() * members.length)]
      let b = members[Math.floor(Math.random() * members.length)]
      while (b === a) b = members[Math.floor(Math.random() * members.length)]
      const score = Math.floor(Math.random() * 101)
      await sock.sendMessage(msg.key.remoteJid, {
        text: `Match\n@${a.split('@')[0]} + @${b.split('@')[0]} = ${score}%`,
        mentions: [a, b]
      }, { quoted: msg })
    }
  }
}
