const axios = require('axios')

// Historique de conversation par clé unique (jid_num_provider)
const conversations = new Map()

const PROVIDERS = {
  claude: {
    name: 'Claude',
    keyEnv: 'ANTHROPIC_API_KEY',
    call: async (apiKey, history) => {
      const r = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-opus-4-5-20250929',
        max_tokens: 1024,
        messages: history
      }, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 60000
      })
      return r.data?.content?.[0]?.text || ''
    }
  },
  gpt: {
    name: 'ChatGPT',
    keyEnv: 'OPENAI_API_KEY',
    call: async (apiKey, history) => {
      const r = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: history,
        max_tokens: 1024
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 60000
      })
      return r.data?.choices?.[0]?.message?.content || ''
    }
  },
  gemini: {
    name: 'Gemini',
    keyEnv: 'GEMINI_API_KEY',
    call: async (apiKey, history) => {
      const contents = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        { contents },
        { timeout: 60000 }
      )
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }
  },
  grok: {
    name: 'Grok',
    keyEnv: 'GROK_API_KEY',
    call: async (apiKey, history) => {
      const r = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-2-latest',
        messages: history,
        max_tokens: 1024
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 60000
      })
      return r.data?.choices?.[0]?.message?.content || ''
    }
  }
}

function getConvKey(jid, sender, provider) {
  const num = sender.split(':')[0].split('@')[0]
  return `${jid}_${num}_${provider}`
}

function hasActiveConversation(jid, sender, provider) {
  return conversations.has(getConvKey(jid, sender, provider))
}

async function continueConversation(provider, sock, msg, text, sender) {
  const cfg    = PROVIDERS[provider]
  const apiKey = process.env[cfg.keyEnv]
  if (!apiKey) return

  const jid = msg.key.remoteJid
  const key  = getConvKey(jid, sender, provider)
  if (!conversations.has(key)) return

  const history = conversations.get(key)
  history.push({ role: 'user', content: text })
  while (history.length > 20) history.shift()

  try {
    const answer = await cfg.call(apiKey, history)
    history.push({ role: 'assistant', content: answer })
    await sock.sendMessage(jid, {
      text: `🤖 *${cfg.name}*\n\n${answer}\n\n_Réponds pour continuer • tape "close ${provider}" pour fermer_`
    }, { quoted: msg })
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erreur ${cfg.name}: ${e.message}` }, { quoted: msg })
  }
}

async function chatWithProvider(provider, sock, msg, { args, reply, sender }) {
  const cfg    = PROVIDERS[provider]
  const apiKey = process.env[cfg.keyEnv]
  if (!apiKey) {
    return reply(
      `❌ *${cfg.name} non configuré.*\n\nL\'admin doit définir \`${cfg.keyEnv}\` dans le .env du bot.`
    )
  }

  if (!args.length) {
    return reply(
      `❌ Usage: .${provider} <ton message>\n\nUne fois lancée, réponds simplement aux messages du bot.\nTape *close ${provider}* pour fermer.`
    )
  }

  const message = args.join(' ')

  // Fermeture de conversation
  if (message.toLowerCase() === 'close') {
    const key = getConvKey(msg.key.remoteJid, sender, provider)
    conversations.delete(key)
    return reply(`🚪 Conversation *${cfg.name}* fermée.`)
  }

  const key     = getConvKey(msg.key.remoteJid, sender, provider)
  const history = conversations.get(key) || []
  if (!conversations.has(key)) conversations.set(key, history)

  history.push({ role: 'user', content: message })
  while (history.length > 20) history.shift()

  await reply(`💭 _${cfg.name} réfléchit..._`)

  try {
    const answer = await cfg.call(apiKey, history)
    history.push({ role: 'assistant', content: answer })
    await reply(`🤖 *${cfg.name}*\n\n${answer}\n\n_Réponds pour continuer • close pour fermer_`)
  } catch (e) {
    reply(`❌ Erreur ${cfg.name}: ${e.response?.data?.error?.message || e.message}`)
  }
}

module.exports = {
  claude: {
    desc: 'Discuter avec Claude AI',
    category: 'ai',
    usage: '.claude <message> | close claude pour fermer',
    handler: (sock, msg, ctx) => chatWithProvider('claude', sock, msg, ctx)
  },
  gpt: {
    desc: 'Discuter avec ChatGPT',
    aliases: ['chatgpt', 'openai'],
    category: 'ai',
    usage: '.gpt <message>',
    handler: (sock, msg, ctx) => chatWithProvider('gpt', sock, msg, ctx)
  },
  gemini: {
    desc: 'Discuter avec Gemini',
    aliases: ['google'],
    category: 'ai',
    usage: '.gemini <message>',
    handler: (sock, msg, ctx) => chatWithProvider('gemini', sock, msg, ctx)
  },
  grok: {
    desc: 'Discuter avec Grok (xAI)',
    aliases: ['xai'],
    category: 'ai',
    usage: '.grok <message>',
    handler: (sock, msg, ctx) => chatWithProvider('grok', sock, msg, ctx)
  }
}

module.exports.hasActiveConversation = hasActiveConversation
module.exports.continueConversation  = continueConversation
