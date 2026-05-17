const axios = require('axios')
const QRCode = require('qrcode')

function targetImage(msg, quoted) {
  if (quoted?.message?.imageMessage) return quoted
  if (msg.message?.imageMessage) return msg
  return null
}

module.exports = {
  qrcode: {
    desc: 'Generer un QR code',
    aliases: ['qr', 'genqr'],
    category: 'user',
    usage: '.qrcode <texte ou URL>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .qrcode <texte ou URL>')
      try {
        const text = args.join(' ')
        const buf = await QRCode.toBuffer(text, { width: 512, margin: 2, errorCorrectionLevel: 'H' })
        await sock.sendMessage(msg.key.remoteJid, {
          image: buf,
          caption: `QR code\n${text.slice(0, 100)}`
        }, { quoted: msg })
      } catch (e) { reply('Erreur QR: ' + e.message) }
    }
  },

  scanqr: {
    desc: 'Decoder un QR code depuis une image',
    aliases: ['readqr'],
    category: 'user',
    usage: '.scanqr en repondant a une image',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      const target = targetImage(msg, quoted)
      if (!target) return reply('Reponds a une image contenant un QR code.')
      try {
        const { Jimp } = require('jimp')
        const QrCode = require('qrcode-reader')
        const buf = await downloadMedia(target)
        const image = await Jimp.read(buf)
        const qr = new QrCode()
        const data = await new Promise((resolve, reject) => {
          qr.callback = (err, value) => err ? reject(err) : resolve(value?.result)
          qr.decode(image.bitmap)
        })
        if (!data) return reply('Aucun QR code detecte.')
        await reply(`QR detecte:\n\n${data}`)
      } catch (e) { reply('Erreur scan: ' + e.message) }
    }
  },
  
  calc: {
    desc: 'Calculatrice avancee',
    aliases: ['calculate', 'math'],
    category: 'user',
    usage: '.calc 2+2*5',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('Usage: .calc <expression>\nEx: .calc sqrt(144)')
      try {
        const math = require('mathjs')
        const expr = args.join(' ')
        const result = math.evaluate(expr)
        await reply(`Calcul\nExpression: ${expr}\nResultat: ${result}`)
      } catch (e) { reply('Expression invalide: ' + e.message) }
    }
  },

  timer: {
    desc: 'Minuteur',
    aliases: ['minuteur', 'countdown'],
    category: 'user',
    usage: '.timer 5m label',
    handler: async (sock, msg, { args, reply, sender }) => {
      if (!args.length) return reply('Usage: .timer 30s|5m|1h [label]')
      const raw = args.shift()
      const label = args.join(' ') || 'Timer'
      const match = raw.match(/^(\d+)\s*([smh])$/i)
      if (!match) return reply('Format invalide. Ex: 30s, 5m, 2h')
      const value = parseInt(match[1], 10)
      const unit = match[2].toLowerCase()
      const ms = unit === 'h' ? value * 3600000 : unit === 'm' ? value * 60000 : value * 1000
      if (ms > 6 * 3600000) return reply('Maximum 6 heures.')
      await reply(`Timer lance\nDuree: ${value}${unit}\nLabel: ${label}`)
      setTimeout(async () => {
        try {
          await sock.sendMessage(msg.key.remoteJid, {
            text: `TIMER TERMINE\n\n${value}${unit} ecoule\n${label}`,
            mentions: [sender]
          })
        } catch {}
      }, ms)
    }
  },

  tts: {
    desc: 'Texte vers parole',
    aliases: ['voice', 'speak'],
    category: 'user',
    usage: '.tts fr Bonjour',
    handler: async (sock, msg, { args, reply }) => {
      if (args.length < 2) return reply('Usage: .tts <lang> <texte>')
      const lang = args.shift()
      const text = args.join(' ').slice(0, 200)
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
        const res = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxContentLength: 50 * 1024 * 1024,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        })
        await sock.sendMessage(msg.key.remoteJid, {
          audio: Buffer.from(res.data),
          mimetype: 'audio/mp4',
          ptt: true
        }, { quoted: msg })
      } catch (e) { reply('Erreur TTS: ' + e.message) }
    }
  },

  stt: {
    desc: 'Transcription audio en texte',
    aliases: ['transcribe', 'voice2text'],
    category: 'user',
    usage: '.stt en repondant a un audio',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      if (!quoted?.message?.audioMessage) return reply('Reponds a un audio.')
      const token = process.env.HF_TOKEN
      if (!token) return reply('Transcription indisponible: configure HF_TOKEN pour activer .stt.')
      try {
        await reply('Transcription en cours...')
        const buf = await downloadMedia(quoted)
        const res = await axios.post('https://api-inference.huggingface.co/models/openai/whisper-base', buf, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/ogg' },
          timeout: 60000,
          maxContentLength: 50 * 1024 * 1024
        })
        const text = res.data?.text
        if (!text) return reply('Transcription indisponible pour cet audio.')
        await reply(`Transcription:\n\n${text}`)
      } catch (e) { reply('Erreur STT: ' + (e.response?.data?.error || e.message)) }
    }
  },

  removebg: {
    desc: 'Enlever le fond d une image',
    aliases: ['rembg', 'nobg'],
    category: 'user',
    usage: '.removebg en repondant a une image',
    handler: async (sock, msg, { reply }) => {
      return reply('RemoveBG necessite une API fiable avec cle. Configure REMOVE_BG_KEY ou REPLICATE_API_TOKEN pour activer cette commande.')
    }
  },

  upscale: {
    desc: "Améliorer la résolution d'une image (reply image)",
    aliases: ['enhance', 'hd'],
    category: 'user',
    usage: '.upscale (répondre à une image)',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      const target = targetImage(msg, quoted)
      if (!target) return reply('❌ Réponds à une image avec .upscale')
      try {
        await reply('🔍 _Amélioration en cours..._')
        const buf = await downloadMedia(target)
        const FormData = require('form-data')
        const fd = new FormData()
        fd.append('image', buf, { filename: 'img.jpg', contentType: 'image/jpeg' })
        const res = await axios.post('https://api.giftedtech.web.id/api/tools/upscale?apikey=gifted', fd, {
          headers: { ...fd.getHeaders() },
          responseType: 'arraybuffer',
          timeout: 60000
        }).catch(() => null)
        if (res?.data && res.data.length > 1000) {
          await sock.sendMessage(msg.key.remoteJid, { image: Buffer.from(res.data), caption: '🔍 _Image améliorée_' }, { quoted: msg })
        } else {
          reply('❌ Service upscale temporairement indisponible. Réessaie dans quelques minutes.')
        }
      } catch (e) { reply('❌ Erreur: ' + e.message) }
    }
  },

  removebg: {
    desc: "Enlève le fond d'une image (reply image)",
    aliases: ['rembg', 'nobg'],
    category: 'user',
    usage: '.removebg (répondre à une image)',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      const target = targetImage(msg, quoted)
      if (!target) return reply('❌ Réponds à une image avec .removebg')
      try {
        await reply('🪄 _Suppression du fond..._')
        const buf = await downloadMedia(target)
        const FormData = require('form-data')
        const fd = new FormData()
        fd.append('image_file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' })
        const res = await axios.post('https://sdk.photoroom.com/v1/segment', fd, {
          headers: { ...fd.getHeaders() },
          responseType: 'arraybuffer',
          timeout: 30000
        }).catch(() => null)
        if (res?.data && res.data.length > 500) {
          await sock.sendMessage(msg.key.remoteJid, { image: Buffer.from(res.data), caption: '🪄 _Fond supprimé_' }, { quoted: msg })
        } else {
          reply('❌ Service remove-bg indisponible. Réessaie ou configure REMOVEBG_KEY dans .env.')
        }
      } catch (e) { reply('❌ Erreur: ' + e.message) }
    }
  },

  // ═══ TIMER ═══════════════════════════════════════════════════════════════
  timer: {
    desc: 'Minuteur — le bot te prévient quand fini',
    aliases: ['minuteur', 'countdown'],
    category: 'user',
    usage: '.timer <durée> [label]  Ex: .timer 5m boil pasta | .timer 1h30m',
    handler: async (sock, msg, { args, reply, sender }) => {
      if (!args.length) return reply('❌ Usage: .timer 10m description\nFormats: 30s, 5m, 1h, 2h30m')
      const raw   = args.shift().toLowerCase()
      const label = args.join(' ') || 'Timer'

      let totalMs = 0
      const regex = /(\d+)\s*([smh])/g
      let m
      while ((m = regex.exec(raw)) !== null) {
        const v = parseInt(m[1])
        const u = m[2]
        totalMs += u === 'h' ? v * 3600000 : u === 'm' ? v * 60000 : v * 1000
      }
      if (totalMs === 0) return reply('❌ Format invalide. Ex: 30s, 5m, 1h30m')
      if (totalMs > 6 * 3600000) return reply('❌ Maximum 6 heures.')

      const end    = new Date(Date.now() + totalMs)
      const endStr = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      await reply(`⏱️ *Timer lancé*\n\n📝 ${label}\n⏰ Fini à *${endStr}*\n\n_Je te préviens._`)
      setTimeout(async () => {
        try {
          await sock.sendMessage(msg.key.remoteJid, { text: `🔔 *TIMER TERMINÉ*\n\n📝 ${label}`, mentions: [sender] })
        } catch {}
      }, totalMs)
    }
  },

  // ═══ TTS ═════════════════════════════════════════════════════════════════
  tts: {
    desc: 'Texte vers voix audio',
    aliases: ['voice', 'speak'],
    category: 'user',
    usage: '.tts <lang> <texte>  Ex: .tts fr Bonjour',
    handler: async (sock, msg, { args, reply }) => {
      if (args.length < 2) return reply('❌ Usage: .tts <lang> <texte>\nEx: .tts fr Bonjour | .tts en Hello')
      const lang = args.shift()
      const text = args.join(' ').slice(0, 200)
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } })
        await sock.sendMessage(msg.key.remoteJid, { audio: Buffer.from(res.data), mimetype: 'audio/mp4', ptt: true }, { quoted: msg })
      } catch (e) { reply('❌ Erreur TTS: ' + e.message) }
    }
  },

  // ═══ STT ═════════════════════════════════════════════════════════════════
  stt: {
    desc: 'Transcription audio → texte (reply à un audio)',
    aliases: ['transcribe', 'voice2text'],
    category: 'user',
    usage: '.stt (répondre à un audio)',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      if (!quoted?.message?.audioMessage && !quoted?.message?.videoMessage) {
        return reply('❌ Réponds à un audio avec .stt')
      }
      try {
        await reply('🎤 _Transcription en cours..._')
        const buf     = await downloadMedia(quoted)
        const hfToken = process.env.HF_TOKEN
        if (!hfToken) return reply('❌ HF_TOKEN non configuré dans .env (gratuit sur huggingface.co).')
        const res = await axios.post(
          'https://api-inference.huggingface.co/models/openai/whisper-base',
          buf,
          { headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/octet-stream' }, timeout: 60000 }
        )
        const text = res.data?.text
        if (!text) return reply('❌ Transcription indisponible (API gratuite peut être saturée).')
        await reply(`📝 *Transcription :*\n\n${text}`)
      } catch (e) { reply('❌ Erreur STT: ' + e.message) }
    }
  },

  deepfake: {
    desc: 'Anime une photo avec un audio',
    aliases: ['talkingphoto'],
    category: 'user',
    handler: async (sock, msg, { reply }) => {
      return reply('⚠️ Deepfake nécessite GPU + clé Replicate.\nConfigure REPLICATE_API_TOKEN dans .env pour activer.')
    }
  }
}
