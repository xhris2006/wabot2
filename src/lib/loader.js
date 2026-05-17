const fs = require('fs')
const path = require('path')

const commands = new Map()
const aliases = new Map()

const loadCommands = () => {
  const cmdDir = path.join(__dirname, '../commands')
  const categories = fs.readdirSync(cmdDir)

  for (const cat of categories) {
    const catPath = path.join(cmdDir, cat)
    if (!fs.statSync(catPath).isDirectory()) continue
    const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'))

    for (const file of files) {
      try {
        const mod = require(path.join(catPath, file))
        const cmds = Array.isArray(mod) ? mod : [mod]
        for (const cmd of cmds) {
          if (!cmd.name) continue
          if (!cmd.category) cmd.category = cat

          // ── Normalisation : si la commande utilise handler (nouveau système)
          // mais pas execute (ancien système), créer un wrapper execute
          // pour que message.js puisse toujours appeler oldCmd.execute()
          if (typeof cmd.handler === 'function' && typeof cmd.execute !== 'function') {
            cmd.execute = async (ctx) => {
              const replyFn = (text) => ctx.sock.sendMessage(ctx.from, { text }, { quoted: ctx.msg })
              await cmd.handler(ctx.sock, ctx.msg, {
                args:         ctx.args || [],
                reply:        replyFn,
                quoted:       ctx.quoted,
                sender:       ctx.sender,
                isOwner:      ctx.isOwner,
                isSudo:       ctx.isSudo,
                isGroup:      ctx.isGroup,
                from:         ctx.from,
                config:       ctx.config,
                db:           ctx.db,
                groupMeta:    ctx.groupMeta,
                participants: ctx.participants,
                botIsAdmin:   ctx.botIsAdmin,
                senderIsAdmin: ctx.senderIsAdmin,
                prefix:       ctx.prefix,
                botId:        ctx.botId
              })
            }
          }

          commands.set(cmd.name, cmd)
          if (cmd.aliases) {
            for (const alias of cmd.aliases) aliases.set(alias, cmd.name)
          }
        }
      } catch (e) {
        console.error(`❌ Erreur chargement ${file}:`, e.message)
      }
    }
  }

  console.log(`✅ ${commands.size} commandes chargées`)
  return commands
}

const getCommand = (name) => {
  return commands.get(name) || commands.get(aliases.get(name))
}

module.exports = { loadCommands, getCommand, commands }
