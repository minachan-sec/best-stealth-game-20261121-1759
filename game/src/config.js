// Every tuning number, colour and level in one place. The playfield is a fixed 1280x720
// logical area (32x18 tiles of 40px); the renderer scales it to the window, so no rule
// below depends on the screen size. SHADOWLINE is a top-down stealth game: slip past
// patrolling guards, use cover and bushes, grab the intel and reach the exit unseen.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  sneakSpeed: 168,
  runSpeed: 305,
  /** Running is loud: guards this close hear the footsteps and come looking. */
  noiseRadius: 175,
  /** How often running feet make a noise pulse, in seconds. */
  noiseInterval: 0.45,
};

export const GUARD = {
  radius: 13,
  /** How far a guard can see, in pixels. */
  viewRange: 245,
  /** Vision cone width, in radians (about 78 degrees). */
  viewAngle: 1.36,
  patrolSpeed: 72,
  chaseSpeed: 205,
  investigateSpeed: 130,
  /** Seconds a guard stares at a waypoint before moving on. */
  pauseAtWaypoint: 1.1,
  /** Suspicion gained per second while the player is dead-centre, point blank. */
  detectRate: 1.5,
  /** Suspicion lost per second while the player is unseen. */
  forgetRate: 0.55,
  /** Inside a bush the player is hidden unless a guard gets this close. */
  bushSpotRange: 46,
  /** Seconds a guard searches the last known position before giving up. */
  searchTime: 4,
  /** Seconds a guard stares at a noise point before going back on patrol. */
  inspectTime: 2.2,
};

export const COIN = {
  /** Coins per level. A click throws one to the clicked point; guards go look at it. */
  perLevel: 3,
  throwRange: 340,
  flightTime: 0.35,
  noiseRadius: 235,
};

export const LIVES = 3;

export const SCORE = {
  intel: 100,
  levelClear: 250,
  ghostBonus: 500,
  timeBonusPerSecond: 5,
};

export const PALETTE = {
  backdrop: '#0a0e18',
  floorA: '#171d2b',
  floorB: '#141a26',
  floorEdge: '#1e2636',
  wall: '#2b3448',
  wallTop: '#3d4a66',
  wallEdge: '#4a5878',
  crate: '#5a4632',
  crateTop: '#7a6248',
  bush: '#1d3a24',
  bushLeaf: '#2c5a33',
  bushLeaf2: '#3a7040',
  player: '#37e0b0',
  playerDark: '#0e7a5e',
  guard: '#e5534b',
  guardCalm: '#d8a03c',
  coneCalm: 'rgba(242, 201, 76, 0.20)',
  coneCalmEdge: 'rgba(242, 201, 76, 0.45)',
  coneAlert: 'rgba(229, 83, 75, 0.30)',
  coneAlertEdge: 'rgba(229, 83, 75, 0.60)',
  intel: '#ffd94d',
  exitLocked: '#e5534b',
  exitOpen: '#37e0b0',
  panel: '#121826',
  panelEdge: '#2b3550',
  text: '#eef1f5',
  muted: '#8b93a3',
  danger: '#ff5a52',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadowline.best';

// Level maps: 32 columns x 18 rows.
// '#' wall   '.' floor   'B' bush (hide in it)   'C' crate (cover, blocks sight)
// 'P' player start   'I' intel   'E' exit   Guards and their patrols are listed per level.
export const LEVELS = [
  {
    name: '1 · The Courtyard',
    brief: 'One guard post, one file. Learn to move unseen.',
    map: [
      '################################',
      '#P......B........C.......I.....#',
      '#........B...............#.....#',
      '#...C..........C.....#.........#',
      '#...................#....C.....#',
      '#..B......C......#.............#',
      '#............#..#......B.......#',
      '#....C....#..#..#..C...........#',
      '#.........#..#..#..............#',
      '#..B......#..#..#......C...B...#',
      '#.........#.....#..............#',
      '#....C....#..C..#...B..........#',
      '#.........#.....#..............#',
      '#..B......#..B..#......C...C...#',
      '#............#..#..............#',
      '#....C....B..#..#..B......B....#',
      '#...............#..........E...#',
      '################################',
    ],
    guards: [
      { waypoints: [[4, 2], [10, 2], [10, 6], [4, 6]] },
      { waypoints: [[24, 4], [24, 12], [19, 12], [19, 4]] },
    ],
  },
  {
    name: '2 · The Vault Wing',
    brief: 'Two files, three guards, tighter halls. Coins buy you room.',
    map: [
      '################################',
      '#P....B....#.....I...#..B......#',
      '#..C.......#...C...........C...#',
      '#....B...........B...#...B.....#',
      '#...C......#..C......#..C......#',
      '#.......B..#.......B.#......B..#',
      '#####.##########.#########.#####',
      '#..C.......#.C.......#...C.....#',
      '#.....B....#....B.........B....#',
      '#...C.............C..#......C..#',
      '#........B.#...B.....#..B......#',
      '#####.##########.#########.#####',
      '#..C.......#..C......#....C....#',
      '#......B...#.....B...#...B.....#',
      '#...C..............C.#.....C...#',
      '#.....B....#....B...........B..#',
      '#I.........#.........#......E..#',
      '################################',
    ],
    guards: [
      { waypoints: [[2, 2], [8, 2], [8, 4], [2, 4]] },
      { waypoints: [[24, 8], [28, 8], [28, 10], [24, 10]] },
      { waypoints: [[14, 13], [18, 13], [18, 15], [14, 15]] },
    ],
  },
  {
    name: '3 · The Core',
    brief: 'Three files. Four guards. No room for noise.',
    map: [
      '################################',
      '#P..B......#.....I...#.....B...#',
      '#..C..........C......#..C......#',
      '#......B...#......B..#....B....#',
      '#....C.....#...C.........C.....#',
      '#........B.#.......B.#......B..#',
      '#####.##########.#########.#####',
      '#.C........#.C.......#.C.......#',
      '#.....B.........B....#.......I.#',
      '#...C......#......C..#....C....#',
      '#.......B..#...B........B......#',
      '#####.##########.#########.#####',
      '#..C.......#..C......#...C.....#',
      '#.....B....#.....B.........B...#',
      '#....C.....#.......C.#....C....#',
      '#........B......B....#......B..#',
      '#I.........#.........#......E..#',
      '################################',
    ],
    guards: [
      { waypoints: [[2, 2], [8, 2], [8, 4], [2, 4]] },
      { waypoints: [[23, 2], [28, 2], [28, 4], [23, 4]] },
      { waypoints: [[3, 8], [9, 8], [9, 10], [3, 10]] },
      { waypoints: [[23, 13], [28, 13], [28, 15], [23, 15]] },
    ],
  },
];
