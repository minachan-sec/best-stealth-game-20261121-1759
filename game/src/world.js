// The game world: the level map, the player, the guards and their senses, coins,
// intel and the exit. The simulation runs in fixed STEP slices; step() returns a
// bitmask of events the loop reacts to (pickup, caught, level clear, game over).
import { COIN, COLS, FIELD, GUARD, LEVELS, LIVES, PLAYER, ROWS, SCORE, STEP, TILE } from './config.js';

export const EVENT_NONE = 0;
export const EVENT_INTEL = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_CLEAR = 4;
export const EVENT_OVER = 8;
export const EVENT_NOISE = 16;
export const EVENT_COIN = 32;
export const EVENT_SPOTTED = 64;

export const G_PATROL = 0;
export const G_SUSPICIOUS = 1;
export const G_ALERT = 2;
export const G_SEARCH = 3;

const WALKABLE = new Set(['.', 'B', 'P', 'I', 'E']);
const BLOCKS_SIGHT = new Set(['#', 'C']);

function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return level.map[ty][tx];
}

function isWall(level, px, py) {
  return !WALKABLE.has(tileAt(level, Math.floor(px / TILE), Math.floor(py / TILE)));
}

/** True when the segment between two points crosses no wall or crate. */
export function losClear(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (BLOCKS_SIGHT.has(tileAt(level, Math.floor((x0 + dx * t) / TILE), Math.floor((y0 + dy * t) / TILE)))) return false;
  }
  return true;
}

/** Breadth-first path over walkable tiles, as a list of pixel centres. */
export function findPath(level, fromX, fromY, toX, toY) {
  const sx = Math.floor(fromX / TILE);
  const sy = Math.floor(fromY / TILE);
  const tx = Math.floor(toX / TILE);
  const ty = Math.floor(toY / TILE);
  if (sx === tx && sy === ty) return [{ x: toX, y: toY }];
  const prev = new Map();
  const key = (x, y) => y * COLS + x;
  const queue = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (!WALKABLE.has(tileAt(level, nx, ny))) continue;
      if (prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const tiles = [];
  let at = [tx, ty];
  while (at !== null) {
    tiles.push(at);
    at = prev.get(key(at[0], at[1]));
  }
  tiles.reverse();
  return tiles.slice(1).map(([x, y]) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }));
}

function parseLevel(def) {
  const player = { x: 0, y: 0 };
  const intel = [];
  let exit = { x: 0, y: 0 };
  def.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (row[x] === 'P') { player.x = cx; player.y = cy; }
      else if (row[x] === 'I') intel.push({ x: cx, y: cy, taken: false });
      else if (row[x] === 'E') exit = { x: cx, y: cy };
    }
  });
  return { player, intel, exit };
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: LEVELS[0],
    player: { x: 0, y: 0, face: 0, running: false, hidden: false, moving: false },
    guards: [],
    intel: [],
    exit: { x: 0, y: 0 },
    exitOpen: false,
    coins: COIN.perLevel,
    coinFlight: null,
    noises: [],
    lives: LIVES,
    score: 0,
    time: 0,
    levelTime: 0,
    ghost: true,
    caught: false,
    cleared: false,
    won: false,
    /** Highest suspicion across guards, 0..1: what the HUD eye shows. */
    alarm: 0,
    shake: 0,
  };

  function loadLevel(index) {
    const def = LEVELS[index];
    const parsed = parseLevel(def);
    state.levelIndex = index;
    state.level = def;
    state.player.x = parsed.player.x;
    state.player.y = parsed.player.y;
    state.player.face = 0;
    state.intel = parsed.intel.map((i) => ({ ...i }));
    state.exit = parsed.exit;
    state.exitOpen = false;
    state.coins = COIN.perLevel;
    state.coinFlight = null;
    state.noises = [];
    state.levelTime = 0;
    state.ghost = true;
    state.caught = false;
    state.cleared = false;
    state.guards = def.guards.map((g) => {
      const [wx, wy] = g.waypoints[0];
      return {
        x: wx * TILE + TILE / 2,
        y: wy * TILE + TILE / 2,
        angle: 0,
        waypoints: g.waypoints.map(([x, y]) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 })),
        wp: 1 % g.waypoints.length,
        pause: 0,
        state: G_PATROL,
        suspicion: 0,
        path: [],
        repath: 0,
        target: null,
        search: 0,
        inspect: 0,
      };
    });
  }

  function reset() {
    state.lives = LIVES;
    state.score = 0;
    state.time = 0;
    state.won = false;
    loadLevel(0);
  }

  /** Move a circle against walls and crates, axis by axis so it slides along them. */
  function moveCircle(body, dx, dy, radius) {
    const level = state.level;
    const nx = body.x + dx;
    if (!isWall(level, nx - radius, body.y) && !isWall(level, nx + radius, body.y) &&
        !isWall(level, nx - radius, body.y - radius * 0.7) && !isWall(level, nx + radius, body.y - radius * 0.7) &&
        !isWall(level, nx - radius, body.y + radius * 0.7) && !isWall(level, nx + radius, body.y + radius * 0.7)) {
      body.x = Math.max(radius, Math.min(FIELD.width - radius, nx));
    }
    const ny = body.y + dy;
    if (!isWall(level, body.x, ny - radius) && !isWall(level, body.x, ny + radius) &&
        !isWall(level, body.x - radius * 0.7, ny - radius) && !isWall(level, body.x + radius * 0.7, ny - radius) &&
        !isWall(level, body.x - radius * 0.7, ny + radius) && !isWall(level, body.x + radius * 0.7, ny + radius)) {
      body.y = Math.max(radius, Math.min(FIELD.height - radius, ny));
    }
  }

  function playerInBush() {
    return tileAt(state.level, Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE)) === 'B';
  }

  /** Can this guard see the player right now? Returns 0..1 (0 = not seen). */
  function guardSees(guard) {
    const p = state.player;
    const dx = p.x - guard.x;
    const dy = p.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.viewRange) return 0;
    const angleTo = Math.atan2(dy, dx);
    let diff = angleTo - guard.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > GUARD.viewAngle / 2) return 0;
    if (!losClear(state.level, guard.x, guard.y, p.x, p.y)) return 0;
    if (p.hidden && dist > GUARD.bushSpotRange) return 0;
    // Closer and more centred = seen more clearly.
    return (1 - dist / GUARD.viewRange) * 0.6 + 0.4;
  }

  function hearNoise(guard, x, y, radius) {
    if (guard.state === G_ALERT) return;
    if (Math.hypot(x - guard.x, y - guard.y) > radius) return;
    guard.state = G_SUSPICIOUS;
    guard.target = { x, y };
    guard.inspect = GUARD.inspectTime;
    guard.path = findPath(state.level, guard.x, guard.y, x, y);
  }

  function stepGuard(guard, dt) {
    const p = state.player;
    const seen = guardSees(guard);
    if (seen > 0) {
      guard.suspicion = Math.min(1, guard.suspicion + GUARD.detectRate * seen * dt * (p.running ? 1.35 : 1));
      if (guard.suspicion > 0.45) state.ghost = false;
      if (guard.suspicion >= 1) {
        guard.state = G_ALERT;
        guard.target = { x: p.x, y: p.y };
        guard.search = GUARD.searchTime;
      } else if (guard.state === G_PATROL) {
        guard.state = G_SUSPICIOUS;
        guard.target = { x: p.x, y: p.y };
        guard.inspect = 1;
      }
    } else {
      guard.suspicion = Math.max(0, guard.suspicion - GUARD.forgetRate * dt);
    }

    const faceToward = (x, y, turn) => {
      const want = Math.atan2(y - guard.y, x - guard.x);
      let diff = want - guard.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      guard.angle += Math.max(-turn * dt, Math.min(turn * dt, diff));
    };

    const followPath = (speed) => {
      if (guard.path.length === 0) return true;
      const next = guard.path[0];
      const dx = next.x - guard.x;
      const dy = next.y - guard.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        guard.path.shift();
        return guard.path.length === 0;
      }
      faceToward(next.x, next.y, 6);
      moveCircle(guard, (dx / dist) * speed * dt, (dy / dist) * speed * dt, GUARD.radius);
      return false;
    };

    if (guard.state === G_PATROL) {
      if (guard.pause > 0) {
        guard.pause -= dt;
        guard.angle += Math.sin(state.time * 1.4 + guard.x) * 0.35 * dt;
        return;
      }
      const wp = guard.waypoints[guard.wp];
      const dx = wp.x - guard.x;
      const dy = wp.y - guard.y;
      if (Math.hypot(dx, dy) < 6) {
        guard.wp = (guard.wp + 1) % guard.waypoints.length;
        guard.pause = GUARD.pauseAtWaypoint;
        return;
      }
      if (guard.path.length === 0) guard.path = findPath(state.level, guard.x, guard.y, wp.x, wp.y);
      followPath(GUARD.patrolSpeed);
    } else if (guard.state === G_SUSPICIOUS) {
      if (guard.target && followPath(GUARD.investigateSpeed)) {
        guard.inspect -= dt;
        guard.angle += Math.sin(state.time * 2.2) * 0.9 * dt;
        if (guard.inspect <= 0) {
          guard.state = G_PATROL;
          guard.target = null;
          guard.path = [];
        }
      }
    } else if (guard.state === G_ALERT) {
      if (seen > 0) {
        guard.target = { x: p.x, y: p.y };
        guard.search = GUARD.searchTime;
      }
      guard.repath -= dt;
      if (guard.repath <= 0 && guard.target) {
        guard.path = findPath(state.level, guard.x, guard.y, guard.target.x, guard.target.y);
        guard.repath = 0.5;
      }
      if (guard.target && followPath(GUARD.chaseSpeed)) {
        guard.search -= dt;
        guard.angle += Math.sin(state.time * 3.1) * 1.4 * dt;
        if (guard.search <= 0) {
          guard.state = G_PATROL;
          guard.target = null;
          guard.suspicion = 0.4;
          guard.path = [];
        }
      }
    }
  }

  let noiseTimer = 0;

  /**
   * Advance the world one fixed step. `move` is {x, y} in -1..1, `run` holds Shift,
   * `throwAt` is a field point to throw a coin at (or null). Returns event flags.
   */
  function step(dt, move, run, throwAt) {
    if (state.caught || state.cleared || state.won) return EVENT_NONE;
    let events = EVENT_NONE;
    state.time += dt;
    state.levelTime += dt;

    const p = state.player;
    const len = Math.hypot(move.x, move.y);
    p.moving = len > 0.1;
    p.running = run && p.moving;
    if (p.moving) {
      const speed = p.running ? PLAYER.runSpeed : PLAYER.sneakSpeed;
      const nx = (move.x / len) * speed * dt;
      const ny = (move.y / len) * speed * dt;
      p.face = Math.atan2(move.y, move.x);
      moveCircle(p, nx, ny, PLAYER.radius);
    }
    p.hidden = playerInBush() && !p.running;

    // Running feet make noise; guards nearby come to look.
    if (p.running) {
      noiseTimer -= dt;
      if (noiseTimer <= 0) {
        noiseTimer = PLAYER.noiseInterval;
        state.noises.push({ x: p.x, y: p.y, r: 8, max: PLAYER.noiseRadius, life: 0.5 });
        for (const g of state.guards) hearNoise(g, p.x, p.y, PLAYER.noiseRadius);
        events |= EVENT_NOISE;
      }
    }

    // A thrown coin flies, lands, then clinks: every guard in earshot investigates.
    if (throwAt && state.coins > 0 && !state.coinFlight) {
      const dx = throwAt.x - p.x;
      const dy = throwAt.y - p.y;
      const dist = Math.min(Math.hypot(dx, dy), COIN.throwRange);
      const ang = Math.atan2(dy, dx);
      state.coins -= 1;
      state.coinFlight = {
        x: p.x, y: p.y,
        tx: p.x + Math.cos(ang) * dist,
        ty: p.y + Math.sin(ang) * dist,
        t: 0,
      };
      events |= EVENT_COIN;
    }
    if (state.coinFlight) {
      const c = state.coinFlight;
      c.t += dt / COIN.flightTime;
      if (c.t >= 1) {
        state.noises.push({ x: c.tx, y: c.ty, r: 8, max: COIN.noiseRadius, life: 0.7 });
        for (const g of state.guards) hearNoise(g, c.tx, c.ty, COIN.noiseRadius);
        state.coinFlight = null;
        events |= EVENT_NOISE;
      } else {
        c.x = p.x + (c.tx - p.x) * c.t;
        c.y = p.y + (c.ty - p.y) * c.t;
      }
    }
    for (const n of state.noises) {
      n.life -= dt;
      n.r += (n.max - n.r) * dt * 6;
    }
    state.noises = state.noises.filter((n) => n.life > 0);

    let maxAlarm = 0;
    let spotted = false;
    for (const g of state.guards) {
      const before = g.suspicion;
      stepGuard(g, dt);
      if (g.suspicion > before && g.suspicion > 0.5) spotted = true;
      maxAlarm = Math.max(maxAlarm, g.suspicion);
      // A guard that reaches the player while fully alert catches them.
      if (g.state === G_ALERT && Math.hypot(g.x - p.x, g.y - p.y) < GUARD.radius + PLAYER.radius + 4) {
        state.caught = true;
      }
    }
    state.alarm = maxAlarm;
    if (spotted) events |= EVENT_SPOTTED;

    // Intel pickup.
    for (const item of state.intel) {
      if (!item.taken && Math.hypot(item.x - p.x, item.y - p.y) < PLAYER.radius + 16) {
        item.taken = true;
        state.score += SCORE.intel;
        events |= EVENT_INTEL;
      }
    }
    if (!state.exitOpen && state.intel.every((i) => i.taken)) state.exitOpen = true;

    // Reaching the open exit clears the level (or wins the game).
    if (state.exitOpen && Math.hypot(state.exit.x - p.x, state.exit.y - p.y) < PLAYER.radius + 18) {
      state.cleared = true;
      state.score += SCORE.levelClear;
      if (state.ghost) state.score += SCORE.ghostBonus;
      state.score += Math.max(0, Math.floor((180 - state.levelTime) * SCORE.timeBonusPerSecond));
      if (state.levelIndex + 1 >= LEVELS.length) state.won = true;
      events |= EVENT_CLEAR;
      return events;
    }

    if (state.caught) {
      state.lives -= 1;
      state.shake = 0.4;
      events |= EVENT_CAUGHT;
      if (state.lives <= 0) events |= EVENT_OVER;
      return events;
    }
    return events;
  }

  /** After being caught with lives left: restart the level, guards and all. */
  function retryLevel() {
    loadLevel(state.levelIndex);
  }

  /** After clearing a level: move to the next one. */
  function nextLevel() {
    if (state.levelIndex + 1 < LEVELS.length) loadLevel(state.levelIndex + 1);
  }

  loadLevel(0);
  return {
    state,
    reset,
    step,
    retryLevel,
    nextLevel,
    loadLevel,
    losClear: (x0, y0, x1, y1) => losClear(state.level, x0, y0, x1, y1),
  };
}
