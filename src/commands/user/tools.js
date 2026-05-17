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
    desc: 'Ameliorer la resolution d une image',
    aliases: ['enhance', 'hd'],
    category: 'user',
    handler: async (sock, msg, { reply }) => {
      return reply('Upscale necessite une cle Replicate/HF. Configure REPLICATE_API_TOKEN ou HF_TOKEN pour activer cette commande.')
    }
  },

  deepfake: {
    desc: 'Anime une photo avec un audio',
    aliases: ['talkingphoto'],
    category: 'user',
    handler: async (sock, msg, { reply }) => {
      return reply('Deepfake necessite GPU + cle Replicate. Configure REPLICATE_API_TOKEN pour activer cette commande.')
    }
  }
}
