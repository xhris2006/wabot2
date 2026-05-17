/**
 * commands/info/menu.js — VERSION CORRIGÉE
 *
 * FIXES :
 * - uptime : utilise process._botStartTime (singleton partagé avec owner.js)
 *   → plus de timer qui repart de zéro à chaque appel
 * - menu : affiche aussi les commandes du loader ancien système
 * - help : cherche dans les deux systèmes
 */

// FIX : startTime partagé avec owner.js via process._botStartTime
if (!process._botStartTime) process._botStartTime = Date.now()

module.exports = {

  menu: {
    desc: 'Afficher le menu des commandes',
    category: 'info',
    usage: '.menu ou .menu <categorie>',
    async handler(sock, msg, { args, reply, config, commands }) {
      try {
        // FIX : uptime depuis le vrai démarrage du process
        const up  = Date.now() - process._botStartTime
        const hr  = Math.floor(up / 3600000)
        const min = Math.floor((up % 3600000) / 60000)
        const sec = Math.floor((up % 60000) / 1000)
        const day = Math.floor(hr / 24)
        const uptimeStr = day > 0
          ? `${day}j ${hr % 24}h ${min}m`
          : `${hr}h ${min}m ${sec}s`

        const prefix  = config.prefix || '.'
        const botName = config.botName || 'WhatsApp Bot'
        const botNum  = sock.user?.id
          ? sock.user.id.split(':')[0].split('@')[0]
          : config.ownerNumber || ''

        const category = args[0]?.toLowerCase()

        // ── Fusionner nouvelles commandes + anciennes (loader) ──────────────
        // Nouvelles commandes (commands/) → format { name: { handler, desc, category } }
        // Anciennes commandes (loader)    → format Map { name => { name, desc, category } }
        const allCmds = { ...commands } // nouvelles commandes

        // Ajouter les anciennes si loader disponible
        try {
          const { commands: oldCmds } = require('../../lib/loader')
          for (const [name, cmd] of oldCmds) {
            if (!allCmds[name]) {
              allCmds[name] = {
                desc:     cmd.desc || '',
                category: cmd.category || 'autres',
                usage:    cmd.usage || prefix + name,
                aliases:  cmd.aliases
              }
            }
          }
        } catch {}

        // Grouper par catégorie
        const grouped = {}
        for (const [name, cmd] of Object.entries(allCmds)) {
          // Ignorer les alias (clés qui pointent vers la même commande)
          if (cmd._alias) continue
          const cat = cmd.category || 'autres'
          if (!grouped[cat]) grouped[cat] = []
          grouped[cat].push({ name, desc: cmd.desc || '' })
        }

        const cats = {
          user:     { icon: '👤', label: 'Utilisateur' },
          group:    { icon: '👥', label: 'Groupe' },
          admin:    { icon: '🛡️', label: 'Administration' },
          owner:    { icon: '👑', label: 'Propriétaire' },
          fun:      { icon: '🎉', label: 'Fun' },
          info:     { icon: 'ℹ️',  label: 'Informations' },
          media:    { icon: '🎬', label: 'Média' },
          download: { icon: '⬇️', label: 'Téléchargement' },
          ai:       { icon: '🤖', label: 'Intelligence Artificielle' },
        }

        // ── Catégorie précise ───────────────────────────────────────────────
        if (category && grouped[category]) {
          const cat = cats[category] || { icon: '📂', label: category }
          let txt = `╔══════════════════════╗\n`
          txt += `║ ${cat.icon} ${cat.label.padEnd(18)}║\n`
          txt += `╚══════════════════════╝\n\n`
          grouped[category]
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(cmd => {
              txt += `• *${prefix}${cmd.name}*\n`
              if (cmd.desc) txt += `  ↳ ${cmd.desc}\n`
            })
          txt += `\n_Total: ${grouped[category].length} commandes_`
          return reply(txt)
        }

        // ── Menu principal ──────────────────────────────────────────────────
        const now       = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })
        const totalCmds = Object.values(allCmds).filter(c => !c._alias).length

        let menu = `\`\`\`\n`
        menu += `╔═══════════════════════════╗\n`
        menu += `║  🤖 ${botName.slice(0, 21).padEnd(21)} ║\n`
        menu += `╠═══════════════════════════╣\n`
        menu += `║  📱 +${botNum.padEnd(21)}║\n`
        menu += `║  ⚡ Préfixe : ${prefix.padEnd(14)}║\n`
        menu += `║  ⏱️ Uptime  : ${uptimeStr.padEnd(14)}║\n`
        menu += `║  📋 Cmds   : ${String(totalCmds).padEnd(14)}║\n`
        menu += `╚═══════════════════════════╝\n`
        menu += `\`\`\`\n\n`

        // Sections dans cet ordre
        const catOrder  = ['user', 'group', 'admin', 'fun', 'media', 'ai', 'download', 'info', 'owner']
        const rendered  = new Set()

        for (const catKey of catOrder) {
          if (!grouped[catKey]?.length) continue
          rendered.add(catKey)
          const cat   = cats[catKey] || { icon: '📂', label: catKey }
          const count = grouped[catKey].length
          menu += `${cat.icon} *${cat.label}* _(${count})_\n`
          menu += grouped[catKey]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `  ◦ ${prefix}${c.name}`)
            .join('\n')
          menu += '\n\n'
        }

        // Catégories restantes
        for (const [catKey, cmds] of Object.entries(grouped)) {
          if (rendered.has(catKey) || !cmds.length) continue
          menu += `📂 *${catKey}* _(${cmds.length})_\n`
          menu += cmds.map(c => `  ◦ ${prefix}${c.name}`).join('\n')
          menu += '\n\n'
        }

        menu += `━━━━━━━━━━━━━━━━━━━━━━━\n`
        menu += `💡 *${prefix}menu <catégorie>* → détails\n`
        menu += `💡 *${prefix}help <commande>*  → aide\n`
        menu += `━━━━━━━━━━━━━━━━━━━━━━━\n`
        menu += `_${now}_`

        reply(menu)
      } catch (e) {
        reply('❌ Erreur menu: ' + e.message)
      }
    }
  },

  // ─── HELP ─────────────────────────────────────────────────────────────────
  help: {
    desc: 'Aide détaillée sur une commande',
    category: 'info',
    usage: '.help <commande>',
    async handler(sock, msg, { args, reply, config, commands }) {
      try {
        const prefix = config.prefix || '.'
        const name   = args[0]?.toLowerCase()

        if (!name) {
          return reply(
            `ℹ️ *Aide du bot*\n\n` +
            `Usage: *${prefix}help <commande>*\n` +
            `Ex: ${prefix}help fancy\n\n` +
            `Tape *${prefix}menu* pour voir toutes les commandes.`
          )
        }

        // Chercher dans nouveau système
        let cmd = commands?.[name]
        // Chercher dans ancien système
        if (!cmd) {
          try {
            const { getCommand } = require('../../lib/loader')
            const oldCmd = getCommand(name)
            if (oldCmd) {
              cmd = {
                desc:     oldCmd.desc,
                category: oldCmd.category,
                usage:    oldCmd.usage,
                aliases:  oldCmd.aliases,
                group:    oldCmd.group,
                admin:    oldCmd.admin,
                sudo:     oldCmd.sudo
              }
            }
          } catch {}
        }

        if (!cmd) {
          return reply(`❌ Commande *${prefix}${name}* introuvable.\n\nTape *${prefix}menu* pour voir toutes les commandes.`)
        }

        const catIcons = {
          user: '👤', group: '👥', admin: '🛡️', owner: '👑',
          fun: '🎉', info: 'ℹ️', media: '🎬', download: '⬇️', ai: '🤖'
        }
        const catIcon = catIcons[cmd.category] || '📂'

        let txt = `╔══════════════════════╗\n`
        txt += `║  📖  AIDE COMMANDE   ║\n`
        txt += `╚══════════════════════╝\n\n`
        txt += `🔹 *Commande:* ${prefix}${name}\n`
        txt += `${catIcon} *Catégorie:* ${cmd.category || 'N/A'}\n`
        txt += `📝 *Description:* ${cmd.desc || 'Aucune description'}\n`
        txt += `💡 *Usage:* ${(cmd.usage || prefix + name).replace(/\./g, prefix)}\n`
        if (cmd.ownerOnly || cmd.owner) txt += `👑 *Accès:* Propriétaire uniquement\n`
        if (cmd.sudoOnly  || cmd.sudo)  txt += `🛡️ *Accès:* Sudo uniquement\n`
        if (cmd.groupOnly || cmd.group) txt += `👥 *Accès:* Groupes uniquement\n`
        if (cmd.admin)                  txt += `🔑 *Accès:* Admin groupe requis\n`
        if (cmd.aliases?.length)        txt += `🔗 *Alias:* ${cmd.aliases.map(a => prefix + a).join(', ')}\n`

        reply(txt)
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  }
}
