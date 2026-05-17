/**
 * commands/admin/admin.js — VERSION CORRIGÉE
 *
 * FIXES :
 * - antilink / antispam : la détection se fait maintenant dans handlers/message.js
 *   Ces commandes activent/désactivent uniquement le flag en DB
 * - delete/.del : normalizeJid était bien importé mais le check des permissions
 *   en privé était cassé → corrigé
 */

const { reply, react, isAdmin, normalizeJid } = require('../../lib/utils')
const { addWarn, getWarns, resetWarns, getGroup, setGroup } = require('../../lib/database')

const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3')

module.exports = [

  // ─── WARN ────────────────────────────────────────────────────────────────
  {
    name: 'warn',
    category: 'admin',
    desc: 'Avertir un membre',
    usage: '.warn @membre [raison]',
    group: true,
    admin: true,
    botAdmin: true,
    execute: async ({ sock, msg, from, args }) => {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (!mentioned.length) return reply(sock, msg, '❌ Mentionne un membre.\nEx: .warn @membre raison')

      const reason = args.filter(a => !a.startsWith('@')).join(' ') || 'Aucune raison précisée'
      const jid    = mentioned[0]

      const count = await addWarn(jid, from, reason)
      if (count >= WARN_LIMIT) {
        await sock.groupParticipantsUpdate(from, [jid], 'remove')
        await sock.sendMessage(from, {
          text: `⛔ @${jid.split('@')[0]} a atteint ${WARN_LIMIT} avertissements → *expulsé(e)*.`,
          mentions: [jid]
        })
        await resetWarns(jid, from)
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ *AVERTISSEMENT*\n\n👤 @${jid.split('@')[0]}\n📝 Raison: ${reason}\n🔢 Warns: *${count}/${WARN_LIMIT}*`,
          mentions: [jid]
        }, { quoted: msg })
      }
    }
  },

  // ─── RESETWARN ───────────────────────────────────────────────────────────
  {
    name: 'resetwarn',
    aliases: ['unwarn', 'clearwarn'],
    category: 'admin',
    desc: 'Réinitialiser les avertissements d\'un membre',
    usage: '.resetwarn @membre',
    group: true,
    admin: true,
    execute: async ({ sock, msg, from }) => {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (!mentioned.length) return reply(sock, msg, '❌ Mentionne un membre.')
      await resetWarns(mentioned[0], from)
      await sock.sendMessage(from, {
        text: `✅ Avertissements de @${mentioned[0].split('@')[0]} réinitialisés.`,
        mentions: [mentioned[0]]
      })
    }
  },

  // ─── WARNLIST ────────────────────────────────────────────────────────────
  {
    name: 'warnlist',
    aliases: ['warns'],
    category: 'admin',
    desc: 'Voir les avertissements d\'un membre',
    usage: '.warnlist @membre',
    group: true,
    execute: async ({ sock, msg, from }) => {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (!mentioned.length) return reply(sock, msg, '❌ Mentionne un membre.')
      const data = await getWarns(mentioned[0], from)
      if (!data) return reply(sock, msg, `✅ @${mentioned[0].split('@')[0]} n'a aucun avertissement.`)
      await sock.sendMessage(from, {
        text: `⚠️ Warns de @${mentioned[0].split('@')[0]}: *${data.count}/${WARN_LIMIT}*\n📝 Dernière raison: ${data.reason}`,
        mentions: [mentioned[0]]
      })
    }
  },

  // ─── ANTILINK ────────────────────────────────────────────────────────────
  // FIX : la commande active/désactive le flag. La détection est dans message.js
  {
    name: 'antilink',
    category: 'admin',
    desc: 'Activer/désactiver l\'anti-lien dans le groupe',
    usage: '.antilink on/off',
    group: true,
    admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) {
        const data = await getGroup(from)
        const state = data?.antilink ? '✅ Activé' : '❌ Désactivé'
        return reply(sock, msg, `🔗 *Anti-lien*\nStatut: ${state}\n\nUsage: .antilink on/off`)
      }
      await setGroup(from, 'antilink', val === 'on')
      await reply(sock, msg, `🔗 Anti-lien ${val === 'on' ? '✅ *activé*' : '❌ *désactivé*'}.`)
    }
  },

  // ─── ANTISPAM ────────────────────────────────────────────────────────────
  // FIX : la commande active/désactive le flag. La détection est dans message.js
  {
    name: 'antispam',
    category: 'admin',
    desc: 'Activer/désactiver l\'anti-spam dans le groupe',
    usage: '.antispam on/off',
    group: true,
    admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) {
        const data = await getGroup(from)
        const state = data?.antispam ? '✅ Activé' : '❌ Désactivé'
        return reply(sock, msg, `🛡️ *Anti-spam*\nStatut: ${state}\n\nUsage: .antispam on/off`)
      }
      await setGroup(from, 'antispam', val === 'on')
      await reply(sock, msg, `🛡️ Anti-spam ${val === 'on' ? '✅ *activé*\n5 messages / 5s max.' : '❌ *désactivé*'}.`)
    }
  },

  // ─── WELCOME ─────────────────────────────────────────────────────────────
  {
    name: 'welcome',
    category: 'admin',
    desc: 'Activer le message de bienvenue',
    usage: '.welcome on/off [message perso]',
    group: true,
    admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) return reply(sock, msg, '❌ Usage: .welcome on/off [message]\nVariables: @user @group')
      const customMsg = args.slice(1).join(' ') || 'Bienvenue @user dans *@group* ! 🎉'
      await setGroup(from, 'welcome', val === 'on')
      if (val === 'on') await setGroup(from, 'welcome_msg', customMsg)
      await reply(sock, msg, `👋 Message de bienvenue ${val === 'on' ? `✅ activé\n📝 _${customMsg}_` : '❌ désactivé'}.`)
    }
  },

  // ─── GOODBYE ─────────────────────────────────────────────────────────────
  {
    name: 'goodbye',
    aliases: ['bye'],
    category: 'admin',
    desc: 'Activer le message d\'au revoir',
    usage: '.goodbye on/off',
    group: true,
    admin: true,
    execute: async ({ sock, msg, from, args }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) return reply(sock, msg, '❌ Usage: .goodbye on/off')
      await setGroup(from, 'goodbye', val === 'on')
      await reply(sock, msg, `👋 Message d'au revoir ${val === 'on' ? '✅ activé' : '❌ désactivé'}.`)
    }
  },

  // ─── DELETE ──────────────────────────────────────────────────────────────
  // FIX complet : fonctionne en privé et en groupe
  {
    name: 'delete',
    aliases: ['del', 'sup'],
    category: 'admin',
    desc: 'Supprimer un message (réponds au message à supprimer)',
    usage: '.del (répondre au message)',
    group: false, // fonctionne partout
    execute: async ({ sock, msg, from, sender, senderIsAdmin, botIsAdmin, isSudo, isGroup }) => {
      const ctx = msg.message?.extendedTextMessage?.contextInfo

      // ── Cas 1 : pas de message cité → supprimer la commande elle-même ──
      if (!ctx?.stanzaId) {
        if (isGroup && !botIsAdmin) {
          return reply(sock, msg, '❌ Le bot doit être admin pour supprimer des messages en groupe.')
        }
        try {
          await sock.sendMessage(from, { delete: msg.key })
        } catch (e) {
          await reply(sock, msg, `❌ Impossible de supprimer: ${e.message}`)
        }
        return
      }

      // ── Cas 2 : message cité ──────────────────────────────────────────
      const targetParticipant = normalizeJid(ctx.participant || ctx.remoteJid || from)
      const senderNorm        = normalizeJid(sender)
      const isSelf            = targetParticipant === senderNorm

      // En groupe : vérifier les droits
      if (isGroup && !isSelf) {
        if (!isSudo && !senderIsAdmin) {
          return reply(sock, msg, '❌ Tu dois être admin pour supprimer le message d\'un autre membre.')
        }
        if (!botIsAdmin) {
          return reply(sock, msg, '❌ Le bot doit être admin pour supprimer des messages en groupe.')
        }
      }

      // fromMe=true si le message ciblé vient du sender lui-même (DM propre)
      // Sans ça WA ignore la suppression en conversation privée.
      const isOwnMessage = !ctx.participant || normalizeJid(ctx.participant) === normalizeJid(sender)

      const key = {
        remoteJid: from,
        id:        ctx.stanzaId,
        fromMe:    isOwnMessage,
        ...(isGroup && ctx.participant ? { participant: ctx.participant } : {})
      }

      try {
        await sock.sendMessage(from, { delete: key })
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, `❌ Impossible de supprimer: ${e.message}`)
      }
    }
  },

  // ─── GROUPSTAT ───────────────────────────────────────────────────────────
  {
    name: 'groupstat',
    aliases: ['gstat', 'config'],
    category: 'admin',
    desc: 'Voir la configuration du groupe',
    usage: '.groupstat',
    group: true,
    execute: async ({ sock, msg, from }) => {
      const data = await getGroup(from)
      if (!data) return reply(sock, msg, 'ℹ️ Aucune config pour ce groupe. Toutes les options sont désactivées.')
      const text =
        `╔══ *CONFIG GROUPE* ══╗\n` +
        `║ 🔗 Anti-lien : ${data.antilink ? '✅' : '❌'}\n` +
        `║ 🛡️ Anti-spam : ${data.antispam ? '✅' : '❌'}\n` +
        `║ 👋 Bienvenue : ${data.welcome  ? '✅' : '❌'}\n` +
        `║ 👋 Au revoir : ${data.goodbye  ? '✅' : '❌'}\n` +
        `║ 🔒 Mute      : ${data.mute     ? '✅' : '❌'}\n` +
        `╚═══════════════╝`
      await reply(sock, msg, text)
    }
  }

]
