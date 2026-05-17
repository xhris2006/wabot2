/**
 * commands/user/advanced.js
 * whois, mention, antigstatus, inactive, publi, private, pdf, arttext
 */
const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { loadConfig, saveConfig } = require('../../lib/config')
const { getGroup, setGroup }     = require('../../lib/database')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ─── Helper : résoudre la cible (mention OU reply) ────────────────────────────
function resolveTarget(msg) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
  if (mentioned.length) return mentioned[0]
  const ctx = msg.message?.extendedTextMessage?.contextInfo
  if (ctx?.participant) return ctx.participant
  return null
}

// ─── ArtText : rendu ASCII-art / style visuel en texte ───────────────────────
const ART_STYLES = {
  '3D': (t) => {
    const map = {'a':'𝕒','b':'𝕓','c':'𝕔','d':'𝕕','e':'𝕖','f':'𝕗','g':'𝕘','h':'𝕙','i':'𝕚','j':'𝕛','k':'𝕜','l':'𝕝','m':'𝕞','n':'𝕟','o':'𝕠','p':'𝕡','q':'𝕢','r':'𝕣','s':'𝕤','t':'𝕥','u':'𝕦','v':'𝕧','w':'𝕨','x':'𝕩','y':'𝕪','z':'𝕫'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'ANGEL': (t) => {
    const map = {'a':'ꪖ','b':'ᵬ','c':'ꪗ','d':'ᦔ','e':'ꦌ','f':'ᶠ','g':'ᵍ','h':'ꫝ','i':'𝓲','j':'ꠋ','k':'ƙ','l':'ꪶ','m':'ꪑ','n':'ꪀ','o':'ꪮ','p':'ρ','q':'զ','r':'ɾ','s':'ᦓ','t':'ƚ','u':'ꪊ','v':'ᵥ','w':'ɯ','x':'᥊','y':'ყ','z':'ƶ'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'AVENGER': (t) => {
    const map = {'a':'卂','b':'乃','c':'匚','d':'ᗪ','e':'乇','f':'千','g':'Ᵽ','h':'卄','i':'丨','j':'フ','k':'Ҝ','l':'ㄥ','m':'爪','n':'几','o':'ㄖ','p':'卩','q':'Ɋ','r':'尺','s':'丂','t':'ㄒ','u':'ㄩ','v':'ᐯ','w':'ᗯ','x':'乂','y':'ㄚ','z':'乙'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'BLUB': (t) => {
    const map = {'a':'α','b':'в','c':'¢','d':'∂','e':'є','f':'ƒ','g':'g','h':'н','i':'ι','j':'נ','k':'к','l':'ℓ','m':'м','n':'и','o':'σ','p':'ρ','q':'q','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'у','z':'z'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'BPINK': (t) => {
    const map = {'a':'꒒','b':'ꒁ','c':'꒒','d':'ꒄ','e':'ꒅ','f':'ꒊ','g':'ꒀ','h':'꒒','i':'ꒀ','j':'꒒','k':'ꒁ','l':'꒒','m':'ꒁ','n':'ꒄ','o':'ꒊ','p':'ꒅ','q':'ꒀ','r':'ꒀ','s':'ꒁ','t':'ꒄ','u':'ꒅ','v':'ꒊ','w':'ꒀ','x':'ꒀ','y':'ꒁ','z':'ꒄ'}
    return '🌸 ' + t.split('').join(' ') + ' 🌸'
  },
  'CAT': (t) => {
    return '≽^• ⩊ •^≼ ' + t.toUpperCase() + ' ≽^• ⩊ •^≼'
  },
  'GLITCH': (t) => {
    const glitch = ['̴','̵','̶','̷','̸']
    return t.split('').map(c => c + glitch[Math.floor(Math.random()*glitch.length)]).join('')
  },
  'GLITTER': (t) => '✨ ' + t.toUpperCase().split('').join(' ✦ ') + ' ✨',
  'GRAFFITI': (t) => {
    const map = {'a':'𝔸','b':'𝔹','c':'ℂ','d':'𝔻','e':'𝔼','f':'𝔽','g':'𝔾','h':'ℍ','i':'𝕀','j':'𝕁','k':'𝕂','l':'𝕃','m':'𝕄','n':'ℕ','o':'𝕆','p':'ℙ','q':'ℚ','r':'ℝ','s':'𝕊','t':'𝕋','u':'𝕌','v':'𝕍','w':'𝕎','x':'𝕏','y':'𝕐','z':'ℤ'}
    return t.toLowerCase().split('').map(c => map[c] || c.toUpperCase()).join('')
  },
  'HACKER': (t) => {
    const map = {'a':'4','b':'8','c':'(','d':'|)','e':'3','f':'|=','g':'6','h':'|-|','i':'!','j':'_|','k':'|<','l':'1','m':'|V|','n':'|\\|','o':'0','p':'|*','q':'0,','r':'|2','s':'5','t':'7','u':'|_|','v':'\\/','w':'VV','x':'><','y':'`/','z':'2'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'LIGHT': (t) => '🌟 ' + t.toUpperCase() + ' 🌟',
  'MARVEL': (t) => {
    const map = {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'NEON': (t) => '꧁' + t.toUpperCase().split('').join('꧁꧂') + '꧂',
  'SCI': (t) => {
    const map = {'a':'𝙖','b':'𝙗','c':'𝙘','d':'𝙙','e':'𝙚','f':'𝙛','g':'𝙜','h':'𝙝','i':'𝙞','j':'𝙟','k':'𝙠','l':'𝙡','m':'𝙢','n':'𝙣','o':'𝙤','p':'𝙥','q':'𝙦','r':'𝙧','s':'𝙨','t':'𝙩','u':'𝙪','v':'𝙫','w':'𝙬','x':'𝙭','y':'𝙮','z':'𝙯'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'SIGN': (t) => '『 ' + t.toUpperCase() + ' 』',
  'TATTOO': (t) => {
    const map = {'a':'𝓪','b':'𝓫','c':'𝓬','d':'𝓭','e':'𝓮','f':'𝓯','g':'𝓰','h':'𝓱','i':'𝓲','j':'𝓳','k':'𝓴','l':'𝓵','m':'𝓶','n':'𝓷','o':'𝓸','p':'𝓹','q':'𝓺','r':'𝓻','s':'𝓼','t':'𝓽','u':'𝓾','v':'𝓿','w':'𝔀','x':'𝔁','y':'𝔂','z':'𝔃'}
    return t.toLowerCase().split('').map(c => map[c] || c).join('')
  },
  'WATERCOLOR': (t) => {
    const colors = ['🔴','🟠','🟡','🟢','🔵','🟣']
    return t.toUpperCase().split('').map((c,i) => colors[i % colors.length] + c).join('') + '🎨'
  }
}

module.exports = {

  // ════════════════════════════════════════════════════════════════════════════
  // ARTTEXT — Créer un texte artistique
  // ════════════════════════════════════════════════════════════════════════════
  arttext: {
    desc: 'Créer un texte avec différents styles artistiques',
    aliases: ['art', 'design', 'text'],
    category: 'fun',
    usage: '.arttext <style> <texte> | .arttext list',
    handler: async (sock, msg, { args, reply }) => {
      const styleNames = Object.keys(ART_STYLES)
      if (!args.length || args[0].toLowerCase() === 'list') {
        return reply(
          '🎨 *Styles disponibles:*\n\n' +
          styleNames.map(s => `│ ${s}`).join('\n') +
          '\n\n_Usage: .arttext <style> <texte>_\n_Ex: .arttext NEON Bonjour_'
        )
      }

      const styleKey = args[0].toUpperCase()
      const text     = args.slice(1).join(' ')

      if (!text) return reply(`❌ Donne un texte.\nEx: .arttext ${styleKey} Bonjour`)
      if (!ART_STYLES[styleKey]) {
        return reply(`❌ Style inconnu: *${styleKey}*\n\nStyles dispo:\n` + styleNames.map(s => `• ${s}`).join('\n'))
      }

      const result = ART_STYLES[styleKey](text)
      await reply(
        `🎨 *Style: ${styleKey}*\n\n` +
        `📝 Original: ${text}\n` +
        `✨ Résultat: ${result}`
      )
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // WHOIS — Voir le profil d'un utilisateur
  // ════════════════════════════════════════════════════════════════════════════
  whois: {
    desc: 'Voir le profil d\'un utilisateur (reply ou mention)',
    aliases: ['profile', 'userinfo'],
    category: 'user',
    usage: '.whois @mention | .whois (reply) | .whois 237XXXXXXX',
    handler: async (sock, msg, { args, reply, quoted, isGroup }) => {
      try {
        let targetJid = resolveTarget(msg)

        // Fallback : argument numéro
        if (!targetJid && args[0]) {
          const num = args[0].replace(/[^0-9]/g, '')
          if (num.length >= 7) targetJid = `${num}@s.whatsapp.net`
        }

        // En privé sans argument → l'interlocuteur
        if (!targetJid && !isGroup) targetJid = msg.key.remoteJid

        if (!targetJid) return reply('❌ Mentionne quelqu\'un, réponds à un message, ou donne un numéro.')

        // Normaliser en @s.whatsapp.net
        const num      = targetJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        const cleanJid = `${num}@s.whatsapp.net`
        const phone    = '+' + num

        // Récupérer les infos
        let bio    = '—'
        let ppUrl  = null
        let name   = '—'

        try {
          const status = await sock.fetchStatus(cleanJid)
          if (status?.status) bio = status.status
        } catch {}

        try {
          ppUrl = await sock.profilePictureUrl(cleanJid, 'image')
        } catch {}

        // Nom depuis le message si disponible
        if (msg.pushName && (cleanJid === msg.key.remoteJid || cleanJid === msg.key.participant)) {
          name = msg.pushName
        }

        const text =
          `╔══ 👤 *PROFIL* ══╗\n` +
          `║ 📛 Nom: *${name}*\n` +
          `║ 📞 Numéro: *${phone}*\n` +
          `║ 🆔 JID: \`${cleanJid}\`\n` +
          `║ 💬 Bio: _${bio}_\n` +
          `╚══════════════════╝`

        if (ppUrl) {
          await sock.sendMessage(msg.key.remoteJid, {
            image:   { url: ppUrl },
            caption: text
          }, { quoted: msg })
        } else {
          await reply(text + '\n🖼️ _Photo non disponible_')
        }
      } catch (e) { reply('❌ Erreur whois: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // MENTION — Message personnalisé quand l'utilisateur est mentionné
  // Active/désactive une réponse automatique sur mention du bot
  // ════════════════════════════════════════════════════════════════════════════
  mention: {
    desc: 'Configurer la réponse automatique quand le bot est mentionné',
    aliases: ['onmention', 'automention'],
    category: 'user',
    ownerOnly: true,
    usage: '.mention on [message] | .mention off',
    handler: async (sock, msg, { args, reply }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) {
        return reply(
          '❌ Usage:\n' +
          '.mention on Je suis occupé, reviens plus tard !\n' +
          '.mention off'
        )
      }
      const config = loadConfig()
      if (val === 'on') {
        const mentionMsg = args.slice(1).join(' ') || 'Bonjour ! 👋 Je suis un bot WhatsApp. Tape *' + (config.prefix || '.') + 'help* pour voir les commandes.'
        config.mentionReply  = true
        config.mentionMessage = mentionMsg
        await saveConfig(config)
        reply(`✅ Mention reply *activé*\n\nMessage: _${mentionMsg}_`)
      } else {
        config.mentionReply = false
        await saveConfig(config)
        reply('✅ Mention reply *désactivé*.')
      }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ANTIGSTATUS — Refuser les mentions de groupe dans les statuts
  // ════════════════════════════════════════════════════════════════════════════
  antigstatus: {
    desc: 'Ignorer les mentions de groupe dans les statuts WhatsApp',
    aliases: ['antigroupstatus', 'nogs'],
    category: 'user',
    ownerOnly: true,
    usage: '.antigstatus on|off',
    handler: async (sock, msg, { args, reply }) => {
      const val = args[0]?.toLowerCase()
      if (!['on', 'off'].includes(val)) return reply('❌ Usage: .antigstatus on|off')
      const config = loadConfig()
      config.antigstatus = val === 'on'
      await saveConfig(config)
      reply(val === 'on'
        ? '🔕 Antigstatus *activé* — les mentions de groupe dans les statuts seront ignorées.'
        : '🔔 Antigstatus *désactivé*.')
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // INACTIVE — Mentionner les membres inactifs d'un groupe
  // ════════════════════════════════════════════════════════════════════════════
  inactive: {
    desc: 'Mentionner les membres inactifs du groupe',
    aliases: ['inactif'],
    category: 'group',
    group: true,
    admin: true,
    usage: '.inactive [jours] — défaut: 7 jours',
    handler: async (sock, msg, { args, reply, participants, from }) => {
      try {
        const days    = parseInt(args[0]) || 7
        const { loadDB } = require('../../lib/database')
        const db      = loadDB()
        const now     = Date.now()
        const cutoff  = now - days * 24 * 60 * 60 * 1000

        // Récupérer les dernières activités depuis le msgStore si disponible
        // Sinon, utiliser le timestamp de création du membre comme fallback
        const inactiveMembers = participants.filter(p => {
          if (p.admin) return false // Ignorer les admins
          const lastSeen = db.activity?.[from]?.[p.id] || 0
          return lastSeen < cutoff
        })

        if (!inactiveMembers.length) {
          return reply(`✅ Aucun membre inactif depuis *${days}* jours !`)
        }

        const mentions = inactiveMembers.map(p => p.id)
        const list     = inactiveMembers.map(p => `• @${p.id.split('@')[0]}`).join('\n')

        await sock.sendMessage(from, {
          text: `⏰ *Membres inactifs depuis ${days} jours (${inactiveMembers.length}):*\n\n${list}\n\n_Faites signe ou vous serez expulsés !_`,
          mentions
        })
      } catch (e) { reply('❌ Erreur inactive: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLI — Rendre le groupe public (anyone can join via link)
  // ════════════════════════════════════════════════════════════════════════════
  grouppublic: {
    desc: 'Rendre le groupe public (tout le monde peut envoyer)',
    aliases: ['groupopen', 'gpublic', 'publi', 'everyone'],
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    usage: '.grouppublic',
    handler: async (sock, msg, { reply, from }) => {
      try {
        // not_announcement = tout le monde peut envoyer
        await sock.groupSettingUpdate(from, 'not_announcement')
        // unlocked = n'importe qui peut modifier les infos du groupe
        await sock.groupSettingUpdate(from, 'unlocked').catch(() => {})
        await reply('🌐 Groupe maintenant *public* — tout le monde peut écrire.')
      } catch (e) { reply('❌ Erreur publi: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE — Rendre le groupe privé (seuls les admins écrivent)
  // ════════════════════════════════════════════════════════════════════════════
  groupprivate: {
    desc: 'Rendre le groupe privé (seuls les admins écrivent)',
    aliases: ['grouplock', 'gprivate', 'prive', 'locked'],
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    usage: '.groupprivate',
    handler: async (sock, msg, { reply, from }) => {
      try {
        // announcement = seuls les admins peuvent envoyer
        await sock.groupSettingUpdate(from, 'announcement')
        // locked = seuls les admins peuvent modifier les infos
        await sock.groupSettingUpdate(from, 'locked').catch(() => {})
        await reply('🔒 Groupe maintenant *privé* — seuls les admins peuvent écrire.')
      } catch (e) { reply('❌ Erreur private: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // PDF — Convertir une image ou du texte en PDF
  // ════════════════════════════════════════════════════════════════════════════
  pdf: {
    desc: 'Convertir une image ou du texte en PDF',
    aliases: ['topdf', 'img2pdf'],
    category: 'user',
    usage: '.pdf <texte> | .pdf (reply à une image)',
    handler: async (sock, msg, { args, reply, quoted }) => {
      try {
        const from = msg.key.remoteJid
        const text = args.join(' ')
        const qMsg = quoted?.message || {}
        const hasImage = !!(qMsg.imageMessage || msg.message?.imageMessage)

        if (!text && !hasImage) {
          return reply('❌ Donne du texte ou réponds à une image.\nEx: .pdf Mon rapport\nEx: .pdf (reply image)')
        }

        await reply('⏳ Génération du PDF en cours...')

        // Créer un PDF simple avec PDFKit si disponible
        let pdfBuffer
        try {
          const PDFDocument = require('pdfkit')
          const doc         = new PDFDocument({ margin: 50 })
          const chunks      = []

          doc.on('data', chunk => chunks.push(chunk))
          doc.on('end', () => {})

          // En-tête
          doc.fontSize(16).font('Helvetica-Bold').text('Document généré par le bot', { align: 'center' })
          doc.moveDown()
          doc.fontSize(10).text(new Date().toLocaleString('fr-FR'), { align: 'right' })
          doc.moveDown(2)

          if (hasImage) {
            // Convertir l'image en PDF
            const imgMsg = msg.message?.imageMessage ? msg : { key: quoted.key, message: qMsg }
            const imgBuf = await downloadMediaMessage(imgMsg, 'buffer', {}, {
              logger: { info: () => {}, error: () => {}, warn: () => {} }
            })
            const tmpImg = path.join(os.tmpdir(), `pdf_img_${Date.now()}.jpg`)
            fs.writeFileSync(tmpImg, imgBuf)
            doc.image(tmpImg, { fit: [500, 600], align: 'center' })
            try { fs.unlinkSync(tmpImg) } catch {}
          }

          if (text) {
            doc.fontSize(12).font('Helvetica').text(text, { align: 'left', lineGap: 4 })
          }

          doc.end()
          await new Promise(r => setTimeout(r, 500))
          pdfBuffer = Buffer.concat(chunks)

        } catch (pdfErr) {
          // PDFKit non installé → créer un PDF minimal manuellement
          const content = text || '[Image jointe — PDFKit requis pour convertir]'
          const pdfLines = [
            '%PDF-1.4',
            '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
            '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
            `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
            `4 0 obj<</Length ${content.length + 50}>>stream\nBT /F1 12 Tf 50 750 Td (${content.replace(/[()\\]/g,'')}) Tj ET\nendstream\nendobj`,
            '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
            'xref\n0 6',
            '0000000000 65535 f',
            '%%EOF'
          ]
          pdfBuffer = Buffer.from(pdfLines.join('\n'), 'utf-8')
        }

        const fileName = text
          ? `${text.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
          : `image_${Date.now()}.pdf`

        await sock.sendMessage(from, {
          document: pdfBuffer,
          fileName,
          mimetype: 'application/pdf',
          caption:  '📄 _PDF généré avec succès_'
        }, { quoted: msg })

      } catch (e) { reply('❌ Erreur pdf: ' + e.message) }
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // WEBSCAN — Analyser une URL
  // ════════════════════════════════════════════════════════════════════════════
  webscan: {
    desc: 'Analyser une URL (titre, technologies, sécurité)',
    aliases: ['scan', 'urlinfo'],
    category: 'info',
    usage: '.webscan <url>',
    handler: async (sock, msg, { args, reply }) => {
      if (!args.length) return reply('❌ Usage: .webscan <url>')
      const url = args[0]
      if (!/^https?:\/\//.test(url)) return reply('❌ URL invalide (doit commencer par http:// ou https://)')

      await reply('🔍 Analyse en cours...')
      try {
        const axios    = require('axios')
        const { URL }  = require('url')
        const parsed   = new URL(url)
        const start    = Date.now()
        const res = await axios.get(url, {
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XHRIS Bot)' }
        })
        const responseTime = Date.now() - start

        const html    = String(res.data || '').slice(0, 200000)
        const title   = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim()
        const desc    = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || '').trim()
        const ogImage = (html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] || '').trim()

        const techs = []
        if (/wp-content|wordpress/i.test(html)) techs.push('WordPress')
        if (/<script[^>]+react/i.test(html) || /__NEXT_DATA__/.test(html)) techs.push('React/Next.js')
        if (/cloudflare/i.test(JSON.stringify(res.headers))) techs.push('Cloudflare')
        if (/jquery/i.test(html)) techs.push('jQuery')
        if (/bootstrap/i.test(html)) techs.push('Bootstrap')
        if (/tailwind/i.test(html)) techs.push('Tailwind')

        const sec = []
        if (res.headers['strict-transport-security']) sec.push('HSTS')
        if (res.headers['x-frame-options'])           sec.push('X-Frame-Options')
        if (res.headers['content-security-policy'])   sec.push('CSP')
        if (res.headers['x-content-type-options'])    sec.push('X-Content-Type')

        const text =
          `🌐 *Web Scan*\n\n` +
          `🔗 *URL:* ${url}\n` +
          `🏠 *Domaine:* ${parsed.hostname}\n` +
          `📊 *Statut:* ${res.status} ${res.statusText || ''}\n` +
          `⚡ *Temps:* ${responseTime}ms\n\n` +
          (title ? `📝 *Titre:* ${title}\n` : '') +
          (desc  ? `📄 *Description:* ${desc.slice(0, 200)}\n` : '') +
          `\n🔧 *Technologies:* ${techs.length ? techs.join(', ') : 'Aucune détectée'}\n` +
          `🛡️ *Sécurité:* ${sec.length ? sec.join(', ') : '⚠️ Aucun header de sécurité'}\n` +
          `🔒 *HTTPS:* ${url.startsWith('https') ? '✅' : '❌'}\n`

        if (ogImage) {
          try {
            const imgSrc = ogImage.startsWith('http') ? ogImage : new URL(ogImage, url).toString()
            const imgRes = await axios.get(imgSrc, { responseType: 'arraybuffer', timeout: 8000 })
            await sock.sendMessage(msg.key.remoteJid, { image: Buffer.from(imgRes.data), caption: text }, { quoted: msg })
          } catch {
            await reply(text)
          }
        } else {
          await reply(text)
        }
      } catch (e) {
        reply('❌ Erreur scan: ' + e.message)
      }
    }
  }

}
