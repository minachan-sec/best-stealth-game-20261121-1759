// The renderer: a top-down night scene on one canvas. The playfield is a fixed
// 1280x720 logical area scaled to the window; guards get vision cones clipped by
// walls (a fan of rays, each marched until it hits something), and the HUD shows
// the objective, the detection eye and the level's name.

import { COLS, FIELD, FONT, GUARD, PALETTE, ROWS, TILE } from './config.js';
import { G_ALERT } from './world.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_CAUGHT = 3;
export const SCREEN_CLEAR = 4;
export const SCREEN_OVER = 5;
export const SCREEN_WIN = 6;

const CONE_RAYS = 26;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    scale = Math.min(w / FIELD.width, h / FIELD.height) * dpr;
    offsetX = (w * dpr - FIELD.width * scale) / 2;
    offsetY = (h * dpr - FIELD.height * scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  /** Convert a client (mouse) point to field coordinates. */
  function toField(clientX, clientY) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * dpr - offsetX) / scale,
      y: ((clientY - rect.top) * dpr - offsetY) / scale,
    };
  }

  function tileIs(level, tx, ty, chars) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    return chars.includes(level.map[ty][tx]);
  }

  /** The vision cone as a polygon: rays fanned across the field of view, each stopped by a wall. */
  function conePolygon(level, guard) {
    const points = [];
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const a = guard.angle - GUARD.viewAngle / 2 + (GUARD.viewAngle * i) / CONE_RAYS;
      let r = GUARD.viewRange;
      for (let d = 12; d <= GUARD.viewRange; d += 8) {
        const x = guard.x + Math.cos(a) * d;
        const y = guard.y + Math.sin(a) * d;
        if (tileIs(level, Math.floor(x / TILE), Math.floor(y / TILE), '#C')) {
          r = d;
          break;
        }
      }
      points.push({ x: guard.x + Math.cos(a) * r, y: guard.y + Math.sin(a) * r });
    }
    return points;
  }

  function drawLevel(state) {
    const level = state.level;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const c = level.map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        ctx.fillRect(px, py, TILE, TILE);
        if (c === '#') {
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(px + 1, py + 1, TILE - 2, 7);
          ctx.fillStyle = PALETTE.wallEdge;
          ctx.fillRect(px + 1, py + TILE - 4, TILE - 2, 3);
        } else if (c === 'C') {
          ctx.fillStyle = PALETTE.crate;
          ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
          ctx.fillStyle = PALETTE.crateTop;
          ctx.fillRect(px + 5, py + 5, TILE - 10, 6);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.strokeRect(px + 5.5, py + 5.5, TILE - 11, TILE - 11);
        } else if (c === 'B') {
          ctx.fillStyle = PALETTE.bush;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = PALETTE.bushLeaf;
          ctx.beginPath();
          ctx.arc(px + 12, py + 14, 9, 0, Math.PI * 2);
          ctx.arc(px + 27, py + 11, 8, 0, Math.PI * 2);
          ctx.arc(px + 20, py + 27, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.bushLeaf2;
          ctx.beginPath();
          ctx.arc(px + 12, py + 12, 4, 0, Math.PI * 2);
          ctx.arc(px + 27, py + 9, 3.5, 0, Math.PI * 2);
          ctx.arc(px + 20, py + 25, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // The exit door: red and barred while locked, green and glowing once open.
    const e = state.exit;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = state.exitOpen ? PALETTE.exitOpen : PALETTE.exitLocked;
    ctx.globalAlpha = 0.25 + 0.12 * Math.sin(state.time * 3);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = state.exitOpen ? '#0d3a2c' : '#3a1210';
    ctx.fillRect(-14, -16, 28, 32);
    ctx.fillStyle = state.exitOpen ? PALETTE.exitOpen : PALETTE.exitLocked;
    ctx.fillRect(-14, -16, 28, 5);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.exitOpen ? 'EXIT' : 'LOCK', 0, 2);
    ctx.restore();
    // Intel files glow amber until taken.
    for (const item of state.intel) {
      if (item.taken) continue;
      ctx.save();
      ctx.translate(item.x, item.y + Math.sin(state.time * 2.4 + item.x) * 2);
      ctx.fillStyle = PALETTE.intel;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(-7, -10, 14, 20);
      ctx.fillStyle = PALETTE.intel;
      ctx.fillRect(-7, -10, 14, 4);
      ctx.fillStyle = '#8a7a2a';
      ctx.fillRect(-4, -3, 8, 2);
      ctx.fillRect(-4, 1, 8, 2);
      ctx.fillRect(-4, 5, 5, 2);
      ctx.restore();
    }
  }

  function drawCones(state) {
    for (const g of state.guards) {
      const alert = g.state === G_ALERT || g.suspicion > 0.6;
      const poly = conePolygon(state.level, g);
      const grad = ctx.createRadialGradient(g.x, g.y, 10, g.x, g.y, GUARD.viewRange);
      grad.addColorStop(0, alert ? 'rgba(229, 83, 75, 0.42)' : 'rgba(242, 201, 76, 0.30)');
      grad.addColorStop(1, alert ? 'rgba(229, 83, 75, 0.06)' : 'rgba(242, 201, 76, 0.05)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      for (const pt of poly) ctx.lineTo(pt.x, pt.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = alert ? PALETTE.coneAlertEdge : PALETTE.coneCalmEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawGuards(state) {
    for (const g of state.guards) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fillStyle = g.state === G_ALERT ? PALETTE.guard : PALETTE.guardCalm;
      ctx.beginPath();
      ctx.arc(0, 0, GUARD.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1210';
      ctx.beginPath();
      ctx.arc(0, 0, GUARD.radius - 4, 0, Math.PI * 2);
      ctx.fill();
      // Facing wedge.
      ctx.rotate(g.angle);
      ctx.fillStyle = g.state === G_ALERT ? '#ff8a84' : '#ffe1a1';
      ctx.beginPath();
      ctx.moveTo(GUARD.radius - 2, 0);
      ctx.lineTo(2, -6);
      ctx.lineTo(2, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // '?' while suspicious, '!' while alert; a suspicion arc fills overhead.
      if (g.suspicion > 0.05) {
        ctx.save();
        ctx.translate(g.x, g.y - 24);
        ctx.fillStyle = g.state === G_ALERT ? PALETTE.danger : PALETTE.intel;
        ctx.font = `700 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.state === G_ALERT ? '!' : '?', 0, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = g.state === G_ALERT ? PALETTE.danger : PALETTE.intel;
        ctx.beginPath();
        ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.suspicion);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.hidden) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = PALETTE.bushLeaf2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = PALETTE.playerDark;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(p.face);
    ctx.fillStyle = '#06281d';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(1, -5);
    ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Noise rings from running feet and landing coins.
    for (const n of state.noises) {
      ctx.strokeStyle = `rgba(255, 220, 120, ${0.5 * n.life})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (state.coinFlight) {
      const c = state.coinFlight;
      ctx.fillStyle = PALETTE.intel;
      ctx.beginPath();
      ctx.arc(c.x, c.y - Math.sin(c.t * Math.PI) * 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10, 14, 24, 0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120, 140, 180, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawHud(state, best) {
    const taken = state.intel.filter((i) => i.taken).length;
    ctx.fillStyle = 'rgba(8, 11, 20, 0.78)';
    ctx.fillRect(0, 0, FIELD.width, 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.level.name, 14, 23);
    ctx.font = `400 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(state.level.brief, 14, 41);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`INTEL ${taken}/${state.intel.length}`, FIELD.width / 2 - 130, 23);
    ctx.fillText(`COINS ${state.coins}`, FIELD.width / 2 - 30, 23);
    ctx.fillText(`SCORE ${state.score}`, FIELD.width / 2 + 70, 23);
    ctx.fillText(`BEST ${Math.max(best, state.score)}`, FIELD.width / 2 + 175, 23);
    // Lives as hearts.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `700 17px ${FONT}`;
    ctx.fillText('♥'.repeat(state.lives) + '♡'.repeat(Math.max(0, 3 - state.lives)), FIELD.width - 14, 23);
    // The detection eye: fills as any guard grows suspicious.
    const ex = FIELD.width - 60;
    const ey = 74;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(8, 11, 20, 0.78)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = state.alarm > 0.6 ? PALETTE.danger : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = state.alarm > 0.6 ? PALETTE.danger : state.alarm > 0.25 ? PALETTE.intel : PALETTE.muted;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('◉', 0, 1);
    if (state.alarm > 0.02) {
      ctx.strokeStyle = state.alarm > 0.6 ? PALETTE.danger : PALETTE.intel;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.alarm);
      ctx.stroke();
    }
    ctx.restore();
    // Objective line under the bar.
    ctx.textAlign = 'left';
    ctx.font = `400 14px ${FONT}`;
    ctx.fillStyle = state.exitOpen ? PALETTE.exitOpen : PALETTE.muted;
    const objective = state.exitOpen
      ? 'Exit is open — get out unseen.'
      : taken < state.intel.length
        ? `Steal the intel (${taken}/${state.intel.length}), then reach the exit.`
        : 'Reach the exit.';
    ctx.fillText(objective, 14, 62);
    if (state.player.hidden) {
      ctx.fillStyle = PALETTE.player;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText('HIDDEN in the bush', 14, 84);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 13px ${FONT}`;
    const mins = Math.floor(state.levelTime / 60);
    const secs = Math.floor(state.levelTime % 60);
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, FIELD.width - 100, 62);
    ctx.fillText('WASD move · Shift run · Click: throw coin · P pause · M mute', FIELD.width - 14, FIELD.height - 12);
  }

  function drawTitle(state, best) {
    panel(FIELD.width / 2 - 330, 150, 660, 330);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.player;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText('SHADOWLINE', FIELD.width / 2, 230);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText('A night infiltration in three levels', FIELD.width / 2, 268);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 16px ${FONT}`;
    ctx.fillText('Slip past the guards. Steal the intel. Reach the exit unseen.', FIELD.width / 2, 300);
    ctx.fillText('Bushes hide you. Crates block their sight. Coins buy you room.', FIELD.width / 2, 326);
    ctx.fillText('Running is fast — and loud.', FIELD.width / 2, 352);
    ctx.fillStyle = PALETTE.intel;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText('Press SPACE or click to start', FIELD.width / 2, 402);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 14px ${FONT}`;
    ctx.fillText(`Best score: ${best}    ·    WASD / arrows to move · Shift to run · Click to throw a coin`, FIELD.width / 2, 440);
  }

  function drawCenter(title, lines, accent) {
    panel(FIELD.width / 2 - 300, 220, 600, 240);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 278);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 18px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 318 + i * 28));
  }

  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    if (state.shake > 0) {
      const s = state.shake * 22;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawLevel(state);
    drawCones(state);
    drawGuards(state);
    drawPlayer(state);
    if (screen === SCREEN_TITLE) {
      drawHud(state, best);
      drawTitle(state, best);
    } else if (screen === SCREEN_PLAY) {
      drawHud(state, best);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, best);
      drawCenter('PAUSED', ['Press P or click to keep sneaking.'], PALETTE.text);
    } else if (screen === SCREEN_CAUGHT) {
      drawHud(state, best);
      drawCenter('CAUGHT!', state.lives > 0
        ? [`A guard got you. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.`, 'Press SPACE to try the level again.']
        : ['No lives left.', 'Press SPACE to try again.'], PALETTE.danger);
    } else if (screen === SCREEN_CLEAR) {
      drawHud(state, best);
      drawCenter('LEVEL CLEAR', [
        `Score ${state.score} · ${state.ghost ? 'GHOST — never spotted (+500).' : 'Spotted, but you made it out.'}`,
        state.levelIndex + 1 < 3 ? 'Press SPACE for the next level.' : 'Press SPACE to finish.',
      ], PALETTE.exitOpen);
    } else if (screen === SCREEN_OVER) {
      drawHud(state, best);
      drawCenter('GAME OVER', [`Score ${state.score}. Best ${Math.max(best, state.score)}.`, 'Press SPACE to start over.'], PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      drawHud(state, best);
      drawCenter('ALL CLEAR — GHOST', [
        `You stole every file and vanished. Final score ${state.score}.`,
        'Press SPACE to run it again.',
      ], PALETTE.player);
    }
  }

  return { draw, toField };
}
