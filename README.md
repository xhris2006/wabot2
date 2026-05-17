# 🤖 WhatsApp Bot — Baileys

Bot WhatsApp complet avec toutes les fonctionnalités : groupe, admin, fun, media, IA.

---

## 📋 Commandes disponibles

### 👥 Groupe
| Commande | Description |
|----------|-------------|
| `.kick @membre` | Expulser un membre |
| `.add 2250000000` | Ajouter un membre |
| `.promote @membre` | Promouvoir admin |
| `.demote @membre` | Retirer le statut admin |
| `.mute` / `.unmute` | Silencer/ouvrir le groupe |
| `.tagall [message]` | Mentionner tout le monde |
| `.groupinfo` | Infos du groupe |
| `.link` | Lien d'invitation |
| `.revoke` | Révoquer le lien |

### 🛡️ Admin
| Commande | Description |
|----------|-------------|
| `.warn @membre [raison]` | Avertir un membre |
| `.resetwarn @membre` | Réinitialiser les warns |
| `.warnlist @membre` | Voir les warns |
| `.antilink on/off` | Anti-lien |
| `.antispam on/off` | Anti-spam |
| `.welcome on/off [msg]` | Message de bienvenue |
| `.delete` | Supprimer un message (répondre) |

### 🎮 Fun
| Commande | Description |
|----------|-------------|
| `.sticker` / `.s` | Image → Sticker |
| `.afk [raison]` | Mode AFK |
| `.ping` | Latence du bot |
| `.info` | Infos du bot |
| `.tts [fr/en] texte` | Texte en audio |
| `.help` / `.menu` | Liste des commandes |
| `.quote` | Citation aléatoire |

### 🎬 Media
| Commande | Description |
|----------|-------------|
| `.play [titre]` | Télécharger musique YouTube |
| `.video [titre]` | Télécharger vidéo YouTube |
| `.image [recherche]` | Chercher une image |
| `.toimg` | Sticker → Image |

### 🤖 IA
| Commande | Description |
|----------|-------------|
| `.gpt [question]` | ChatGPT |
| `.gemini [question]` | Google Gemini |
| `.imagine [description]` | Générer une image DALL-E |
| `.translate [lang] [texte]` | Traduire un texte |

---

## 🚀 Déploiement sur Railway

### Étape 1 — Obtenir ta session
1. Déploie d'abord le **session-generator** (zip séparé)
2. Accède à la page, scanne le QR avec ton WhatsApp
3. Copie le `SESSION_ID` reçu

### Étape 2 — Créer un projet Railway
1. Va sur [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Push ce dossier sur GitHub, connecte le repo

### Étape 3 — Ajouter PostgreSQL
1. Dans ton projet Railway → **New** → **Database** → **PostgreSQL**
2. Copie la variable `DATABASE_URL` depuis l'onglet Variables

### Étape 4 — Variables d'environnement
Dans Railway → ton service → **Variables**, ajoute :

```
SESSION_ID=WABOT_xxxxxxxx
PREFIX=.
SUDO=2250000000
BOT_NAME=MonBot
WARN_LIMIT=3
DATABASE_URL=postgresql://... (copié depuis Railway PostgreSQL)
GPT_KEY=sk-xxxx (optionnel)
GEMINI_KEY=AIza-xxxx (optionnel)
```

### Étape 5 — Déployer
Railway build automatiquement le Dockerfile et démarre le bot.
Tu recevras un message de confirmation sur ton WhatsApp. ✅

---

## ⚙️ Lancer en local
```bash
cp .env.example .env
# Remplis .env avec ta SESSION_ID et DATABASE_URL
npm install
node src/index.js
```

---

## 📁 Structure du projet
```
wabot/
├── src/
│   ├── index.js              ← Point d'entrée
│   ├── handlers/
│   │   ├── message.js        ← Traitement des messages
│   │   └── group.js          ← Événements groupe
│   ├── lib/
│   │   ├── database.js       ← PostgreSQL
│   │   ├── loader.js         ← Chargeur de commandes
│   │   └── utils.js          ← Utilitaires
│   └── commands/
│       ├── group/group.js    ← Commandes groupe
│       ├── admin/admin.js    ← Commandes admin
│       ├── fun/fun.js        ← Commandes fun
│       ├── media/media.js    ← Commandes media
│       └── ai/ai.js          ← Commandes IA
├── Dockerfile
├── railway.json
├── package.json
└── .env.example
```
