const { reply, react } = require('../../lib/utils')
const axios = require('axios')

module.exports = [

  {
    name: 'gpt',
    aliases: ['ai', 'chatgpt'],
    category: 'ai',
    desc: 'Poser une question à ChatGPT',
    usage: '.gpt ta question',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .gpt ta question')
      const key = process.env.GPT_KEY
      if (!key) return reply(sock, msg, '❌ Clé GPT non configurée dans .env')
      await react(sock, msg, '🤔')
      const prompt = args.join(' ')
      try {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000
        }, {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 30000
        })
        const answer = res.data.choices[0].message.content.trim()
        await reply(sock, msg, `🤖 *ChatGPT*\n\n${answer}`)
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur GPT: ' + (e.response?.data?.error?.message || e.message))
      }
    }
  },

  {
    name: 'gemini',
    aliases: ['bard'],
    category: 'ai',
    desc: 'Poser une question à Gemini',
    usage: '.gemini ta question',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .gemini ta question')
      const key = process.env.GEMINI_KEY
      if (!key) return reply(sock, msg, '❌ Clé Gemini non configurée dans .env')
      await react(sock, msg, '🤔')
      const prompt = args.join(' ')
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
          { contents: [{ parts: [{ text: prompt }] }] },
          { timeout: 30000 }
        )
        const answer = res.data.candidates[0].content.parts[0].text.trim()
        await reply(sock, msg, `✨ *Gemini AI*\n\n${answer}`)
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur Gemini: ' + (e.response?.data?.error?.message || e.message))
      }
    }
  },

  {
    name: 'imagine',
    aliases: ['dalle', 'genimg', 'gen'],
    category: 'ai',
    desc: 'Générer 3 variantes d\'une image (IA, gratuit)',
    usage: '.imagine <description>',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .imagine <description>\nEx: .imagine un chat astronaute')
      await react(sock, msg, '🎨')
      const prompt = args.join(' ')
      try {
        const seeds = [Math.floor(Math.random() * 1e6), Math.floor(Math.random() * 1e6), Math.floor(Math.random() * 1e6)]
        const promises = seeds.map(seed =>
          axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`, {
            responseType: 'arraybuffer',
            timeout: 60000
          }).then(r => Buffer.from(r.data)).catch(() => null)
        )
        const results = (await Promise.all(promises)).filter(Boolean)
        if (!results.length) return reply(sock, msg, '❌ Aucune image générée. Réessaie.')
        for (let i = 0; i < results.length; i++) {
          await sock.sendMessage(from, {
            image:   results[i],
            caption: `🎨 *Variante ${i + 1}/${results.length}*\n_${prompt}_`
          }, { quoted: msg })
        }
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur génération image: ' + e.message)
      }
    }
  },

  // ─── SUMMARIZE ───────────────────────────────────────────────────────────
  {
    name: 'summarize',
    aliases: ['resume', 'tldr'],
    category: 'ai',
    desc: 'Résumer un texte (ou message cité)',
    usage: '.summarize <texte> OU reply + .summarize',
    execute: async ({ sock, msg, from, args }) => {
      let text = args.join(' ')
      if (!text) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        text = q?.conversation || q?.extendedTextMessage?.text || ''
      }
      if (!text || text.length < 50) return reply(sock, msg, '❌ Texte trop court (min 50 caractères).')
      await react(sock, msg, '🧠')
      try {
        const res = await axios.post('https://text.pollinations.ai/openai', {
          model: 'openai',
          messages: [
            { role: 'system', content: 'Tu résumes en français en 3 phrases maximum.' },
            { role: 'user', content: 'Résume ce texte:\n\n' + text }
          ]
        }, { timeout: 30000 })
        const summary = res.data?.choices?.[0]?.message?.content || String(res.data || '')
        await reply(sock, msg, `📋 *Résumé*\n\n${summary}`)
      } catch (e) { reply(sock, msg, '❌ Erreur résumé: ' + e.message) }
    }
  },

  // ─── EXPLAIN ─────────────────────────────────────────────────────────────
  {
    name: 'explain',
    aliases: ['explique'],
    category: 'ai',
    desc: 'Explique un texte, code ou concept',
    usage: '.explain <texte> OU reply + .explain',
    execute: async ({ sock, msg, from, args }) => {
      let text = args.join(' ')
      if (!text) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        text = q?.conversation || q?.extendedTextMessage?.text || ''
      }
      if (!text) return reply(sock, msg, '❌ Donne un texte ou réponds à un message.')
      await react(sock, msg, '🧠')
      try {
        const res = await axios.post('https://text.pollinations.ai/openai', {
          model: 'openai',
          messages: [
            { role: 'system', content: 'Tu expliques en français simplement, comme à un débutant.' },
            { role: 'user', content: 'Explique-moi:\n\n' + text }
          ]
        }, { timeout: 30000 })
        const ans = res.data?.choices?.[0]?.message?.content || String(res.data || '')
        await reply(sock, msg, `💡 *Explication*\n\n${ans}`)
      } catch (e) { reply(sock, msg, '❌ Erreur: ' + e.message) }
    }
  },

  // ─── FIXCODE ─────────────────────────────────────────────────────────────
  {
    name: 'fixcode',
    aliases: ['debug'],
    category: 'ai',
    desc: 'Trouve et corrige les bugs d\'un code',
    usage: '.fixcode <code> OU reply + .fixcode',
    execute: async ({ sock, msg, from, args }) => {
      let code = args.join(' ')
      if (!code) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        code = q?.conversation || q?.extendedTextMessage?.text || ''
      }
      if (!code) return reply(sock, msg, '❌ Donne du code ou réponds à un message.')
      await react(sock, msg, '🐛')
      try {
        const res = await axios.post('https://text.pollinations.ai/openai', {
          model: 'openai',
          messages: [
            { role: 'system', content: 'Tu es un expert dev. Trouve les bugs et donne le code corrigé en français.' },
            { role: 'user', content: 'Trouve et corrige les bugs:\n\n```\n' + code + '\n```' }
          ]
        }, { timeout: 45000 })
        const ans = res.data?.choices?.[0]?.message?.content || String(res.data || '')
        await reply(sock, msg, `🛠️ *Correction*\n\n${ans}`)
      } catch (e) { reply(sock, msg, '❌ Erreur: ' + e.message) }
    }
  },

  // ─── DETECT (langue) ─────────────────────────────────────────────────────
  {
    name: 'detect',
    aliases: ['detectlang'],
    category: 'ai',
    desc: 'Détecte la langue d\'un texte',
    usage: '.detect <texte> OU reply + .detect',
    execute: async ({ sock, msg, from, args }) => {
      let text = args.join(' ')
      if (!text) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        text = q?.conversation || q?.extendedTextMessage?.text || ''
      }
      if (!text) return reply(sock, msg, '❌ Donne un texte.')
      try {
        const res = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 200))}&langpair=auto|en`,
          { timeout: 10000 }
        )
        const detected = res.data?.responseData?.detectedLanguage || res.data?.matches?.[0]?.source || 'inconnu'
        await reply(sock, msg, `🌍 *Langue détectée :* \`${detected}\``)
      } catch (e) { reply(sock, msg, '❌ Erreur: ' + e.message) }
    }
  },

  {
    name: 'translate',
    aliases: ['tr'],
    category: 'ai',
    desc: 'Traduire un texte (ou un message cité)',
    usage: '.translate <langue> [texte]  OU  reply + .translate <langue>',
    execute: async ({ sock, msg, from, args }) => {
      if (!args.length) return reply(sock, msg, '❌ Usage: .translate <langue> [texte]\nEx: .translate en Bonjour\nOu réponds à un message: .translate fr')

      const lang = args.shift().toLowerCase()
      let text = args.join(' ').trim()

      if (!text) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        if (quoted) {
          text = quoted.conversation
            || quoted.extendedTextMessage?.text
            || quoted.imageMessage?.caption
            || quoted.videoMessage?.caption
            || ''
        }
      }

      if (!text) return reply(sock, msg, '❌ Aucun texte à traduire. Ajoute du texte ou réponds à un message.')

      await react(sock, msg, '🌍')
      try {
        const res = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`,
          { timeout: 10000 }
        )
        const result = res.data?.responseData?.translatedText
        if (!result || result === text) {
          return reply(sock, msg, '⚠️ Traduction identique ou impossible. Vérifie le code langue (fr, en, es, de, ...).')
        }
        await reply(sock, msg, `🌍 *Traduction → ${lang.toUpperCase()}*\n\n${result}`)
        await react(sock, msg, '✅')
      } catch (e) {
        await reply(sock, msg, '❌ Erreur traduction: ' + e.message)
      }
    }
  },

  {
    name: 'summarize',
    aliases: ['resume', 'tldr'],
    category: 'ai',
    desc: 'Resumer un long texte ou un message cite',
    usage: '.summarize <texte> ou en repondant',
    execute: async ({ sock, msg, args }) => {
      let text = args.join(' ')
      if (!text) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        text = q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || ''
      }
      if (!text || text.length < 50) return reply(sock, msg, 'Texte trop court a resumer (min 50 caracteres).')
      await react(sock, msg, '🧠')
      try {
        const res = await axios.post('https://text.pollinations.ai/openai', {
          model: 'openai',
          messages: [
            { role: 'system', content: 'Tu resumes en francais en 3 phrases maximum.' },
            { role: 'user', content: 'Resume ce texte:\n\n' + text }
          ]
        }, { timeout: 30000 })
        const summary = res.data?.choices?.[0]?.message?.content || res.data
        await reply(sock, msg, `Resume\n\n${summary}`)
      } catch (e) { reply(sock, msg, 'Erreur resume: ' + e.message) }
    }
  },

  {
    name: 'explain',
    aliases: ['explique'],
    category: 'ai',
    desc: 'Explique un texte, code ou concept',
    usage: '.explain <texte> ou en repondant',
    execute: async ({ sock, msg, args }) => {
      let text = args.join(' ')
      if (!text) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        text = q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || ''
      }
      if (!text) return reply(sock, msg, 'Donne un texte ou reponds a un message.')
      await react(sock, msg, '🧠')
      try {
        const res = await axios.post('https://text.pollinations.ai/openai', {
          model: 'openai',
          messages: [
            { role: 'system', content: 'Tu expliques en francais simplement, comme a un debutant.' },
            { role: 'user', content: 'Explique-moi:\n\n' + text }
          ]
        }, { timeout: 30000 })
        const ans = res.data?.choices?.[0]?.message?.content || res.data
        await reply(sock, msg, `Explication\n\n${ans}`)
      } catch (e) { reply(sock, msg, 'Erreur: ' + e.message) }
    }
  },

  {
    name: 'fixcode',
    aliases: ['debug'],
    category: 'ai',
    desc: 'Trouve et corrige les bugs d un code',
    usage: '.fixcode <code> ou en repondant',
    execute: async ({ sock, msg, args }) => {
      let code = args.join(' ')
      if (!code) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        code = q?.conversation || q?.extendedTextMessage?.text || ''
      }
      if (!code) return reply(sock, msg, 'Donne du code ou reponds a un message.')
      await react(sock, msg, '🐛')
      try {
        const res = await axios.post('https://text.pollinations.ai/openai', {
          model: 'openai',
          messages: [
            { role: 'system', content: 'Tu es un expert dev. Trouve les bugs et donne le code corrige en francais.' },
            { role: 'user', content: 'Trouve et corrige les bugs:\n\n```\n' + code + '\n```' }
          ]
        }, { timeout: 45000 })
        const ans = res.data?.choices?.[0]?.message?.content || res.data
        await reply(sock, msg, `Correction\n\n${ans}`)
      } catch (e) { reply(sock, msg, 'Erreur: ' + e.message) }
    }
  },

  {
    name: 'detect',
    aliases: ['detectlang'],
    category: 'ai',
    desc: 'Detecte la langue d un texte',
    usage: '.detect <texte>',
    execute: async ({ sock, msg, args }) => {
      let text = args.join(' ')
      if (!text) {
        const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        text = q?.conversation || q?.extendedTextMessage?.text || ''
      }
      if (!text) return reply(sock, msg, 'Donne un texte.')
      try {
        const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|en`, { timeout: 10000 })
        const detected = res.data?.responseData?.detectedLanguage || res.data?.matches?.[0]?.source || 'inconnu'
        await reply(sock, msg, `Langue detectee: ${detected}`)
      } catch (e) { reply(sock, msg, 'Erreur: ' + e.message) }
    }
  }

]
