function userKey(jid) {
  return jid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
}

module.exports = {
  note: {
    desc: 'Bloc-notes personnel',
    aliases: ['notes', 'memo'],
    category: 'user',
    usage: '.note save <texte> | .note list | .note get <id> | .note del <id>',
    handler: async (sock, msg, { args, reply, sender, db }) => {
      if (!args.length) return reply('Usage: .note save <texte> | list | get <id> | del <id>')
      const action = args.shift().toLowerCase()
      const idUser = userKey(sender)
      db.notes ||= {}
      db.notes[idUser] ||= []

      if (action === 'save') {
        const text = args.join(' ').trim()
        if (!text) return reply('Texte vide.')
        const id = Date.now().toString(36)
        db.notes[idUser].push({ id, text, at: Date.now() })
        return reply(`Note sauvegardee\nID: ${id}`)
      }
      if (action === 'list') {
        const list = db.notes[idUser]
        if (!list.length) return reply('Aucune note.')
        return reply('Tes notes:\n\n' + list.slice(-20).map((n, i) => `${i + 1}. [${n.id}] ${n.text.slice(0, 70)}`).join('\n'))
      }
      if (action === 'get') {
        const n = db.notes[idUser].find(x => x.id === args[0])
        if (!n) return reply('ID introuvable.')
        return reply(`Note ${n.id}\n\n${n.text}`)
      }
      if (action === 'del') {
        const before = db.notes[idUser].length
        db.notes[idUser] = db.notes[idUser].filter(n => n.id !== args[0])
        return reply(db.notes[idUser].length === before ? 'ID introuvable.' : 'Note supprimee.')
      }
      return reply('Action invalide. Utilise save, list, get ou del.')
    }
  },

  todo: {
    desc: 'Liste de taches personnelle',
    aliases: ['tasks', 'task'],
    category: 'user',
    usage: '.todo add <texte> | .todo list | .todo done <id> | .todo del <id>',
    handler: async (sock, msg, { args, reply, sender, db }) => {
      if (!args.length) return reply('Usage: .todo add <texte> | list | done <id> | del <id>')
      const action = args.shift().toLowerCase()
      const idUser = userKey(sender)
      db.todos ||= {}
      db.todos[idUser] ||= []

      if (action === 'add') {
        const text = args.join(' ').trim()
        if (!text) return reply('Texte vide.')
        const id = Date.now().toString(36)
        db.todos[idUser].push({ id, text, done: false, at: Date.now() })
        return reply(`Tache ajoutee\nID: ${id}`)
      }
      if (action === 'list') {
        const list = db.todos[idUser]
        if (!list.length) return reply('Aucune tache.')
        return reply('Tes taches:\n\n' + list.map(t => `${t.done ? '[x]' : '[ ]'} ${t.id} - ${t.text}`).join('\n'))
      }
      const item = db.todos[idUser].find(t => t.id === args[0])
      if (!item) return reply('ID introuvable.')
      if (action === 'done') {
        item.done = true
        return reply('Tache marquee comme faite.')
      }
      if (action === 'del') {
        db.todos[idUser] = db.todos[idUser].filter(t => t.id !== args[0])
        return reply('Tache supprimee.')
      }
      return reply('Action invalide.')
    }
  },

  remind: {
    desc: 'Rappel programme',
    aliases: ['reminder', 'rappel'],
    category: 'user',
    usage: '.remind 30m Message | .remind 18:30 Message',
    handler: async (sock, msg, { args, reply, sender, db }) => {
      if (args.length < 2) return reply('Usage: .remind 30m Boire de l eau | .remind 18:30 Reunion')
      const when = args.shift()
      const message = args.join(' ')
      let triggerAt = 0
      const rel = when.match(/^(\d+)\s*([smhd])$/i)
      const time = when.match(/^(\d{1,2}):(\d{2})$/)
      const iso = when.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const fr = when.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (rel) {
        const v = parseInt(rel[1], 10)
        const u = rel[2].toLowerCase()
        const ms = u === 'd' ? v * 86400000 : u === 'h' ? v * 3600000 : u === 'm' ? v * 60000 : v * 1000
        triggerAt = Date.now() + ms
      } else if (time) {
        const d = new Date()
        d.setHours(parseInt(time[1], 10), parseInt(time[2], 10), 0, 0)
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
        triggerAt = d.getTime()
      } else if (iso || fr) {
        const d = iso ? new Date(`${when}T09:00:00`) : new Date(`${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}T09:00:00`)
        triggerAt = d.getTime()
      } else {
        return reply('Format invalide. Utilise 30m, 1h, 18:30, 2026-12-25.')
      }
      if (triggerAt <= Date.now()) return reply('Date dans le passe.')
      if (triggerAt - Date.now() > 30 * 86400000) return reply('Maximum 30 jours.')
      db.reminders ||= []
      const id = Date.now().toString(36)
      db.reminders.push({ id, userId: sender, chatId: msg.key.remoteJid, message, triggerAt, createdAt: Date.now() })
      await reply(`Rappel programme\n${new Date(triggerAt).toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })}\nID: ${id}`)
    }
  },

  afk: {
    desc: 'Mode absent',
    aliases: ['absent'],
    category: 'user',
    usage: '.afk <raison> | .afk off',
    handler: async (sock, msg, { args, reply, sender, db }) => {
      const idUser = userKey(sender)
      db.afk ||= {}
      if (args[0]?.toLowerCase() === 'off') {
        delete db.afk[idUser]
        return reply('Mode AFK desactive.')
      }
      const reason = args.join(' ') || 'Indisponible'
      db.afk[idUser] = { reason, since: Date.now() }
      await reply(`Mode AFK active\nRaison: ${reason}`)
    }
  }
}
