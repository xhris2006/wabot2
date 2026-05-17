/**
 * CONFIG HELPER
 * Utilitaire pour lire/sauvegarder la config dynamiquement
 * Place ce fichier dans lib/config.js
 */

const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, '../config.json')

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch (_) {
    return getDefaultConfig()
  }
}

function saveConfig(cfg) {
  return new Promise((resolve, reject) => {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8')
      resolve(true)
    } catch (e) {
      reject(e)
    }
  })
}

function getDefaultConfig() {
  return {
    prefix: '.',
    botName: 'WhatsApp Bot',
    ownerNumber: '',           // ton numéro sans @ ex: '237XXXXXXXXX'
    sudo: [],                  // ['237XXXXXXXXX@s.whatsapp.net']
    packname: 'Mon Pack',      // nom du pack sticker par défaut
    packauthor: 'Mon Bot',     // auteur du pack par défaut
    autoReadStatus: false,     // vue automatique des statuts
    language: 'fr',
    groupOnly: false,
    privateOnly: false,
  }
}

module.exports = { loadConfig, saveConfig, getDefaultConfig, CONFIG_PATH }
