// The screenshot scenes behind ?shot=start|play|close|end. Each one plays the real
// rules forward from a fresh world, steered by a waypoint autopilot that sneaks, waits
// out patrols and hides in bushes, so every frame is what a real game looks like and
// the same seed always gives the same frame.
import { FIELD, PLAYER, STEP, TILE } from './config.js';
import { EVENT_CAUGHT, EVENT_CLEAR, findPath } from './world.js';
import { SCREEN_CLEAR, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const MAX_SECONDS = 150;

/** Drive the player along BFS paths through `tiles`, waiting when a guard looks close. */
function drive(world, tiles, seconds, stopWhen) {
  const state = world.state;
  let leg = 0;
  let path = [];
  let waited = 0;
  for (let t = 0; t < seconds / STEP; t += 1) {
    if (stopWhen && stopWhen(state)) return true;
    if (state.caught || state.cleared) return state.cleared;
    if (leg >= tiles.length) return true;
    // Freeze when a guard is growing suspicious or very near: patience is stealth.
    const danger = state.alarm > 0.12 || state.guards.some((g) => Math.hypot(g.x - state.player.x, g.y - state.player.y) < 110);
    if (danger && waited < 8) {
      waited += STEP;
      world.step(STEP, { x: 0, y: 0 }, false, null);
      continue;
    }
    waited = 0;
    const [tx, ty] = tiles[leg];
    const target = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    if (path.length === 0) {
      path = findPath(state.level, state.player.x, state.player.y, target.x, target.y);
      if (path.length === 0) {
        leg += 1;
        continue;
      }
    }
    const next = path[0];
    const dx = next.x - state.player.x;
    const dy = next.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      path.shift();
      if (path.length === 0) leg += 1;
      continue;
    }
    world.step(STEP, { x: dx / dist, y: dy / dist }, false, null);
  }
  return leg >= tiles.length;
}

/** Idle the world forward, guards patrolling, player standing still. */
function idle(world, seconds, stopWhen) {
  for (let t = 0; t < seconds / STEP; t += 1) {
    if (stopWhen && stopWhen(world.state)) return true;
    world.step(STEP, { x: 0, y: 0 }, false, null);
    if (world.state.caught || world.state.cleared) return false;
  }
  return true;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. start: title over a live courtyard. play: mid-sneak, hidden in a
 * bush as a guard sweeps past. close: a near miss, the eye half full. end: the
 * first level cleared.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // Sneak to the bush by the courtyard's top wall and wait for a guard to sweep by.
    drive(world, [[8, 1]], 40);
    idle(world, 30, (s) => s.guards.some((g) => Math.hypot(g.x - s.player.x, g.y - s.player.y) < 190));
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'close') {
    // Step into the open where the courtyard guard's patrol turns, and freeze the
    // moment the eye is half full: seen, but not yet caught.
    drive(world, [[12, 3]], 40);
    idle(world, 40, (s) => s.alarm >= 0.55);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    // Clear the first level: take the file, slip down the east wall, out the exit.
    drive(world, [[22, 1], [25, 1], [28, 6], [28, 14], [27, 16]], MAX_SECONDS);
    if (world.state.cleared) return { screen: SCREEN_CLEAR, best: world.state.score };
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, false, null);
  return { screen: SCREEN_TITLE, best: 0 };
}
