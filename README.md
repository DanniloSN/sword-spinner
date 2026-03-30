# ⚔ SwordSpinner

> *Gire. Corte. Sobreviva.*

A fast-paced **multiplayer top-down arena game** where every player is a spinning warrior. Master your rotation, clash blades with rivals and be the last one standing.

---

## Gameplay

Each player controls a character that **spins continuously** with one or more blades attached. There are only two rules:

- **Sword hits body** → that player **dies** and respawns after 3 seconds
- **Sword hits sword** → both players' **rotation direction inverts**

The rotation mechanic is the heart of the game. A single blade clash at the wrong moment can flip your spin into your own doom — or send an enemy straight into your path.

---

## Screenshots

```
         ⚔ SwordSpinner
    ┌─────────────────────────┐
    │  · · · · · · · · · · ·  │
    │  ·     /\      ·   ·   │
    │  ·    /  \     ·       │
    │  ·   ( ◉ )   ─◉─  ·  │
    │  ·    \  /     ·       │
    │  ·     \/      ·   ·   │
    │  · · · · · · · · · · ·  │
    └─────────────────────────┘
         PLACAR
         Jogador1: 5/1
         Jogador2: 3/2
```

---

## Characters

Eight unique fighters, each with a different blade configuration and rotation speed:

| Character | Blades | Speed | Style |
|---|---|---|---|
| **Guerreiro** | 1 straight sword | ●●●○○ | Balanced — good for beginners |
| **Girador** | 2 opposite blades | ●●●●○ | High coverage, hard to dodge |
| **Ceifador** | 1 curved scythe | ●●○○○ | Slow but has a massive sweep arc |
| **Tridente** | 3 blades (120°) | ●●●●● | Covers all angles, very dangerous |
| **Cruz** | 4 short blades (90°) | ●●●●● | Extreme speed, close-range threat |
| **Cavaleiro** | 1 wide broadsword | ●○○○○ | Huge body, devastating single blade |
| **Serpente** | 1 serrated blade | ●●●○○ | Unpredictable wave-shaped edge |
| **Fantasma** | 2 twin-edged blades | ●●●●○ | Double-tipped for surprise kills |

---

## Controls

### Desktop
| Action | Keys |
|---|---|
| Move | `W A S D` or Arrow Keys |
| Change character | ⚔ button (bottom-right) |

### Mobile
| Action | Input |
|---|---|
| Move | Virtual joystick (left side of screen) |
| Change character | ⚔ button (bottom-right) |

The game is fully responsive:
- **Mobile** → portrait layout, touch joystick
- **Desktop** → landscape layout, keyboard input

---

## Mechanics Deep Dive

### Rotation Inversion
When two swords collide, **both** players instantly flip their rotation direction. This is the core skill expression — you can bait an enemy into a clash to reverse their spin into a vulnerable position, or use your own inversion to escape an attack.

### Invincibility Window
Every time a player spawns or respawns, they get **2.5 seconds of invincibility** (shown by a flashing effect). Use this window to reposition before entering combat.

### Camera
The camera smoothly follows your character and clamps to the arena boundary. The arena is 900×900 units — large enough to maneuver, small enough that fights are always close.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express |
| Realtime | Socket.io (WebSocket) |
| Rendering | HTML5 Canvas 2D |
| Physics | Server-authoritative at 60 fps |
| Collision | Edge-edge intersection + circle-polygon |

### Architecture

```
Client                          Server (60fps loop)
──────                          ───────────────────
input (dx, dy) ──────────────→  update positions
                                update rotations
game state     ←──────────────  check collisions
               ←──────────────  broadcast state
render frame
```

All physics and collision detection run **server-side** to prevent cheating. The client only renders the received state and sends movement input.

### Collision Detection

- **Sword vs Body** — polygon edges tested against player body circle
- **Sword vs Sword** — edge-edge segment intersection test
- **Collision deduplication** — a `Set` of active colliding pairs ensures sword-sword events fire only **once per contact**, preventing rapid rotation flickering

---

## Getting Started

### Prerequisites
- Node.js 18+

### Install & Run

```bash
npm install
npm start
```

Open **http://localhost:3000** in multiple browser tabs (or on different devices on the same network) to play multiplayer.

For development with auto-restart:

```bash
npx nodemon server.js
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |

---

## Project Structure

```
sword-spinner/
├── server.js              # Game server — physics, collision, Socket.io
├── package.json
└── public/
    ├── index.html         # Lobby screen + game canvas
    ├── css/
    │   └── style.css      # Responsive layout, dark theme, joystick UI
    └── js/
        ├── characters.js  # Character & sword definitions (shared server/client)
        └── client.js      # Rendering, input handling, particles, HUD
```

### Adding a New Character

Open `public/js/characters.js` and add an entry to the `CHARACTERS` object:

```js
myHero: {
  id: 'myHero',
  name: 'Meu Herói',
  color: '#e17055',
  accentColor: '#fab1a0',
  trailColor: 'rgba(225,112,85,0.4)',
  bodyRadius: 17,
  rotationSpeed: Math.PI * 1.2,   // radians/second
  description: '2 espadas · descrição aqui',
  swords: [
    { angleOffset: 0,      points: straightSword(17, 50, 7) },
    { angleOffset: Math.PI, points: straightSword(17, 50, 7) }
  ]
}
```

**Available shape generators:**

| Function | Result |
|---|---|
| `straightSword(bodyR, length, width)` | Classic pointed blade |
| `curvedSword(bodyR, length, width, curve)` | Scimitar / scythe arc |
| `wavySword(bodyR, length, width, waves)` | Serrated / flame blade |
| `broadSword(bodyR, length, width)` | Wide blade with guard |
| `twinBlade(bodyR, length, width)` | Double-tipped blade |

---

## License

MIT
