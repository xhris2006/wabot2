module.exports = {
  purge: {
    desc: 'Supprimer les derniers messages du bot si possible',
    category: 'admin',
    groupOnly: true,
    admin: true,
    botAdmin: true,
    usage: '.purge',
    handler: async (sock, msg, { reply }) => {
      try {
        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key })
        await reply('Purge demandee. Pour supprimer un message precis, reponds avec .del.')
      } catch (e) { reply('Erreur purge: ' + e.message) }
    }
  },

  tag: {
    desc: 'Mentionner tout le monde avec un message silencieux',
    aliases: ['taggroup', 'tagall'],
    category: 'group',
    groupOnly: true,
    admin: true,
    usage: '.tag <message>',
    handler: async (sock, msg, { args, participants }) => {
      const text = args.join(' ') || 'Attention tout le monde.'
      await sock.sendMessage(msg.key.remoteJid, { text, mentions: participants.map(p => p.id) }, { quoted: msg })
    }
  }
}
