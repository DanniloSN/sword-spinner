'use strict';

// ─── SWORD SHAPE GENERATORS ──────────────────────────────────────────────────
// All points defined in local space: origin = player center
// Positive Y = outward (toward tip), X = left/right
// Rotation is CLOCKWISE for positive angle (canvas convention)

function straightSword(bodyR, length, width) {
  const gap = 5;
  const s = bodyR + gap;
  const e = s + length;
  const taper = Math.min(12, length * 0.2);
  return [
    [-width / 2, s],
    [width / 2, s],
    [width / 2, e - taper],
    [0, e],
    [-width / 2, e - taper]
  ];
}

function curvedSword(bodyR, length, width, curve) {
  const gap = 5;
  const s = bodyR + gap;
  const segs = 10;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = s + t * length;
    const x = width / 2 + Math.sin(t * Math.PI) * curve;
    pts.push([x, y]);
  }
  pts.push([0, s + length + 10]);
  for (let i = segs; i >= 0; i--) {
    const t = i / segs;
    const y = s + t * length;
    const x = -width / 2 + Math.sin(t * Math.PI) * curve * 0.25;
    pts.push([x, y]);
  }
  return pts;
}

function wavySword(bodyR, length, width, waves) {
  const gap = 5;
  const s = bodyR + gap;
  const segs = 16;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = s + t * length;
    const x = width / 2 + Math.sin(t * Math.PI * waves * 2) * (width * 0.6);
    pts.push([x, y]);
  }
  pts.push([0, s + length + 8]);
  for (let i = segs; i >= 0; i--) {
    const t = i / segs;
    const y = s + t * length;
    const x = -width / 2 + Math.sin(t * Math.PI * waves * 2) * (width * 0.6);
    pts.push([x, y]);
  }
  return pts;
}

function broadSword(bodyR, length, width) {
  const gap = 5;
  const s = bodyR + gap;
  const e = s + length;
  const guard = 14;
  return [
    [-guard / 2, s],
    [guard / 2, s],
    [guard / 2, s + 8],
    [width / 2, s + 10],
    [width / 2, e - 12],
    [0, e],
    [-width / 2, e - 12],
    [-width / 2, s + 10],
    [-guard / 2, s + 8]
  ];
}

function twinBlade(bodyR, length, width) {
  const gap = 5;
  const s = bodyR + gap;
  const mid = s + length / 2;
  const e = s + length;
  return [
    [-width / 2, s],
    [width / 2, s],
    [width / 2, mid - 5],
    [0, mid],
    [width / 2, mid + 5],
    [width / 2, e - 8],
    [0, e],
    [-width / 2, e - 8],
    [-width / 2, mid + 5],
    [0, mid],
    [-width / 2, mid - 5]
  ];
}

// ─── CHARACTER DEFINITIONS ───────────────────────────────────────────────────

const CHARACTERS = {
  warrior: {
    id: 'warrior',
    name: 'Guerreiro',
    color: '#e74c3c',
    accentColor: '#ff6b6b',
    trailColor: 'rgba(231,76,60,0.4)',
    bodyRadius: 18,
    rotationSpeed: Math.PI,
    description: '1 espada reta · velocidade média',
    swords: [
      { angleOffset: 0, points: straightSword(18, 58, 9) }
    ]
  },

  spinner: {
    id: 'spinner',
    name: 'Girador',
    color: '#3498db',
    accentColor: '#74b9ff',
    trailColor: 'rgba(52,152,219,0.4)',
    bodyRadius: 15,
    rotationSpeed: Math.PI * 1.6,
    description: '2 espadas opostas · rápido',
    swords: [
      { angleOffset: 0,      points: straightSword(15, 48, 7) },
      { angleOffset: Math.PI, points: straightSword(15, 48, 7) }
    ]
  },

  scythe: {
    id: 'scythe',
    name: 'Ceifador',
    color: '#8e44ad',
    accentColor: '#a29bfe',
    trailColor: 'rgba(142,68,173,0.4)',
    bodyRadius: 20,
    rotationSpeed: Math.PI * 0.75,
    description: '1 foice curva · lento mas devastador',
    swords: [
      { angleOffset: 0, points: curvedSword(20, 72, 11, 22) }
    ]
  },

  trident: {
    id: 'trident',
    name: 'Tridente',
    color: '#27ae60',
    accentColor: '#55efc4',
    trailColor: 'rgba(39,174,96,0.4)',
    bodyRadius: 15,
    rotationSpeed: Math.PI * 2.1,
    description: '3 espadas · muito rápido',
    swords: [
      { angleOffset: 0,                points: straightSword(15, 42, 6) },
      { angleOffset: (Math.PI * 2) / 3, points: straightSword(15, 42, 6) },
      { angleOffset: (Math.PI * 4) / 3, points: straightSword(15, 42, 6) }
    ]
  },

  cross: {
    id: 'cross',
    name: 'Cruz',
    color: '#f39c12',
    accentColor: '#fdcb6e',
    trailColor: 'rgba(243,156,18,0.4)',
    bodyRadius: 14,
    rotationSpeed: Math.PI * 2.8,
    description: '4 espadas curtas · velocidade extrema',
    swords: [
      { angleOffset: 0,              points: straightSword(14, 32, 5) },
      { angleOffset: Math.PI / 2,    points: straightSword(14, 32, 5) },
      { angleOffset: Math.PI,        points: straightSword(14, 32, 5) },
      { angleOffset: Math.PI * 1.5,  points: straightSword(14, 32, 5) }
    ]
  },

  knight: {
    id: 'knight',
    name: 'Cavaleiro',
    color: '#636e72',
    accentColor: '#b2bec3',
    trailColor: 'rgba(99,110,114,0.4)',
    bodyRadius: 22,
    rotationSpeed: Math.PI * 0.6,
    description: '1 espadão largo · corpo grande',
    swords: [
      { angleOffset: 0, points: broadSword(22, 65, 13) }
    ]
  },

  serpent: {
    id: 'serpent',
    name: 'Serpente',
    color: '#00b894',
    accentColor: '#00cec9',
    trailColor: 'rgba(0,184,148,0.4)',
    bodyRadius: 16,
    rotationSpeed: Math.PI * 1.3,
    description: '1 lâmina serrilhada · imprevisível',
    swords: [
      { angleOffset: 0, points: wavySword(16, 62, 8, 2) }
    ]
  },

  phantom: {
    id: 'phantom',
    name: 'Fantasma',
    color: '#fd79a8',
    accentColor: '#fdcfe8',
    trailColor: 'rgba(253,121,168,0.4)',
    bodyRadius: 14,
    rotationSpeed: Math.PI * 1.9,
    description: '2 lâminas duplas · ágil e letal',
    swords: [
      { angleOffset: 0,      points: twinBlade(14, 58, 7) },
      { angleOffset: Math.PI, points: twinBlade(14, 58, 7) }
    ]
  }
};

// ─── TRANSFORM UTILITY ───────────────────────────────────────────────────────
// Clockwise rotation consistent with canvas coordinate system (y-axis down)

function transformSword(sword, px, py, angle) {
  const a = angle + (sword.angleOffset || 0);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return sword.points.map(([lx, ly]) => [
    px + lx * c + ly * s,
    py - lx * s + ly * c
  ]);
}

// ─── EXPORT (Node.js + browser) ──────────────────────────────────────────────

const GameCharacters = { CHARACTERS, transformSword };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameCharacters;
}
