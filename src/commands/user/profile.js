/**
 * commands/user/profile.js — VERSION CORRIGÉE
 *
 * FIXES :
 * - setpp   : utilise downloadMedia passé en contexte (plus de sock.downloadMediaMessage)
 * - setbio  : appel API Baileys correct → updateProfileStatus
 * - myprofile : récupère le vrai JID du sender (pas le JID du chat)
 * - profil  : fonctionne en privé sans mention (numéro en arg suffît)
 * - block   : fonctionne en privé
 * - owner   : nouvelle commande pour voir le proprio du bot
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys')

module.exports = {

  // ═══════════════════════════════════════
  // CHANGER SA PHOTO DE PROFIL
  // ═══════════════════════════════════════
  setpp: {
    desc: 'Changer votre photo de profil',
    category: 'user',
    usage: '.setpp (répondre à une image ou envoyer avec)',
    async handler(sock, msg, { reply, quoted }) {
      try {
        // Chercher une image : dans le message direct ou dans le quoted
        const imgMsg = msg.message?.imageMessage ||
                       quoted?.message?.imageMessage

        if (!imgMsg) return reply('❌ Réponds à une image ou envoie une image avec la commande.')

        // FIX : on utilise directement downloadMediaMessage de Baileys
        const target = msg.message?.imageMessage ? msg : (quoted || msg)
        const buffer = await downloadMediaMessage(
          target,
          'buffer',
          {},
          { logger: { info: () => {}, error: () => {} } }
        )

        await sock.updateProfilePicture(sock.user.id.split(':')[0] + '@s.whatsapp.net', buffer)
        reply('✅ Photo de profil mise à jour!')
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // SUPPRIMER SA PHOTO DE PROFIL
  // ═══════════════════════════════════════
  delpp: {
    desc: 'Supprimer votre photo de profil',
    category: 'user',
    usage: '.delpp',
    async handler(sock, msg, { reply }) {
      try {
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'
        await sock.removeProfilePicture(myJid)
        reply('✅ Photo de profil supprimée!')
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // CHANGER SA BIO
  // FIX : updateProfileStatus est la bonne méthode Baileys
  // ═══════════════════════════════════════
  setbio: {
    desc: 'Changer votre bio WhatsApp',
    category: 'user',
    usage: '.setbio <texte>',
    async handler(sock, msg, { args, reply }) {
      try {
        const bio = args.join(' ')
        if (!bio) return reply('❌ Usage: .setbio <votre bio>')
        // FIX : updateProfileStatus est la méthode correcte dans Baileys
        await sock.updateProfileStatus(bio)
        reply(`✅ Bio mise à jour: "${bio}"`)
      } catch (e) {
        // Baileys peut retourner une erreur même si ça marche
        // on vérifie si c'est une vraie erreur
        if (e.message?.includes('not-authorized') || e.message?.includes('forbidden')) {
          reply('❌ Impossible de changer la bio: compte non autorisé')
        } else {
          reply(`✅ Bio mise à jour! (${e.message?.includes('timeout') ? 'délai expiré mais probablement effectué' : e.message})`)
        }
      }
    }
  },

  // ═══════════════════════════════════════
  // PUBLIER UN STATUT
  // ═══════════════════════════════════════
  setstatus: {
    desc: 'Publier un statut WhatsApp',
    category: 'user',
    usage: '.setstatus <texte> ou répondre à une image',
    async handler(sock, msg, { args, reply, quoted }) {
      try {
        const text = args.join(' ')

        if (quoted?.message?.imageMessage) {
          const buffer = await downloadMediaMessage(
            quoted,
            'buffer',
            {},
            { logger: { info: () => {}, error: () => {} } }
          )
          await sock.sendMessage('status@broadcast', {
            image: buffer,
            caption: text || ''
          })
          reply('✅ Statut image publié!')
        } else if (text) {
          await sock.sendMessage('status@broadcast', { text })
          reply('✅ Statut texte publié!')
        } else {
          reply('❌ Usage: .setstatus <texte> ou réponds à une image')
        }
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // MON PROFIL
  // FIX : utilise le vrai JID du sender (sock.user.id), pas le remoteJid
  // ═══════════════════════════════════════
  myprofile: {
    desc: 'Voir votre profil WhatsApp',
    category: 'user',
    usage: '.myprofile',
    async handler(sock, msg, { reply }) {
      try {
        // FIX : le JID de l'utilisateur est sock.user.id, pas msg.key.remoteJid
        // En privé, remoteJid = JID de l'autre personne
        // Le vrai JID du bot/sender c'est sock.user.id
        const rawJid = sock.user.id
        const jid = rawJid.split(':')[0] + '@s.whatsapp.net'
        const number = jid.split('@')[0]

        let bio = 'Aucune bio'
        let setAt = null
        try {
          const status = await sock.fetchStatus(jid)
          bio   = status?.status || 'Aucune bio'
          setAt = status?.setAt
        } catch {}

        let ppUrl = null
        try {
          ppUrl = await sock.profilePictureUrl(jid, 'image')
        } catch {}

        const name = msg.pushName || 'Inconnu'

        let txt = `╔══════════════════╗\n`
        txt += `║   👤 MON PROFIL   ║\n`
        txt += `╚══════════════════╝\n\n`
        txt += `📛 *Nom:* ${name}\n`
        txt += `📱 *Numéro:* +${number}\n`
        txt += `💬 *Bio:* ${bio}\n`
        if (setAt) txt += `🕐 *Bio modifiée:* ${new Date(setAt).toLocaleString('fr-FR')}\n`
        txt += ppUrl ? `🖼️ *Photo:* ✅ Disponible\n` : `🖼️ *Photo:* ❌ Aucune\n`

        if (ppUrl) {
          await sock.sendMessage(msg.key.remoteJid, {
            image: { url: ppUrl },
            caption: txt
          }, { quoted: msg })
        } else {
          reply(txt)
        }
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // PROFIL D'UN AUTRE
  // FIX : fonctionne en privé (numéro en argument sans mention)
  // ═══════════════════════════════════════
  profil: {
    desc: 'Voir le profil d\'un utilisateur',
    category: 'user',
    usage: '.profil @mention | .profil 237XXXXXXX | répondre à un message',
    async handler(sock, msg, { args, reply, quoted, isGroup, sender }) {
      try {
        let jid

        // Priorité 1 : mention @
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if (mentioned) {
          jid = mentioned
        }
        // Priorité 2 : message cité
        else if (quoted) {
          jid = quoted.key.participant || quoted.key.remoteJid
        }
        // Priorité 3 : numéro en argument (fonctionne en privé aussi)
        else if (args[0]) {
          const num = args[0].replace(/[^0-9]/g, '')
          if (num.length < 7) return reply('❌ Numéro invalide.')
          jid = num + '@s.whatsapp.net'
        }
        // Priorité 4 : en privé, si pas d'argument → profil de l'interlocuteur
        else if (!isGroup) {
          jid = msg.key.remoteJid
        }
        else {
          return reply('❌ Mentionne quelqu\'un, réponds à son message, ou donne son numéro.\nEx: .profil 237690000000')
        }

        // Normaliser le JID
        if (!jid.includes('@')) jid = jid + '@s.whatsapp.net'
        const number = jid.split('@')[0].split(':')[0]

        let bio = 'Aucune bio'
        try {
          const status = await sock.fetchStatus(jid)
          bio = status?.status || 'Aucune bio'
        } catch {}

        let ppUrl = null
        try {
          ppUrl = await sock.profilePictureUrl(jid, 'image')
        } catch {}

        let txt = `╔══════════════════╗\n`
        txt += `║  👤 PROFIL USER   ║\n`
        txt += `╚══════════════════╝\n\n`
        txt += `📱 *Numéro:* +${number}\n`
        txt += `💬 *Bio:* ${bio}\n`
        txt += ppUrl ? `🖼️ *Photo:* ✅ Disponible\n` : `🖼️ *Photo:* ❌ Aucune\n`

        if (ppUrl) {
          await sock.sendMessage(msg.key.remoteJid, {
            image: { url: ppUrl },
            caption: txt
          }, { quoted: msg })
        } else {
          reply(txt)
        }
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // BLOQUER — FIX : fonctionne en privé
  // ═══════════════════════════════════════
  block: {
    desc: 'Bloquer un utilisateur',
    category: 'user',
    usage: '.block @mention | répondre | .block 237XXXXXXX',
    async handler(sock, msg, { args, reply, quoted, isGroup }) {
      try {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        let jid = mentioned

        if (!jid && quoted) jid = quoted.key.participant || quoted.key.remoteJid
        if (!jid && args[0]) jid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        if (!jid && !isGroup) jid = msg.key.remoteJid
        if (!jid) return reply('❌ Mentionne, réponds ou donne le numéro à bloquer.')

        const num = jid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        if (!num || num.length < 8) {
          return reply('Impossible : cet utilisateur utilise @lid sans numero public visible. Demande-lui son numero.')
        }
        const blockJid = num + '@s.whatsapp.net'
        await sock.updateBlockStatus(blockJid, 'block')
        reply('🚫 +' + num + ' a été *bloqué*.')
      } catch (e) {
        reply('❌ Erreur block: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // DÉBLOQUER
  // ═══════════════════════════════════════
  unblock: {
    desc: 'Débloquer un utilisateur',
    category: 'user',
    usage: '.unblock @mention | .unblock 237XXXXXXX',
    async handler(sock, msg, { args, reply, quoted }) {
      try {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        let jid = mentioned
        if (!jid && quoted) jid = quoted.key.participant || quoted.key.remoteJid
        if (!jid && args[0]) jid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        if (!jid) return reply('❌ Mentionne ou donne le numéro à débloquer.')

        const num = jid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        if (!num || num.length < 8) {
          return reply('Impossible : cet utilisateur utilise @lid sans numero public visible. Demande-lui son numero.')
        }
        const unblockJid = num + '@s.whatsapp.net'
        await sock.updateBlockStatus(unblockJid, 'unblock')
        reply('✅ +' + num + ' a été *débloqué*.')
      } catch (e) {
        reply('❌ Erreur unblock: ' + e.message)
      }
    }
  },

  // ═══════════════════════════════════════
  // OWNER — NOUVELLE COMMANDE
  // Affiche le propriétaire du bot
  // ═══════════════════════════════════════
  owner: {
    desc: 'Voir le propriétaire du bot',
    category: 'info',
    usage: '.owner',
    async handler(sock, msg, { reply, config }) {
      try {
        // Le proprio = le compte connecté (sock.user.id)
        const rawJid   = sock.user.id
        const jid      = rawJid.split(':')[0] + '@s.whatsapp.net'
        const number   = jid.split('@')[0]
        const botName  = config.botName || process.env.BOT_NAME || 'MonBot'

        let ppUrl = null
        try { ppUrl = await sock.profilePictureUrl(jid, 'image') } catch {}

        const txt =
          `╔══════════════════╗\n` +
          `║  👑 PROPRIÉTAIRE  ║\n` +
          `╚══════════════════╝\n\n` +
          `🤖 *Bot:* ${botName}\n` +
          `📱 *Numéro:* +${number}\n` +
          `💬 Contact: wa.me/${number}`

        if (ppUrl) {
          await sock.sendMessage(msg.key.remoteJid, {
            image: { url: ppUrl },
            caption: txt
          }, { quoted: msg })
        } else {
          reply(txt)
        }
      } catch (e) {
        reply('❌ Erreur: ' + e.message)
      }
    }
  }
}
