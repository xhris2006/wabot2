const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { normalizeJid }  = require('../../lib/utils')
const { loadConfig }    = require('../../lib/config')
const { loadDB, saveDB } = require('../../lib/database')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ── Helper : télécharger un média quoté en buffer ─────────────────────────────
async function dlBuffer(sock, fakeMsg) {
  try {
    return await downloadMediaMessage(fakeMsg, 'buffer', {}, {
      logger:          { info: () => {}, error: () => {}, warn: () => {} },
      reuploadRequest: sock.updateMediaMessage
    })
  } catch {
    return await downloadMediaMessage(fakeMsg, 'buffer', {}, {
      logger: { info: () => {}, error: () => {}, warn: () => {} }
    })
  }
}

module.exports = {

  // ════════════════════════════════════════════════════════════════════════════
  // STEAL — Voler un sticker
  // ════════════════════════════════════════════════════════════════════════════
  steal: {
    desc: 'Voler un sticker et le renommer avec votre pack',
    aliases: ['volersticker'],
    category: 'user',
    usage: '.steal [nom|auteur] — reply à un sticker',
    async handler(sock, msg, { args, reply, quoted, config }) {
      try {
        // Chercher le sticker dans reply OU dans le message direct
        const qMsg = quoted?.message || {}
        const stickerMsg =
          qMsg.stickerMessage ||
          qMsg.viewOnceMessage?.message?.stickerMessage ||
          qMsg.ephemeralMessage?.message?.stickerMessage ||
          msg.message?.stickerMessage

        if (!stickerMsg) return reply('❌ Réponds à un sticker.\n_Usage: réponds au sticker puis tape .steal_')

        // FIX: construire dlMsg depuis le bon message
        const dlMsg = qMsg.stickerMessage
          ? { key: quoted.key, message: { stickerMessage: qMsg.stickerMessage } }
          : { key: msg.key, message: { stickerMessage: stickerMsg } }

        // FIX: loadConfig() toujours en priorité car config passé en contexte
        // peut être vide {} si config.json n'existe pas encore
        const cfg      = loadConfig()
        const parts    = args.join(' ').split('|')
        const packname = parts[0]?.trim() || cfg.packname || 'XHRISmd Bot'
        const author   = parts[1]?.trim() || cfg.packauthor || '©2026'

        const buffer = await dlBuffer(sock, dlMsg)

        // Injecter les métadonnées webp via exiftool si dispo
        let finalBuffer = buffer
        const tmpIn  = path.join(os.tmpdir(), `steal_${Date.now()}.webp`)
        const tmpOut = path.join(os.tmpdir(), `steal_out_${Date.now()}.webp`)
        fs.writeFileSync(tmpIn, buffer)

        try {
          const { execFileSync } = require('child_process')
          const metaJson = JSON.stringify([{
            'sticker-pack-id':        `com.wabot.${Date.now()}`,
            'sticker-pack-name':      packname,
            'sticker-pack-publisher': author,
            'emojis':                 ['😄']
          }])
          const exifHeader = Buffer.from('4578696600000000', 'hex')
          const metaFile   = path.join(os.tmpdir(), `meta_${Date.now()}.exif`)
          fs.writeFileSync(metaFile, Buffer.concat([exifHeader, Buffer.from(metaJson)]))
          execFileSync('webpmux', ['-set', 'exif', metaFile, tmpIn, '-o', tmpOut], { timeout: 5000 })
          if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 100) {
            finalBuffer = fs.readFileSync(tmpOut)
          }
          try { fs.unlinkSync(metaFile) } catch {}
        } catch {} // webpmux absent → sticker envoyé sans métadonnées custom

        try { fs.unlinkSync(tmpIn)  } catch {}
        try { fs.unlinkSync(tmpOut) } catch {}

        await sock.sendMessage(msg.key.remoteJid, { sticker: finalBuffer }, { quoted: msg })
        await reply(`✅ Sticker volé !\n📦 Pack: *${packname}*\n✍️ Auteur: *${author}*`)
      } catch (e) {
        reply('❌ Erreur steal: ' + e.message)
      }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // VV — ViewOnce
  // ════════════════════════════════════════════════════════════════════════════
  vv: {
    desc: 'Voir un message à vue unique',
    aliases: ['viewonce', 'antiview'],
    category: 'user',
    usage: '.vv — reply au message viewonce',
    async handler(sock, msg, { reply, quoted }) {
      try {
        if (!quoted) return reply('❌ Réponds à un message à vue unique.')

        const qMsg = quoted.message || {}
        const voContent =
          qMsg.viewOnceMessage?.message ||
          qMsg.viewOnceMessageV2?.message ||
          qMsg.viewOnceMessageV2Extension?.message ||
          qMsg.ephemeralMessage?.message?.viewOnceMessage?.message ||
          qMsg.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
          (qMsg.imageMessage?.viewOnce ? qMsg : null) ||
          (qMsg.videoMessage?.viewOnce ? qMsg : null)

        if (!voContent) return reply(
          '❌ Ce message n\'est pas à vue unique.\n\n' +
          '_Note: WhatsApp peut expirer ces médias côté serveur._'
        )

        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage']
        let found = null
        for (const t of mediaTypes) {
          if (voContent[t]) { found = { type: t, content: voContent[t] }; break }
        }
        if (!found) return reply('❌ Type de média non supporté.')

        const fakeMsg = {
          key: {
            remoteJid:   msg.key.remoteJid,
            id:          quoted.key?.id || msg.key.id,
            participant: quoted.key?.participant || msg.key.participant || msg.key.remoteJid,
            fromMe:      false
          },
          message: voContent
        }

        const buffer = await dlBuffer(sock, fakeMsg)
        const mtype  = found.type === 'imageMessage' ? 'image'
                     : found.type === 'videoMessage' ? 'video'
                     : 'audio'

        await sock.sendMessage(msg.key.remoteJid, {
          [mtype]:  buffer,
          caption:  found.content.caption ? `📸 *ViewOnce*\n${found.content.caption}` : '📸 *ViewOnce révélé*',
          mimetype: found.content.mimetype
        }, { quoted: msg })
      } catch (e) { reply('❌ Erreur vv: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CLEARCHAT — Effacer historique côté bot
  // FIX : WhatsApp MD ne supporte pas chatModify delete sur tous les comptes.
  // Alternative : envoyer et supprimer immédiatement un message "fantôme".
  // ════════════════════════════════════════════════════════════════════════════
  clearchat: {
    desc: 'Effacer l\'historique du chat côté bot',
    aliases: ['viderchat'],
    category: 'user',
    usage: '.clearchat',
    async handler(sock, msg, { reply }) {
      const jid = msg.key.remoteJid
      // Réaction ✅ pour signaler que c'est pris en compte
      await sock.sendMessage(jid, { react: { text: '🗑️', key: msg.key } })

      // Tentative 1 : chatModify delete
      try {
        await sock.chatModify({
          delete: true,
          lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }]
        }, jid)
        return
      } catch {}

      // Tentative 2 : archive
      try {
        await sock.chatModify({ archive: true, lastMessages: [] }, jid)
        return
      } catch {}

      // Tentative 3 : readMessages (marquer tout comme lu = seul moyen fiable)
      try {
        await sock.readMessages([msg.key])
        await sock.sendMessage(jid, { text: '⚠️ Effacement non supporté sur ce compte.\n_Chat marqué comme lu._' })
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ chatModify non supporté sur ce compte WhatsApp MD.' })
      }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SAVE — Sauvegarder dans son inbox personnel (forward réel + reaction)
  // ════════════════════════════════════════════════════════════════════════════
  save: {
    desc: 'Sauvegarder un message dans votre inbox personnel',
    aliases: ['inbox'],
    category: 'user',
    usage: '.save — reply à un message',
    async handler(sock, msg, { reply, quoted, sender }) {
      try {
        if (!quoted) return reply('❌ Réponds à un message pour le sauvegarder.')

        // JID inbox = propre numéro
        const ownerJid = normalizeJid(sock.user?.id || sender)
        const qMsg     = quoted.message || {}

        // Réaction ✅ immédiate (sans texte de succès)
        await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } })

        // Déterminer le type de contenu et forwarder fidèlement
        if (qMsg.imageMessage) {
          const buf = await dlBuffer(sock, { key: quoted.key, message: qMsg })
          await sock.sendMessage(ownerJid, {
            image:     buf,
            caption:   qMsg.imageMessage.caption || '',
            viewOnce:  false,   // forcer non-viewonce en inbox
            mimetype:  qMsg.imageMessage.mimetype
          })
        } else if (qMsg.videoMessage) {
          const buf = await dlBuffer(sock, { key: quoted.key, message: qMsg })
          await sock.sendMessage(ownerJid, {
            video:   buf,
            caption: qMsg.videoMessage.caption || '',
            mimetype: qMsg.videoMessage.mimetype
          })
        } else if (qMsg.audioMessage) {
          const buf = await dlBuffer(sock, { key: quoted.key, message: qMsg })
          await sock.sendMessage(ownerJid, { audio: buf, mimetype: 'audio/mp4', ptt: false })
        } else if (qMsg.stickerMessage) {
          const buf = await dlBuffer(sock, { key: quoted.key, message: qMsg })
          await sock.sendMessage(ownerJid, { sticker: buf })
        } else if (qMsg.viewOnceMessage || qMsg.viewOnceMessageV2) {
          // ViewOnce → envoyer en tant que viewonce dans l'inbox
          const voMsg   = qMsg.viewOnceMessage?.message || qMsg.viewOnceMessageV2?.message || {}
          const voTypes = ['imageMessage', 'videoMessage']
          for (const t of voTypes) {
            if (voMsg[t]) {
              const buf   = await dlBuffer(sock, { key: quoted.key, message: voMsg })
              const mtype = t === 'imageMessage' ? 'image' : 'video'
              await sock.sendMessage(ownerJid, {
                [mtype]:  buf,
                viewOnce: true,
                caption:  voMsg[t].caption || '👁️ ViewOnce sauvegardé',
                mimetype: voMsg[t].mimetype
              })
              break
            }
          }
        } else if (qMsg.documentMessage) {
          const buf = await dlBuffer(sock, { key: quoted.key, message: qMsg })
          await sock.sendMessage(ownerJid, {
            document: buf,
            fileName: qMsg.documentMessage.fileName || 'document',
            mimetype: qMsg.documentMessage.mimetype
          })
        } else {
          // Texte ou autre → forward simple
          const txt = qMsg.conversation || qMsg.extendedTextMessage?.text || ''
          if (txt) {
            await sock.sendMessage(ownerJid, { text: txt })
          } else {
            await sock.sendMessage(ownerJid, { forward: quoted })
          }
        }
      } catch (e) {
        reply('❌ Erreur save: ' + e.message)
      }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ANTIDELETE — Activer/désactiver le renvoi des messages supprimés
  // ════════════════════════════════════════════════════════════════════════════
  antidelete: {
    desc: 'Activer le renvoi des messages supprimés',
    aliases: ['ad'],
    category: 'user',
    ownerOnly: true,
    usage: '.antidelete on [c|m] | .antidelete off\nc=dans le chat, m=inbox personnel',
    async handler(sock, msg, { args, reply }) {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) {
        return reply(
          '❌ Usage: .antidelete on [c|m] | .antidelete off\n\n' +
          '• *c* = renvoyer dans le chat (défaut)\n' +
          '• *m* = renvoyer dans votre inbox'
        )
      }
      const mode = args[1]?.toLowerCase() === 'm' ? 'm' : 'c'
      const db   = loadDB()
      if (val === 'on') {
        db.antidelete = { enabled: true, mode }
        saveDB(db)
        reply(`🔁 Antidelete *activé*\nMode: *${mode === 'm' ? 'inbox personnel' : 'dans le chat'}*`)
      } else {
        db.antidelete = { enabled: false, mode: 'c' }
        saveDB(db)
        reply('🔁 Antidelete *désactivé*.')
      }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // URL — Obtenir l'URL directe d'un média
  // ════════════════════════════════════════════════════════════════════════════
  url: {
    desc: 'Obtenir l\'URL directe d\'un média (reply image/vidéo/sticker)',
    aliases: ['geturl', 'mediaurl'],
    category: 'user',
    usage: '.url — reply à un média',
    async handler(sock, msg, { reply, quoted }) {
      try {
        if (!quoted) return reply('❌ Réponds à un média (image, vidéo, sticker).')
        const qMsg = quoted.message || {}
        const media =
          qMsg.imageMessage    ||
          qMsg.videoMessage    ||
          qMsg.stickerMessage  ||
          qMsg.audioMessage    ||
          qMsg.documentMessage

        if (!media) return reply('❌ Aucun média dans ce message.')

        const url = media.url || media.directPath
        if (!url) return reply('❌ URL non disponible pour ce média.')
        await reply(`🔗 *URL du média:*\n\n${url}\n\n_Utilise .upload <url> pour renvoyer_`)
      } catch (e) { reply('❌ Erreur url: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // UPLOAD — Envoyer un média depuis une URL
  // FIX : Baileys accepte { url } directement sans télécharger en buffer
  // ════════════════════════════════════════════════════════════════════════════
  upload: {
    desc: 'Envoyer un média depuis une URL',
    aliases: ['fromurl', 'sendurl'],
    category: 'user',
    usage: '.upload <url>',
    async handler(sock, msg, { args, reply }) {
      try {
        const url = args[0]
        if (!url || !/^https?:\/\//i.test(url)) {
          return reply('❌ Donne une URL valide.\nEx: .upload https://example.com/image.jpg')
        }

        const clean = url.split('?')[0].toLowerCase()
        const ext   = clean.split('.').pop()

        const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp']
        const audioExts = ['mp3', 'ogg', 'aac', 'm4a', 'opus', 'wav']
        const imgExts   = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']

        await reply('⏳ Envoi en cours...')

        if (videoExts.includes(ext)) {
          await sock.sendMessage(msg.key.remoteJid, {
            video:   { url },
            caption: '🎬 _Via .upload_'
          }, { quoted: msg })
        } else if (audioExts.includes(ext)) {
          await sock.sendMessage(msg.key.remoteJid, {
            audio:    { url },
            mimetype: 'audio/mp4',
            ptt:      false
          }, { quoted: msg })
        } else if (imgExts.includes(ext)) {
          await sock.sendMessage(msg.key.remoteJid, {
            image:   { url },
            caption: '🖼️ _Via .upload_'
          }, { quoted: msg })
        } else {
          // Essai image par défaut
          await sock.sendMessage(msg.key.remoteJid, {
            image:   { url },
            caption: '🖼️ _Via .upload_'
          }, { quoted: msg })
        }
      } catch (e) { reply('❌ Erreur upload: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // JOIN — Rejoindre un groupe via lien
  // ════════════════════════════════════════════════════════════════════════════
  join: {
    desc: 'Faire rejoindre le bot dans un groupe via lien',
    aliases: ['rejoindre'],
    category: 'user',
    ownerOnly: true,
    usage: '.join <lien> | .join (reply à un lien)',
    async handler(sock, msg, { args, reply, quoted }) {
      try {
        let link = args[0]

        // Extraire depuis le reply si pas d'argument
        if (!link && quoted) {
          const txt = quoted.message?.conversation || quoted.message?.extendedTextMessage?.text || ''
          const m   = txt.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
          if (m) link = `https://chat.whatsapp.com/${m[1]}`
        }

        // Extraire depuis le texte du message lui-même
        if (!link) {
          const bodyMatch = (msg.message?.conversation || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
          if (bodyMatch) link = `https://chat.whatsapp.com/${bodyMatch[1]}`
        }

        if (!link) return reply('❌ Donne un lien de groupe.\nEx: .join https://chat.whatsapp.com/XXXX\nOu réponds à un message contenant le lien.')

        // Extraire le code d'invitation
        const codeMatch = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
        if (!codeMatch) return reply('❌ Lien invalide.')

        const code = codeMatch[1]
        await sock.groupAcceptInvite(code)
        await reply(`✅ Bot a rejoint le groupe via le lien !`)
      } catch (e) {
        reply('❌ Erreur join: ' + e.message + '\n_Le lien est peut-être expiré ou invalide._')
      }
    }
  }

}
