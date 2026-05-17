const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

async function processAudioWithFfmpeg(inputBuf, ffmpegArgs) {
  return new Promise((resolve, reject) => {
    const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}.ogg`)
    const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.mp3`)
    fs.writeFileSync(tmpIn, inputBuf)
    const p = spawn('ffmpeg', ['-y', '-i', tmpIn, ...ffmpegArgs, tmpOut], { windowsHide: true })
    p.on('error', reject)
    p.on('close', (code) => {
      try { fs.unlinkSync(tmpIn) } catch {}
      if (code === 0 && fs.existsSync(tmpOut)) {
        const buf = fs.readFileSync(tmpOut)
        try { fs.unlinkSync(tmpOut) } catch {}
        resolve(buf)
      } else reject(new Error('ffmpeg failed'))
    })
  })
}

async function runAudio(sock, msg, quoted, downloadMedia, reply, args) {
  if (!quoted?.message?.audioMessage) {
    await reply('Reponds a un audio.')
    return null
  }
  const buf = await downloadMedia(quoted)
  return { buf, args }
}

module.exports = {
  reverse: {
    desc: 'Audio a l envers',
    aliases: ['rev'],
    category: 'media',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      try {
        const input = await runAudio(sock, msg, quoted, downloadMedia, reply)
        if (!input) return
        const out = await processAudioWithFfmpeg(input.buf, ['-af', 'areverse'])
        await sock.sendMessage(msg.key.remoteJid, { audio: out, mimetype: 'audio/mp4' }, { quoted: msg })
      } catch (e) { reply('Erreur audio (ffmpeg requis): ' + e.message) }
    }
  },

  pitch: {
    desc: 'Changer le pitch audio',
    category: 'media',
    usage: '.pitch up|down',
    handler: async (sock, msg, { args, reply, quoted, downloadMedia }) => {
      try {
        const input = await runAudio(sock, msg, quoted, downloadMedia, reply, args)
        if (!input) return
        const factor = args[0]?.toLowerCase() === 'down' ? 0.75 : 1.25
        const out = await processAudioWithFfmpeg(input.buf, ['-af', `asetrate=44100*${factor},aresample=44100`])
        await sock.sendMessage(msg.key.remoteJid, { audio: out, mimetype: 'audio/mp4' }, { quoted: msg })
      } catch (e) { reply('Erreur audio: ' + e.message) }
    }
  },

  bassboost: {
    desc: 'Renforcer les basses',
    aliases: ['bass'],
    category: 'media',
    handler: async (sock, msg, { reply, quoted, downloadMedia }) => {
      try {
        const input = await runAudio(sock, msg, quoted, downloadMedia, reply)
        if (!input) return
        const out = await processAudioWithFfmpeg(input.buf, ['-af', 'bass=g=12'])
        await sock.sendMessage(msg.key.remoteJid, { audio: out, mimetype: 'audio/mp4' }, { quoted: msg })
      } catch (e) { reply('Erreur audio: ' + e.message) }
    }
  },

  speed: {
    desc: 'Changer la vitesse audio',
    category: 'media',
    usage: '.speed 0.5|1.5|2',
    handler: async (sock, msg, { args, reply, quoted, downloadMedia }) => {
      try {
        const input = await runAudio(sock, msg, quoted, downloadMedia, reply)
        if (!input) return
        const rate = Math.max(0.5, Math.min(2, parseFloat(args[0]) || 1.25))
        const out = await processAudioWithFfmpeg(input.buf, ['-filter:a', `atempo=${rate}`])
        await sock.sendMessage(msg.key.remoteJid, { audio: out, mimetype: 'audio/mp4' }, { quoted: msg })
      } catch (e) { reply('Erreur audio: ' + e.message) }
    }
  }
}
