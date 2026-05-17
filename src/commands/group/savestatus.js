module.exports = {
  savestatus: {
    desc: 'Sauvegarder un status WhatsApp en reponse',
    aliases: ['savest', 'status'],
    category: 'user',
    usage: '.savestatus en repondant au status',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      if (!quoted?.message) return reply('Reponds a un status image, video ou texte.')
      try {
        const m = quoted.message
        if (m.imageMessage) {
          const buf = await downloadMedia(quoted)
          return sock.sendMessage(msg.key.remoteJid, { image: buf, caption: 'Status sauvegarde' }, { quoted: msg })
        }
        if (m.videoMessage) {
          const buf = await downloadMedia(quoted)
          return sock.sendMessage(msg.key.remoteJid, { video: buf, caption: 'Status sauvegarde' }, { quoted: msg })
        }
        const text = m.conversation || m.extendedTextMessage?.text || ''
        await reply(text ? `Status texte:\n\n${text}` : 'Status non lisible.')
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  viewonce: {
    desc: 'Recuperer une image/video vue unique',
    aliases: ['vv', 'vu'],
    category: 'user',
    usage: '.viewonce en repondant au message',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      if (!quoted) return reply('Reponds a un message vue unique.')
      try {
        const m = quoted.unwrappedMessage || quoted.message
        const real = m.imageMessage || m.videoMessage ? m : (m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m)
        if (!real.imageMessage && !real.videoMessage) return reply('Pas un media vue unique.')
        const buf = await downloadMedia({ ...quoted, message: real })
        if (real.imageMessage) return sock.sendMessage(msg.key.remoteJid, { image: buf, caption: 'Vue unique recuperee' }, { quoted: msg })
        await sock.sendMessage(msg.key.remoteJid, { video: buf, caption: 'Vue unique recuperee' }, { quoted: msg })
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  },

  copygroup: {
    desc: 'Lister les groupes en commun avec un user',
    aliases: ['commongroups'],
    category: 'user',
    usage: '.copygroup @user | reply | numero',
    handler: async (sock, msg, { args, reply, quoted }) => {
      let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      if (!targetJid && quoted) targetJid = quoted.key.participant || quoted.key.remoteJid
      if (!targetJid && args[0]) targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
      if (!targetJid) return reply('Mentionne, reponds ou donne un numero.')
      const num = targetJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
      try {
        const groups = await sock.groupFetchAllParticipating()
        const common = []
        for (const [gJid, g] of Object.entries(groups)) {
          const hasTarget = (g.participants || []).some(p => p.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '') === num)
          if (hasTarget) common.push(g.subject || gJid)
        }
        if (!common.length) return reply(`Aucun groupe commun avec +${num}.`)
        await reply(`Groupes communs avec +${num} (${common.length})\n\n` + common.map((s, i) => `${i + 1}. ${s}`).join('\n'))
      } catch (e) { reply('Erreur: ' + e.message) }
    }
  }
}
