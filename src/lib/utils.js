const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const fs = require('fs-extra')
const path = require('path')

const TMP = path.join(__dirname, '../../data/tmp')
fs.ensureDirSync(TMP)

const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}j ${h % 24}h ${m % 60}m`
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

const downloadMedia = async (msg, type) => {
  const buffer = await downloadMediaMessage(msg, 'buffer', {})
  const ext = type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'bin'
  const filePath = path.join(TMP, `${Date.now()}.${ext}`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

const cleanTmp = async () => {
  const files = await fs.readdir(TMP)
  const now = Date.now()
  for (const f of files) {
    const fp = path.join(TMP, f)
    const stat = await fs.stat(fp)
    if (now - stat.mtimeMs > 3600000) await fs.remove(fp)
  }
}

const mention = (jid) => `@${jid.split('@')[0]}`

const getNumber = (jid) => jid.replace(/[^0-9]/g, '')

// ─── normalizeJid : retire le suffix ":N" de device ──────────────────────────
// "237690000000:97@s.whatsapp.net" → "237690000000@s.whatsapp.net"
// "237690000000@s.whatsapp.net"   → inchangé
// "110574453129452@lid"           → inchangé
const normalizeJid = (jid) => {
  if (!jid || typeof jid !== 'string') return ''
  const atIdx = jid.indexOf('@')
  if (atIdx === -1) return jid.split(':')[0]
  const user   = jid.slice(0, atIdx)
  const server = jid.slice(atIdx)
  return user.split(':')[0] + server
}

// ─── isAdmin : compatible @s.whatsapp.net ET @lid ────────────────────────────
// Cherche par JID normalisé d'abord, puis par numéro extrait (cross-format)
const isAdmin = (participants, jid) => {
  if (!jid || !participants?.length) return false
  const normJid = normalizeJid(jid)
  const phone   = normJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')

  const found = participants.find(p => {
    if (normalizeJid(p.id) === normJid) return true
    if (phone && p.id.split('@')[0].replace(/[^0-9]/g, '') === phone) return true
    if (phone && p.phoneNumber && p.phoneNumber.replace(/[^0-9]/g, '') === phone) return true
    return false
  })

  return !!(found && (found.admin === 'admin' || found.admin === 'superadmin'))
}

// ─── reply ────────────────────────────────────────────────────────────────────
const reply = async (sock, msg, text) => {
  return sock.sendMessage(msg.key.remoteJid, { text: String(text) }, { quoted: msg })
}

// ─── react : silencieux si non supporté ──────────────────────────────────────
const react = async (sock, msg, emoji) => {
  try {
    return await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key }
    })
  } catch {
    // Réaction non supportée — ignoré
  }
}

// ─── sendWithReact ────────────────────────────────────────────────────────────
const sendWithReact = async (sock, msg, text, emoji = '✅') => {
  await reply(sock, msg, text)
  await react(sock, msg, emoji)
}

module.exports = {
  formatDuration,
  formatSize,
  downloadMedia,
  cleanTmp,
  mention,
  getNumber,
  normalizeJid,
  isAdmin,
  reply,
  react,
  sendWithReact,
  TMP
}
