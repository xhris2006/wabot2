/**
 * AUTO STATUS READER + STICKER COMMAND HANDLER
 * À intégrer dans ton fichier principal (index.js)
 * dans le bloc sock.ev.on('messages.upsert', ...)
 */

// ════════════════════════════════════════════════════════
// HANDLER: VUE AUTOMATIQUE DES STATUTS
// Ajoute ceci dans ton events handler messages.upsert
// ════════════════════════════════════════════════════════
async function handleAutoStatus(sock, msg, config) {
  if (!config.autoReadStatus) return
  if (msg.key.remoteJid !== 'status@broadcast') return

  try {
    await sock.readMessages([msg.key])
    // Optionnel: réagir aux statuts
    // await sock.sendMessage(msg.key.remoteJid, { react: { text: '❤️', key: msg.key }})
    console.log(`[AutoStatus] Vue le statut de ${msg.key.participant}`)
  } catch (e) {
    console.error('[AutoStatus] Erreur:', e.message)
  }
}

// ════════════════════════════════════════════════════════
// HANDLER: COMMANDES SUR STICKER
// Ajoute ceci dans ton events handler messages.upsert
// AVANT le handler de commandes normal
// ════════════════════════════════════════════════════════
async function handleStickerCmd(sock, msg, db, executeCommand) {
  const stickerMsg = msg.message?.stickerMessage
  if (!stickerMsg) return false

  const hash = stickerMsg.fileSha256?.toString('hex') ||
               stickerMsg.fileEncSha256?.toString('hex')
  if (!hash) return false

  const cmd = db.stickerCmds?.[hash]
  if (!cmd) return false

  console.log(`[StickerCmd] Sticker déclenche la commande: ${cmd}`)
  await executeCommand(sock, msg, cmd, [])
  return true
}

// ════════════════════════════════════════════════════════
// EXEMPLE D'INTÉGRATION dans index.js
// ════════════════════════════════════════════════════════
/*
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const msg of messages) {
    if (!msg.message) continue

    // 1. Auto-vue des statuts
    await handleAutoStatus(sock, msg, config)
    if (msg.key.remoteJid === 'status@broadcast') continue

    // 2. Commandes sur stickers
    const isStickerCmd = await handleStickerCmd(sock, msg, db, executeCommand)
    if (isStickerCmd) continue

    // 3. Handler normal de commandes
    const text = msg.message?.conversation ||
                 msg.message?.extendedTextMessage?.text || ''
    if (!text.startsWith(config.prefix)) continue

    // ... reste de ton code
  }
})
*/

module.exports = { handleAutoStatus, handleStickerCmd }
