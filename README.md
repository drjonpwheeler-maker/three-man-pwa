# ⛳ Three-Man Points

A mobile-first Progressive Web App (PWA) for the **Three-Man Points** golf game — with full handicap support.

## 🏌️ How to Play

9 points are distributed each hole based on **net scores**:

| Scenario | Points |
|---|---|
| Low net score alone | **5 pts** |
| Tie for low net (2 players) | **4 pts each** · 1 pt for high |
| All three tied | **3 pts each** |
| Tie for high net (2 players) | **2 pts each** · 5 pts for low |
| High net score alone | **1 pt** |

Total points per hole always = 9.

## ♿ Handicap Support

Full handicap strokes applied per hole (USGA-style):
- Enter each player's **course handicap**
- Enter each hole's **HCP rating** (1 = hardest, 18 = easiest) from your scorecard
- Strokes are awarded automatically — net scores determine all points
- Players with handicap > 18 receive 2 strokes on their hardest holes

Gold dots (●) on the scorecard indicate which holes a player receives a stroke on.

## 📱 Installing the App

1. Open the app link in **Safari (iPhone)** or **Chrome (Android)**
2. Tap **Share → Add to Home Screen**
3. The app installs and works offline — perfect for the course!

## 🌐 Live App

> `https://YOUR-USERNAME.github.io/three-man-points/`

## 🚀 Deploying Your Own Copy

1. Fork or clone this repo
2. Repo Settings → **Pages** → Source → **GitHub Actions**
3. Push to `main` — auto-deploys
4. Update `manifest.json` `start_url` to match your repo name:

```json
"start_url": "/your-repo-name/"
```

## 📁 File Structure

```
├── index.html          — App shell (5 screens)
├── styles.css          — Dark golf theme
├── app.js              — Game logic, handicaps, state
├── sw.js               — Service worker (offline)
├── manifest.json       — PWA manifest
└── .github/workflows/deploy.yml
```

