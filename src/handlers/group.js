require('dotenv').config()
const { getGroup } = require('../lib/database')
const { normalizeJid } = require('../lib/utils')

const BOT_NAME = process.env.BOT_NAME || 'MonBot'

/**
 * Gère les événements participants du groupe :
 * - add     → message de bienvenue si activé
 * - remove  → message d'au-revoir si activé
 * - promote → notification promotion admin
 * - demote  → notification démission admin
 */
const handleGroupEvents = async (sock, update) => {
  try {
    // update = { id, participants, action, author }
    const { id: groupId, participants, action, author } = update

    if (!groupId || !participants?.length) return

    // Récupérer les métadonnées du groupe
    let groupMeta = null
    try {
      groupMeta = await sock.groupMetadata(groupId)
    } catch {
      return // groupe inaccessible
    }

    const groupName = groupMeta?.subject || 'le groupe'

    // Récupérer config groupe depuis DB
    let groupData = null
    try {
      groupData = await getGroup(groupId)
    } catch {}

    for (const participant of participants) {
      const num = participant.split('@')[0]

      if (action === 'add') {
        // Message de bienvenue
        if (groupData?.welcome) {
          const customMsg = groupData.welcome_msg || 'Bienvenue @user dans *@group* ! 🎉'
          const text = customMsg
            .replace(/@user/g, `@${num}`)
            .replace(/@group/g, groupName)
          await sock.sendMessage(groupId, {
            text,
            mentions: [participant]
          })
        }
      }

      if (action === 'remove') {
        // Message d'au revoir (optionnel si activé)
        if (groupData?.goodbye) {
          const text = `👋 *${num}* a quitté ${groupName}. Bon courage !`
          await sock.sendMessage(groupId, { text })
        }
      }

      if (action === 'promote') {
        await sock.sendMessage(groupId, {
          text: `🎉 @${num} est maintenant *admin* du groupe !`,
          mentions: [participant]
        })
      }

      if (action === 'demote') {
        await sock.sendMessage(groupId, {
          text: `⬇️ @${num} n'est plus *admin* du groupe.`,
          mentions: [participant]
        })
      }
    }
  } catch (e) {
    console.error('Erreur handleGroupEvents:', e.message)
  }
}

module.exports = { handleGroupEvents }
