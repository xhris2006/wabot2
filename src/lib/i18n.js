const path = require('path')

const TRANSLATIONS = {
  fr: require('./locales/fr.json'),
  en: require('./locales/en.json')
}

let currentLang = 'fr'

function setLang(lang) {
  if (TRANSLATIONS[lang]) { currentLang = lang; return true }
  return false
}

function t(key, vars = {}) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.fr
  let str    = dict[key] || TRANSLATIONS.fr[key] || key
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
  }
  return str
}

function getLang() { return currentLang }

module.exports = { t, setLang, getLang }
