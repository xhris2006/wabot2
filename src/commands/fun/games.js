const games = new Map()

function boardText(b) {
  return `${b[0] || '1'} | ${b[1] || '2'} | ${b[2] || '3'}\n${b[3] || '4'} | ${b[4] || '5'} | ${b[5] || '6'}\n${b[6] || '7'} | ${b[7] || '8'} | ${b[8] || '9'}`
}

function winner(b) {
  for (const line of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]) {
    const [a,c,d] = line
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]
  }
  return b.every(Boolean) ? 'draw' : null
}

module.exports = {
  tictactoe: {
    desc: 'Morpion en groupe',
    aliases: ['ttt'],
    category: 'fun',
    groupOnly: true,
    usage: '.tictactoe @user | .tictactoe <1-9>',
    handler: async (sock, msg, { args, reply, sender }) => {
      const chat = msg.key.remoteJid
      const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      if (mention) {
        games.set(chat, { players: [sender, mention], turn: 0, board: Array(9).fill(null) })
        return sock.sendMessage(chat, { text: `TicTacToe commence\nX: @${sender.split('@')[0]}\nO: @${mention.split('@')[0]}\n\n${boardText(Array(9).fill(null))}`, mentions: [sender, mention] }, { quoted: msg })
      }
      const game = games.get(chat)
      if (!game) return reply('Usage: .tictactoe @user pour commencer.')
      if (game.players[game.turn] !== sender) return reply('Ce n est pas ton tour.')
      const pos = parseInt(args[0], 10) - 1
      if (pos < 0 || pos > 8 || game.board[pos]) return reply('Choisis une case libre entre 1 et 9.')
      game.board[pos] = game.turn === 0 ? 'X' : 'O'
      const win = winner(game.board)
      if (win) {
        games.delete(chat)
        const text = win === 'draw' ? `Match nul\n\n${boardText(game.board)}` : `Victoire ${win}\n\n${boardText(game.board)}`
        return reply(text)
      }
      game.turn = game.turn ? 0 : 1
      await sock.sendMessage(chat, { text: `${boardText(game.board)}\n\nTour de @${game.players[game.turn].split('@')[0]}`, mentions: [game.players[game.turn]] }, { quoted: msg })
    }
  },

  akinator: {
    desc: 'Akinator simplifie',
    category: 'fun',
    handler: async (sock, msg, { reply }) => {
      await reply('Akinator complet necessite un moteur externe. Version simple: pense a un personnage, pose-moi des indices avec .ask ou utilise .truth pour jouer.')
    }
  }
}
