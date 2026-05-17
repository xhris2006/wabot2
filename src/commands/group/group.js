const { reply, normalizeJid } = require('../../lib/utils')
const { setGroup, getGroup, addWarn, getWarns, resetWarns } = require('../../lib/database')

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveJid(jid, participants) {
  // Trouve le @s.whatsapp.net correspondant à un @lid ou un JID quelconque
  if (!jid) return null
  const base = jid.split(':')[0].split('@')[0]
  // Essai 1 : correspondance directe normalisée
  const direct = participants.find(p => p.id.split(':')[0].split('@')[0] === base)
  if (direct) return direct.id
  // Essai 2 : par numéro de téléphone
  const byPhone = participants.find(p => p.id.split('@')[0].replace(/\D/g, '') === base.replace(/\D/g, '') && p.id.endsWith('@s.whatsapp.net'))
  return byPhone?.id || jid
}

function isAdminInParts(participants, jid) {
  if (!jid || !participants?.length) return false
  const base = jid.split(':')[0].split('@')[0]
  const found = participants.find(p => p.id.split(':')[0].split('@')[0] === base)
  return !!(found?.admin)
}

// Résoudre la cible depuis mention OU reply
function resolveTarget(msg, participants) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
  if (mentioned.length) return { jid: mentioned[0], source: 'mention' }

  const ctx = msg.message?.extendedTextMessage?.contextInfo
  if (ctx?.participant) return { jid: ctx.participant, source: 'reply' }

  return null
}

module.exports = [

  // ─── KICK ─────────────────────────────────────────────────────────────────
  {
    name: 'kick',
    aliases: ['remove', 'virer'],
    category: 'group',
    desc: 'Expulser un membre (mention ou reply)',
    usage: '.kick @membre | .kick (reply)',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, participants, isSudo }) => {
      const targets = []

      // Mentions
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      for (const j of mentioned) targets.push(j)

      // Reply (si pas de mention)
      if (!targets.length) {
        const ctx = msg.message?.extendedTextMessage?.contextInfo
        if (ctx?.participant) targets.push(ctx.participant)
      }

      if (!targets.length) return reply(sock, msg, '❌ Mentionne un membre ou réponds à son message.\nEx: .kick @membre')

      for (const jid of targets) {
        if (isAdminInParts(participants, jid) && !isSudo) {
          await sock.sendMessage(from, { text: `⚠️ Je ne peux pas expulser @${jid.split('@')[0]} — il/elle est admin.`, mentions: [jid] })
          continue
        }
        const kickJid = resolveJid(jid, participants)
        try {
          await sock.groupParticipantsUpdate(from, [kickJid], 'remove')
          await sock.sendMessage(from, { text: `✅ @${jid.split('@')[0]} a été expulsé(e).`, mentions: [jid] })
        } catch (e) {
          await reply(sock, msg, `❌ Impossible d'expulser: ${e.message}`)
        }
      }
    }
  },

  // ─── KICKALL ──────────────────────────────────────────────────────────────
  {
    name: 'kickall',
    aliases: ['vireretout', 'removeall'],
    category: 'group',
    desc: 'Expulser tous les membres non-admin',
    usage: '.kickall',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, participants, isSudo, isOwner }) => {
      if (!isSudo && !isOwner) return reply(sock, msg, '❌ Réservé au propriétaire du bot.')

      const toKick = participants.filter(p =>
        !p.admin &&
        p.id.split(':')[0].split('@')[0] !== (sock.user?.id || '').split(':')[0].split('@')[0]
      )

      if (!toKick.length) return reply(sock, msg, '✅ Plus aucun membre non-admin dans le groupe.')

      await reply(sock, msg, `🚫 Expulsion de *${toKick.length}* membres en cours...`)

      let count = 0
      for (const p of toKick) {
        const kickJid = resolveJid(p.id, participants)
        try {
          await sock.groupParticipantsUpdate(from, [kickJid], 'remove')
          count++
          await new Promise(r => setTimeout(r, 800)) // éviter rate-limit
        } catch {}
      }

      await sock.sendMessage(from, { text: `✅ *${count}/${toKick.length}* membres expulsés.\nSeuls les admins restent.` })
    }
  },

  // ─── KICKALL2 ─────────────────────────────────────────────────────────────
  {
    name: 'kickall2',
    aliases: ['nukegroup', 'cleargroup'],
    category: 'group',
    desc: 'Expulser TOUS les membres (admins inclus)',
    usage: '.kickall2',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, participants, isSudo, isOwner }) => {
      if (!isSudo && !isOwner) return reply(sock, msg, '❌ Réservé au propriétaire du bot.')

      const botBase = (sock.user?.id || '').split(':')[0].split('@')[0]
      const toKick = participants.filter(p => p.id.split(':')[0].split('@')[0] !== botBase)

      if (!toKick.length) return reply(sock, msg, '✅ Plus personne à expulser.')

      await reply(sock, msg, `⚠️ *NUKE* — Expulsion de *${toKick.length}* membres (admins inclus)...`)

      // D'abord rétrograder les admins (sauf le bot lui-même)
      const admins = toKick.filter(p => p.admin && p.id.split(':')[0].split('@')[0] !== botBase)
      for (const p of admins) {
        const j = resolveJid(p.id, participants)
        await sock.groupParticipantsUpdate(from, [j], 'demote').catch(() => {})
        await new Promise(r => setTimeout(r, 400))
      }

      // Puis expulser tout le monde
      let count = 0
      for (const p of toKick) {
        const j = resolveJid(p.id, participants)
        try {
          await sock.groupParticipantsUpdate(from, [j], 'remove')
          count++
          await new Promise(r => setTimeout(r, 800))
        } catch {}
      }

      await sock.sendMessage(from, { text: `✅ *${count}/${toKick.length}* membres expulsés (admins inclus).` })
    }
  },

  // ─── ADD ──────────────────────────────────────────────────────────────────
  {
    name: 'add',
    aliases: ['ajouter'],
    category: 'group',
    desc: 'Ajouter un membre au groupe',
    usage: '.add 237XXXXXXXXX',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, args }) => {
      // Accepter aussi un numéro en reply (si la personne n'est pas encore dans le groupe)
      const ctx = msg.message?.extendedTextMessage?.contextInfo
      if (!args.length && !ctx?.participant) return reply(sock, msg, '❌ Donne un numéro ou réponds à un message.\nEx: .add 237690000000')

      const targets = [...args]
      if (!targets.length && ctx?.participant) {
        targets.push(ctx.participant.split('@')[0].split(':')[0])
      }
      if (!targets.length) return reply(sock, msg, '❌ Donne un numéro.')
      const args_fixed = targets
      for (const num of args_fixed) {
        const clean = num.replace(/\D/g, '')
        if (!clean) continue
        const jid = `${clean}@s.whatsapp.net`
        try {
          const result = await sock.groupParticipantsUpdate(from, [jid], 'add')
          const status = result?.[0]?.status
          if (status === 200 || status === '200') {
            await sock.sendMessage(from, { text: `✅ @${clean} ajouté !`, mentions: [jid] })
          } else if (status === 403) {
            await reply(sock, msg, `❌ ${clean} a désactivé l'ajout aux groupes.`)
          } else {
            await reply(sock, msg, `⚠️ Résultat pour ${clean}: ${status}`)
          }
        } catch (e) {
          await reply(sock, msg, `❌ Erreur: ${e.message}`)
        }
      }
    }
  },

  // ─── PROMOTE ──────────────────────────────────────────────────────────────
  {
    name: 'promote',
    aliases: ['nommer'],
    category: 'group',
    desc: 'Promouvoir en admin (mention ou reply)',
    usage: '.promote @membre | .promote (reply)',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, participants }) => {
      const target = resolveTarget(msg, participants)
      if (!target) return reply(sock, msg, '❌ Mentionne un membre ou réponds à son message.')
      const j = resolveJid(target.jid, participants)
      try {
        await sock.groupParticipantsUpdate(from, [j], 'promote')
        await sock.sendMessage(from, { text: `⬆️ @${target.jid.split('@')[0]} est maintenant *admin* !`, mentions: [target.jid] })
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── DEMOTE ───────────────────────────────────────────────────────────────
  {
    name: 'demote',
    aliases: ['deadmin'],
    category: 'group',
    desc: 'Retirer les droits admin (mention ou reply)',
    usage: '.demote @membre | .demote (reply)',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, participants }) => {
      const target = resolveTarget(msg, participants)
      if (!target) return reply(sock, msg, '❌ Mentionne un membre ou réponds à son message.')
      const j = resolveJid(target.jid, participants)
      try {
        await sock.groupParticipantsUpdate(from, [j], 'demote')
        await sock.sendMessage(from, { text: `⬇️ @${target.jid.split('@')[0]} n'est plus *admin*.`, mentions: [target.jid] })
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── WARN ─────────────────────────────────────────────────────────────────
  {
    name: 'warn',
    category: 'group',
    desc: 'Avertir un membre (mention ou reply) — 3 warns = kick',
    usage: '.warn @membre [raison] | .warn (reply) [raison]',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, args, participants }) => {
      const target = resolveTarget(msg, participants)
      if (!target) return reply(sock, msg, '❌ Mentionne un membre ou réponds à son message.')

      const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3')
      const reason = args.filter(a => !a.startsWith('@')).join(' ') || 'Aucune raison précisée'
      const jid = target.jid
      const count = await addWarn(jid, from, reason)

      if (count >= WARN_LIMIT) {
        const j = resolveJid(jid, participants)
        await sock.groupParticipantsUpdate(from, [j], 'remove').catch(() => {})
        await sock.sendMessage(from, {
          text: `🚫 @${jid.split('@')[0]} a atteint *${WARN_LIMIT} avertissements* → expulsé(e).\nRaison: ${reason}`,
          mentions: [jid]
        })
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ @${jid.split('@')[0]} — Avertissement *${count}/${WARN_LIMIT}*\nRaison: ${reason}`,
          mentions: [jid]
        })
      }
    }
  },

  // ─── RESETWARN ────────────────────────────────────────────────────────────
  {
    name: 'resetwarn',
    aliases: ['clearwarn'],
    category: 'group',
    desc: 'Réinitialiser les avertissements (mention ou reply)',
    usage: '.resetwarn @membre | .resetwarn (reply)',
    group: true, admin: true,
    execute: async ({ sock, msg, from, participants }) => {
      const target = resolveTarget(msg, participants)
      if (!target) return reply(sock, msg, '❌ Mentionne un membre ou réponds à son message.')
      await resetWarns(target.jid, from)
      await sock.sendMessage(from, {
        text: `✅ Avertissements de @${target.jid.split('@')[0]} réinitialisés.`,
        mentions: [target.jid]
      })
    }
  },

  // ─── WARNLIST ─────────────────────────────────────────────────────────────
  {
    name: 'warnlist',
    aliases: ['warns'],
    category: 'group',
    desc: 'Voir les avertissements (mention ou reply)',
    usage: '.warnlist @membre | .warnlist (reply)',
    group: true, admin: true,
    execute: async ({ sock, msg, from, participants }) => {
      const target = resolveTarget(msg, participants)
      if (!target) return reply(sock, msg, '❌ Mentionne un membre ou réponds à son message.')
      const count = await getWarns(target.jid, from)
      const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3')
      await sock.sendMessage(from, {
        text: `⚠️ @${target.jid.split('@')[0]} — *${count}/${WARN_LIMIT}* avertissements`,
        mentions: [target.jid]
      })
    }
  },

  // ─── LINK ─────────────────────────────────────────────────────────────────
  {
    name: 'link',
    aliases: ['invitelink', 'lien'],
    category: 'group',
    desc: "Obtenir le lien d'invitation",
    usage: '.link',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from }) => {
      try {
        const code = await sock.groupInviteCode(from)
        await reply(sock, msg, `🔗 *Lien d'invitation:*\n\nhttps://chat.whatsapp.com/${code}`)
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── REVOKE (ex-resetlink) ────────────────────────────────────────────────
  {
    name: 'revoke',
    aliases: ['resetlink', 'resetinvite', 'newlink'],
    category: 'group',
    desc: "Réinitialiser le lien d'invitation",
    usage: '.revoke',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from }) => {
      try {
        await sock.groupRevokeInvite(from)
        const code = await sock.groupInviteCode(from)
        await reply(sock, msg, `✅ Lien réinitialisé !\n\nhttps://chat.whatsapp.com/${code}`)
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── TAKEOVER ─────────────────────────────────────────────────────────────
  {
    name: 'takeover',
    aliases: ['demoteall', 'overlord'],
    category: 'group',
    desc: 'Démettre TOUS les autres admins du groupe',
    usage: '.takeover',
    group: true, botAdmin: true,
    execute: async ({ sock, msg, from, sender, isOwner, isSudo, participants }) => {
      if (!isOwner && !isSudo) {
        return reply(sock, msg, '👑 Seul le propriétaire peut utiliser .takeover.')
      }
      const senderNum = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
      const botNum    = sock.user?.id?.split(':')[0].split('@')[0].replace(/[^0-9]/g, '') || ''

      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      const targets = admins.filter(p => {
        const pNum = p.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        return pNum !== senderNum && pNum !== botNum
      })

      if (!targets.length) return reply(sock, msg, 'ℹ️ Aucun autre admin à démettre.')

      await reply(sock, msg, `⚠️ Démission de ${targets.length} admin(s) en cours...`)

      let demoted = 0
      let superadminFailed = false
      const failedNums = []

      for (const t of targets) {
        try {
          await sock.groupParticipantsUpdate(from, [t.id], 'demote')
          demoted++
        } catch (e) {
          const num = t.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
          failedNums.push('+' + num)
          if (t.admin === 'superadmin') superadminFailed = true
        }
      }

      let txt = `✅ ${demoted}/${targets.length} admin(s) démis.`
      if (failedNums.length) txt += `\n\n❌ Échec sur : ${failedNums.join(', ')}`
      if (superadminFailed) {
        txt += `\n\n⚠️ *Le créateur du groupe ne peut pas être démis* (protection WhatsApp).\n💡 Utilise *.clone* pour créer un nouveau groupe dont TU es le créateur.`
      }
      await reply(sock, msg, txt)
    }
  },

  // ─── SETNAME ──────────────────────────────────────────────────────────────
  {
    name: 'setname',
    aliases: ['rename'],
    category: 'group',
    desc: 'Changer le nom du groupe',
    usage: '.setname Nouveau Nom',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Donne un nouveau nom.')
      try {
        await sock.groupUpdateSubject(from, args.join(' '))
        await reply(sock, msg, `✅ Nom changé en *${args.join(' ')}*`)
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── SETDESC ──────────────────────────────────────────────────────────────
  {
    name: 'setdesc',
    aliases: ['description'],
    category: 'group',
    desc: 'Changer la description du groupe',
    usage: '.setdesc Nouvelle description',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Donne une description.')
      try {
        await sock.groupUpdateDescription(from, args.join(' '))
        await reply(sock, msg, '✅ Description mise à jour !')
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── SETGROUPPP ───────────────────────────────────────────────────────────
  {
    name: 'setgrouppp',
    aliases: ['setgroupphoto', 'groupphoto'],
    category: 'group',
    desc: 'Changer la photo du groupe',
    usage: '.setgrouppp [image jointe ou reply]',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from }) => {
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const fs = require('fs-extra')

        const isDirectImage = !!msg.message?.imageMessage
        const quotedImg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
        if (!isDirectImage && !quotedImg) return reply(sock, msg, '❌ Envoie une image avec la commande ou réponds à une image.')

        const targetMsg = isDirectImage ? msg : {
          key: { remoteJid: from },
          message: msg.message.extendedTextMessage.contextInfo.quotedMessage
        }
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: { info: () => {}, error: () => {} } })
        await sock.updateProfilePicture(from, buffer)
        await reply(sock, msg, '✅ Photo du groupe mise à jour !')
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── MUTE / OPEN ──────────────────────────────────────────────────────────
  {
    name: 'mute',
    aliases: ['fermer', 'lock'],
    category: 'group',
    desc: 'Fermer le groupe (seuls les admins)',
    usage: '.mute',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from }) => {
      try {
        await sock.groupSettingUpdate(from, 'announcement')
        await setGroup(from, 'mute', true)
        await reply(sock, msg, '🔒 Groupe fermé.')
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  {
    name: 'open',
    aliases: ['ouvrir', 'unlock'],
    category: 'group',
    desc: 'Ouvrir le groupe (tout le monde)',
    usage: '.open',
    group: true, admin: true, botAdmin: true,
    execute: async ({ sock, msg, from }) => {
      try {
        await sock.groupSettingUpdate(from, 'not_announcement')
        await setGroup(from, 'mute', false)
        await reply(sock, msg, '🔓 Groupe ouvert.')
      } catch (e) { await reply(sock, msg, `❌ Erreur: ${e.message}`) }
    }
  },

  // ─── TAGALL / HIDETAG ─────────────────────────────────────────────────────
  {
    name: 'tagall',
    aliases: ['mentionall', 'everyone'],
    category: 'group',
    desc: 'Mentionner tous les membres',
    usage: '.tagall [message]',
    group: true, admin: true,
    execute: async ({ sock, msg, from, participants, args }) => {
      const text = args.join(' ') || '📢 Attention tout le monde !'
      const mentions = participants.map(p => p.id)
      const list = participants.map(p => `• @${p.id.split('@')[0]}`).join('\n')
      await sock.sendMessage(from, { text: `${text}\n\n${list}`, mentions })
    }
  },

  {
    name: 'hidetag',
    aliases: ['hd', 'silentall'],
    category: 'group',
    desc: 'Mentionner tout le monde silencieusement',
    usage: '.hidetag [message]',
    group: true, admin: true,
    execute: async ({ sock, msg, from, participants, args }) => {
      const mentions = participants.map(p => p.id)
      await sock.sendMessage(from, { text: args.join(' ') || '📢', mentions })
    }
  },

  // ─── GROUPINFO / ADMINLIST / MEMBERLIST ───────────────────────────────────
  {
    name: 'groupinfo',
    aliases: ['ginfo'],
    category: 'group',
    desc: 'Informations du groupe',
    usage: '.groupinfo',
    group: true,
    execute: async ({ sock, msg, from, groupMeta, participants }) => {
      const admins = participants.filter(p => p.admin)
      const created = groupMeta.creation ? new Date(groupMeta.creation * 1000).toLocaleDateString('fr-FR') : '—'
      await reply(sock, msg,
        `╔══ 📋 *INFO GROUPE* ══╗\n` +
        `║ 📛 ${groupMeta.subject}\n` +
        `║ 👥 Membres: *${participants.length}*\n` +
        `║ 👑 Admins: *${admins.length}*\n` +
        `║ 📅 Créé le: ${created}\n` +
        `╚══════════════════════╝`)
    }
  },

  {
    name: 'adminlist',
    aliases: ['admins'],
    category: 'group',
    desc: 'Lister les admins',
    usage: '.adminlist',
    group: true,
    execute: async ({ sock, msg, from, participants }) => {
      const admins = participants.filter(p => p.admin)
      if (!admins.length) return reply(sock, msg, '❌ Aucun admin trouvé.')
      const mentions = admins.map(a => a.id)
      const list = admins.map((a, i) => `${i + 1}. @${a.id.split('@')[0]}${a.admin === 'superadmin' ? ' 👑' : ''}`).join('\n')
      await sock.sendMessage(from, { text: `👑 *Admins (${admins.length}):*\n\n${list}`, mentions })
    }
  },

  {
    name: 'memberlist',
    aliases: ['members'],
    category: 'group',
    desc: 'Lister tous les membres',
    usage: '.memberlist',
    group: true,
    execute: async ({ sock, msg, from, participants }) => {
      const mentions = participants.map(p => p.id)
      const list = participants.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}${p.admin ? ' 👑' : ''}`).join('\n')
      await sock.sendMessage(from, { text: `👥 *Membres (${participants.length}):*\n\n${list}`, mentions })
    }
  },

  // ─── ANTILINK ─────────────────────────────────────────────────────────────
  {
    name: 'antilink',
    category: 'group',
    desc: 'Antilink: on|off — action: warn|kick (défaut: warn)',
    usage: '.antilink on [warn|kick] | .antilink off',
    group: true, admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) return reply(sock, msg, '❌ Usage: .antilink on [warn|kick] | .antilink off')
      const action = args[1]?.toLowerCase() === 'kick' ? 'kick' : 'warn'
      if (val === 'on') {
        await setGroup(from, 'antilink', true)
        await setGroup(from, 'antilink_action', action)
        await reply(sock, msg, `🔗 Antilink *activé* — action: *${action}*`)
      } else {
        await setGroup(from, 'antilink', false)
        await reply(sock, msg, '🔗 Antilink *désactivé*.')
      }
    }
  },

  // ─── ANTISPAM ─────────────────────────────────────────────────────────────
  {
    name: 'antispam',
    category: 'group',
    desc: 'Antispam: on|off — action: warn|kick (défaut: warn)',
    usage: '.antispam on [warn|kick] | .antispam off',
    group: true, admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) return reply(sock, msg, '❌ Usage: .antispam on [warn|kick] | .antispam off')
      const action = args[1]?.toLowerCase() === 'kick' ? 'kick' : 'warn'
      if (val === 'on') {
        await setGroup(from, 'antispam', true)
        await setGroup(from, 'antispam_action', action)
        await reply(sock, msg, `🛡️ Antispam *activé* — action: *${action}*`)
      } else {
        await setGroup(from, 'antispam', false)
        await reply(sock, msg, '🛡️ Antispam *désactivé*.')
      }
    }
  },

  // ─── GROUPSTAT ────────────────────────────────────────────────────────────
  {
    name: 'groupstat',
    aliases: ['gstat'],
    category: 'group',
    desc: 'Statistiques du groupe',
    usage: '.groupstat',
    group: true, admin: true,
    execute: async ({ sock, msg, from, participants }) => {
      const groupData = await getGroup(from).catch(() => null) || {}
      const admins = participants.filter(p => p.admin)
      await reply(sock, msg,
        `📊 *Paramètres du groupe*\n─────────────────────\n` +
        `👥 Membres: *${participants.length}*\n` +
        `👑 Admins: *${admins.length}*\n` +
        `🔗 Antilink: ${groupData.antilink ? `✅ ON (${groupData.antilink_action || 'warn'})` : '❌ OFF'}\n` +
        `🛡️ Antispam: ${groupData.antispam ? `✅ ON (${groupData.antispam_action || 'warn'})` : '❌ OFF'}\n` +
        `👋 Welcome: ${groupData.welcome ? '✅ ON' : '❌ OFF'}\n` +
        `🔒 Mute: ${groupData.mute ? '✅ ON' : '❌ OFF'}`)
    }
  },

  // ─── WELCOME ──────────────────────────────────────────────────────────────
  {
    name: 'welcome',
    category: 'group',
    desc: 'Activer/désactiver le message de bienvenue',
    usage: '.welcome on|off',
    group: true, admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) return reply(sock, msg, '❌ Usage: .welcome on|off')
      await setGroup(from, 'welcome', val === 'on')
      await reply(sock, msg, val === 'on' ? '👋 Welcome *activé*.' : '👋 Welcome *désactivé*.')
    }
  },

  // ─── LEAVE ────────────────────────────────────────────────────────────────
  {
    name: 'leave',
    aliases: ['quitter'],
    category: 'group',
    desc: 'Faire quitter le bot du groupe',
    usage: '.leave',
    group: true, sudo: true,
    execute: async ({ sock, msg, from }) => {
      await reply(sock, msg, '👋 Au revoir !')
      await sock.groupLeave(from)
    }
  },

  // ─── TAG — Mention silencieuse ────────────────────────────────────────────
  {
    name: 'tag',
    aliases: ['hidetag', 'silent'],
    category: 'group',
    desc: 'Mentionne tout le monde avec un texte ou message cité',
    usage: '.tag [texte] OU reply + .tag',
    group: true, admin: true,
    execute: async ({ sock, msg, from, args, participants, quoted }) => {
      const mentions = participants.map(p => p.id)

      // Cas 1 : reply à un message
      if (quoted) {
        const m = quoted.message
        const text = m?.conversation || m?.extendedTextMessage?.text || ''
        if (text) {
          await sock.sendMessage(from, { text, mentions })
        } else if (m?.imageMessage) {
          const { downloadMediaMessage } = require('@whiskeysockets/baileys')
          const buf = await downloadMediaMessage(quoted, 'buffer', {}, { logger: { info: () => {}, error: () => {} } })
          await sock.sendMessage(from, { image: buf, caption: m.imageMessage.caption || '', mentions })
        } else if (m?.videoMessage) {
          const { downloadMediaMessage } = require('@whiskeysockets/baileys')
          const buf = await downloadMediaMessage(quoted, 'buffer', {}, { logger: { info: () => {}, error: () => {} } })
          await sock.sendMessage(from, { video: buf, caption: m.videoMessage.caption || '', mentions })
        } else {
          await sock.sendMessage(from, { text: '📣', mentions })
        }
        return
      }

      // Cas 2 : texte passé en args
      const text = args.join(' ') || '📣 Attention tout le monde !'
      await sock.sendMessage(from, { text, mentions })
    }
  },

  // ─── RESEND — Renvoyer un message cité ────────────────────────────────────
  {
    name: 'resend',
    aliases: ['repost'],
    category: 'group',
    desc: 'Renvoyer un message cité (reply)',
    usage: '.resend (reply)',
    execute: async ({ sock, msg, from, quoted }) => {
      if (!quoted?.message) return reply(sock, msg, '❌ Réponds à un message à renvoyer.')
      try {
        const m      = quoted.message
        const target = from
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const dlOpts = { logger: { info: () => {}, error: () => {} } }
        if (m.conversation || m.extendedTextMessage) {
          await sock.sendMessage(target, { text: m.conversation || m.extendedTextMessage.text })
        } else if (m.imageMessage) {
          const buf = await downloadMediaMessage(quoted, 'buffer', {}, dlOpts)
          await sock.sendMessage(target, { image: buf, caption: m.imageMessage.caption || '' })
        } else if (m.videoMessage) {
          const buf = await downloadMediaMessage(quoted, 'buffer', {}, dlOpts)
          await sock.sendMessage(target, { video: buf, caption: m.videoMessage.caption || '' })
        } else if (m.audioMessage) {
          const buf = await downloadMediaMessage(quoted, 'buffer', {}, dlOpts)
          await sock.sendMessage(target, { audio: buf, mimetype: 'audio/mp4' })
        } else if (m.stickerMessage) {
          const buf = await downloadMediaMessage(quoted, 'buffer', {}, dlOpts)
          await sock.sendMessage(target, { sticker: buf })
        } else {
          reply(sock, msg, '❌ Type de message non supporté pour .resend.')
        }
      } catch (e) { reply(sock, msg, '❌ Erreur: ' + e.message) }
    }
  },

  // ─── KICKALL ─────────────────────────────────────────────────────────────
  {
    name: 'kickall',
    aliases: ['cleanall', 'purgeall'],
    category: 'group',
    desc: 'KICK tout le monde sauf toi et le propriétaire',
    usage: '.kickall',
    group: true, botAdmin: true,
    execute: async ({ sock, msg, from, sender, isOwner, isSudo, participants }) => {
      if (!isOwner && !isSudo) return reply(sock, msg, '👑 Seul le propriétaire peut utiliser .kickall.')
      const senderNum  = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
      const botNum     = sock.user?.id?.split(':')[0].split('@')[0].replace(/[^0-9]/g, '') || ''
      const envOwner   = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '')
      const protected_ = [senderNum, botNum, envOwner].filter(Boolean)
      const targets    = participants.filter(p => {
        const pNum = p.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        return pNum && !protected_.includes(pNum)
      }).map(p => p.id)
      if (!targets.length) return reply(sock, msg, 'ℹ️ Aucune cible.')
      await reply(sock, msg, `🚪 *KICKALL — ${targets.length} membres*\n\nKick par lots de 5...`)
      let kicked = 0, failed = 0
      for (let i = 0; i < targets.length; i += 5) {
        const batch = targets.slice(i, i + 5)
        try { await sock.groupParticipantsUpdate(from, batch, 'remove'); kicked += batch.length }
        catch { failed += batch.length }
        await new Promise(r => setTimeout(r, 1500))
      }
      await reply(sock, msg,
        `✅ *KICKALL TERMINÉ*\n\n🚪 Expulsés: ${kicked}/${targets.length}` +
        (failed ? `\n❌ Échecs: ${failed}` : '') +
        `\n\n_Le bot doit être admin. Le créateur (superadmin) ne peut être kick._`
      )
    }
  },

  // ─── KICKALL2 — DEMOTE puis KICK ─────────────────────────────────────────
  {
    name: 'kickall2',
    aliases: ['demotekick', 'forcedclean'],
    category: 'group',
    desc: 'DEMOTE tous les admins puis KICK tout le monde',
    usage: '.kickall2',
    group: true, botAdmin: true,
    execute: async ({ sock, msg, from, sender, isOwner, isSudo, participants }) => {
      if (!isOwner && !isSudo) return reply(sock, msg, '👑 Seul le propriétaire peut utiliser .kickall2.')
      const senderNum  = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
      const botNum     = sock.user?.id?.split(':')[0].split('@')[0].replace(/[^0-9]/g, '') || ''
      const envOwner   = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '')
      const protected_ = [senderNum, botNum, envOwner].filter(Boolean)
      const targets    = participants.filter(p => {
        const pNum = p.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        return pNum && !protected_.includes(pNum)
      }).map(p => p.id)
      if (!targets.length) return reply(sock, msg, 'ℹ️ Aucune cible.')
      await reply(sock, msg, `⚠️ *KICKALL2 INITIÉ* — ${targets.length} membres\n\nÉtape 1/2: démission des admins...`)
      const admins = participants.filter(p => (p.admin === 'admin' || p.admin === 'superadmin') && targets.includes(p.id))
      let demoted = 0, superadminFailed = false
      for (const a of admins) {
        try { await sock.groupParticipantsUpdate(from, [a.id], 'demote'); demoted++ }
        catch { if (a.admin === 'superadmin') superadminFailed = true }
        await new Promise(r => setTimeout(r, 300))
      }
      await reply(sock, msg, `Étape 2/2: kick de ${targets.length} membres...`)
      let kicked = 0, kickFailed = 0
      for (let i = 0; i < targets.length; i += 5) {
        const batch = targets.slice(i, i + 5)
        try { await sock.groupParticipantsUpdate(from, batch, 'remove'); kicked += batch.length }
        catch { kickFailed += batch.length }
        await new Promise(r => setTimeout(r, 1500))
      }
      let txt = `✅ *KICKALL2 TERMINÉ*\n\n👑 Démis: ${demoted}/${admins.length}\n🚪 Expulsés: ${kicked}/${targets.length}`
      if (kickFailed) txt += `\n❌ Échecs kick: ${kickFailed}`
      if (superadminFailed) txt += `\n\n⚠️ Le créateur du groupe ne peut être démis (protection WhatsApp).\nUtilise *.clone* pour migrer le groupe.`
      await reply(sock, msg, txt)
    }
  }

]
