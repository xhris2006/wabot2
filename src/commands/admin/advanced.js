const { getGroup, setGroup } = require('../../lib/database')

async function toggleFlag(from, key, args, reply, label) {
  const val = args[0]?.toLowerCase()
  if (!['on', 'off'].includes(val)) {
    const gd = await getGroup(from).catch(() => null) || {}
    return reply(`${label}: ${gd[key] ? 'ON' : 'OFF'}\nUsage: .${key} on|off`)
  }
  await setGroup(from, key, val === 'on')
  await reply(`${label} ${val === 'on' ? 'active' : 'desactive'}.`)
}

module.exports = {
  audit: {
    desc: 'Audit complet du groupe',
    aliases: ['groupaudit'],
    category: 'admin',
    groupOnly: true,
    admin: true,
    usage: '.audit',
    handler: async (sock, msg, { reply, groupMeta, participants }) => {
      const gd = await getGroup(msg.key.remoteJid).catch(() => null) || {}
      const admins = participants.filter(p => p.admin)
      const created = groupMeta?.creation ? new Date(groupMeta.creation * 1000).toLocaleDateString('fr-FR') : '-'
      await reply(
        `AUDIT DU GROUPE\n\n` +
        `Nom: ${groupMeta?.subject || '-'}\n` +
        `Membres: ${participants.length}\n` +
        `Admins: ${admins.length}\n` +
        `Cree le: ${created}\n\n` +
        `Protections:\n` +
        `Anti-lien: ${gd.antilink ? 'ON' : 'OFF'}\n` +
        `Anti-spam: ${gd.antispam ? 'ON' : 'OFF'}\n` +
        `Anti-tag: ${gd.antitag ? 'ON' : 'OFF'}\n` +
        `Anti-bot: ${gd.antibot ? 'ON' : 'OFF'}\n` +
        `Anti-fake: ${gd.antifake ? 'ON' : 'OFF'}\n` +
        `Welcome: ${gd.welcome ? 'ON' : 'OFF'}`
      )
    }
  },

  antitag: {
    desc: 'Bloquer les mass-mentions',
    category: 'admin',
    groupOnly: true,
    admin: true,
    usage: '.antitag on|off',
    handler: async (sock, msg, { args, reply }) => toggleFlag(msg.key.remoteJid, 'antitag', args, reply, 'Anti-tag')
  },

  antibot: {
    desc: 'Informer sur les nouveaux comptes suspects/bots',
    category: 'admin',
    groupOnly: true,
    admin: true,
    usage: '.antibot on|off',
    handler: async (sock, msg, { args, reply }) => toggleFlag(msg.key.remoteJid, 'antibot', args, reply, 'Anti-bot')
  },

  antifake: {
    desc: 'Autoriser uniquement certains prefixes',
    category: 'admin',
    groupOnly: true,
    admin: true,
    usage: '.antifake on +237,+225 | .antifake off',
    handler: async (sock, msg, { args, reply }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) {
        const gd = await getGroup(msg.key.remoteJid).catch(() => null) || {}
        return reply(`Anti-fake: ${gd.antifake ? 'ON' : 'OFF'}\nPrefixes: ${gd.antifake_prefixes || '-'}\nUsage: .antifake on +237,+225 | .antifake off`)
      }
      await setGroup(msg.key.remoteJid, 'antifake', val === 'on')
      if (val === 'on' && args[1]) await setGroup(msg.key.remoteJid, 'antifake_prefixes', args.slice(1).join('').replace(/\s/g, ''))
      await reply(`Anti-fake ${val === 'on' ? 'active' : 'desactive'}.`)
    }
  },

  purgefake: {
    desc: 'Expulser les membres hors prefixes autorises',
    category: 'admin',
    groupOnly: true,
    admin: true,
    botAdmin: true,
    usage: '.purgefake +237,+225',
    handler: async (sock, msg, { args, reply, participants }) => {
      const prefixes = (args.join('') || '').split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean)
      if (!prefixes.length) return reply('Usage: .purgefake +237,+225')
      const targets = participants.filter(p => !p.admin).filter(p => {
        const num = p.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        return num && !prefixes.some(pre => num.startsWith(pre))
      }).map(p => p.id)
      if (!targets.length) return reply('Aucun membre fake detecte.')
      await reply(`Purge de ${targets.length} membre(s)...`)
      let done = 0
      for (const jid of targets) {
        try {
          await sock.groupParticipantsUpdate(msg.key.remoteJid, [jid], 'remove')
          done++
          await new Promise(r => setTimeout(r, 800))
        } catch {}
      }
      await reply(`${done}/${targets.length} membres expulses.`)
    }
  }
}
