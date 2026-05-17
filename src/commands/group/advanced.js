const { getGroup } = require('../../lib/database')

module.exports = {
  clone: {
    desc: 'Cloner les infos basiques du groupe',
    aliases: ['clonegroup'],
    category: 'group',
    groupOnly: true,
    admin: true,
    botAdmin: true,
    usage: '.clone',
    handler: async (sock, msg, { reply, groupMeta }) => {
      try {
        const name = `${groupMeta?.subject || 'Groupe'} - clone`
        const desc = groupMeta?.desc || groupMeta?.description || ''
        const created = await sock.groupCreate(name, [])
        const newJid = created?.id || created
        if (desc && newJid) await sock.groupUpdateDescription(newJid, desc).catch(() => {})
        await reply(`Groupe clone cree: ${name}\n${newJid || ''}`)
      } catch (e) {
        reply('Erreur clone: ' + e.message)
      }
    }
  },

  gconfig: {
    desc: 'Voir la configuration du groupe',
    aliases: ['groupconfig'],
    category: 'group',
    groupOnly: true,
    admin: true,
    usage: '.gconfig',
    handler: async (sock, msg, { reply }) => {
      const gd = await getGroup(msg.key.remoteJid).catch(() => null) || {}
      await reply(
        `CONFIG GROUPE\n\n` +
        `.antilink on|off : ${gd.antilink ? 'ON' : 'OFF'}\n` +
        `.antispam on|off : ${gd.antispam ? 'ON' : 'OFF'}\n` +
        `.antitag on|off : ${gd.antitag ? 'ON' : 'OFF'}\n` +
        `.antibot on|off : ${gd.antibot ? 'ON' : 'OFF'}\n` +
        `.antifake on|off : ${gd.antifake ? 'ON' : 'OFF'}\n` +
        `.welcome on|off : ${gd.welcome ? 'ON' : 'OFF'}\n` +
        `.goodbye on|off : ${gd.goodbye ? 'ON' : 'OFF'}`
      )
    }
  }
}
