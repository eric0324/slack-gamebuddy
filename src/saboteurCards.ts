// 矮人礦坑的牌和地圖：通道牌形狀、牌庫組成、放牌規則、連通判斷、翻開終點、地圖繪製（純函式）
// 開口用 bitmask：上 1、右 2、下 4、左 8
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const ROWS = 9;
export const COLS = 13;
const START = { r: 4, c: 2 };
export const GOAL_CELLS = ['K3', 'K5', 'K7'];

export type Tool = 'pick' | 'lamp' | 'cart';
export const TOOLS: Tool[] = ['pick', 'lamp', 'cart'];
export const TOOL_NAME: Record<Tool, string> = { pick: '⛏️ 鎬子', lamp: '🔦 礦燈', cart: '🛒 礦車' };
export const TOOL_ICON: Record<Tool, string> = { pick: '⛏️', lamp: '🔦', cart: '🛒' };

export type PathCard = { kind: 'path'; edges: number; dead: boolean };
export type Card = PathCard | { kind: 'break'; tool: Tool } | { kind: 'fix'; tools: Tool[] } | { kind: 'map' } | { kind: 'rock' };
export type Cell = { kind: 'start' } | { kind: 'goal'; gold: boolean; edges: number; open: boolean } | PathCard;
export type Grid = (Cell | null)[][];
type Pos = { r: number; c: number };

// 轉 180°：上下互換、左右互換
export const rotate = (e: number) => ((e << 2) | (e >> 2)) & 15;

// [開口, 通道張數, 死路張數]
const SHAPES: [number, number, number][] = [
  [N | E | S | W, 5, 1],
  [N | E | S, 5, 1],
  [E | S | W, 5, 1],
  [N | S, 4, 1],
  [E | W, 3, 1],
  [E | S, 4, 1],
  [S | W, 5, 1],
  [N, 0, 1],
  [E, 0, 1],
];

export const pathCards = (): PathCard[] =>
  SHAPES.flatMap(([edges, tunnels, deads]) => [
    ...Array.from({ length: tunnels }, () => ({ kind: 'path' as const, edges, dead: false })),
    ...Array.from({ length: deads }, () => ({ kind: 'path' as const, edges, dead: true })),
  ]);

export const actionCards = (): Card[] => [
  ...TOOLS.flatMap((tool) => [1, 2, 3].map(() => ({ kind: 'break' as const, tool }))),
  ...TOOLS.flatMap((tool) => [1, 2].map(() => ({ kind: 'fix' as const, tools: [tool] }))),
  { kind: 'fix', tools: ['pick', 'lamp'] },
  { kind: 'fix', tools: ['pick', 'cart'] },
  { kind: 'fix', tools: ['lamp', 'cart'] },
  ...Array.from({ length: 6 }, () => ({ kind: 'map' as const })),
  ...Array.from({ length: 3 }, () => ({ kind: 'rock' as const })),
];

// 座標：A1～M9
export const cellName = ({ r, c }: Pos) => `${String.fromCharCode(65 + c)}${r + 1}`;
export function cellAt(name: string): Pos | null {
  const m = /^([A-M])([1-9])$/.exec(name);
  return m ? { r: Number(m[2]) - 1, c: m[1].charCodeAt(0) - 65 } : null;
}

// 起點在 C5；終點在 K3、K5、K7，gold 是金礦的位置（0～2），兩張石頭依序是「左上」「左下」
export function newGrid(gold: number): Grid {
  const grid: Grid = Array.from({ length: ROWS }, () => Array<Cell | null>(COLS).fill(null));
  grid[START.r][START.c] = { kind: 'start' };
  const stones = [W | N, W | S];
  GOAL_CELLS.forEach((name, i) => {
    const { r, c } = cellAt(name)!;
    grid[r][c] = { kind: 'goal', gold: i === gold, edges: i === gold ? 15 : stones.shift()!, open: false };
  });
  return grid;
}

const DIRS: [number, number, number][] = [
  [N, -1, 0],
  [E, 0, 1],
  [S, 1, 0],
  [W, 0, -1],
];
const inside = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const key = (r: number, c: number) => `${r},${c}`;

// 這格對外的開口；蓋著的終點和空格當作 null（不檢查）
function edgesOf(cell: Cell | null): number | null {
  if (!cell) return null;
  if (cell.kind === 'start') return 15;
  if (cell.kind === 'goal') return cell.open ? cell.edges : null;
  return cell.edges;
}
// 通道能不能穿過這格：起點、通道牌、翻開的終點
const passable = (cell: Cell | null) => !!cell && edgesOf(cell) !== null && !(cell.kind === 'path' && cell.dead);

// 從起點 BFS，只穿過通道，沿雙方都有開口的邊走
export function reached(grid: Grid): Set<string> {
  const seen = new Set([key(START.r, START.c)]);
  const queue: Pos[] = [START];
  while (queue.length) {
    const { r, c } = queue.shift()!;
    const mine = edgesOf(grid[r][c])!;
    for (const [d, dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!(mine & d) || !inside(nr, nc) || seen.has(key(nr, nc))) continue;
      const next = grid[nr][nc];
      if (!passable(next) || !(edgesOf(next)! & rotate(d))) continue;
      seen.add(key(nr, nc));
      queue.push({ r: nr, c: nc });
    }
  }
  return seen;
}

// 通道前緣：從起點連過來的開口所朝向的空格
export function frontier(grid: Grid): Pos[] {
  const out = new Map<string, Pos>();
  for (const k of reached(grid)) {
    const [r, c] = k.split(',').map(Number);
    const mine = edgesOf(grid[r][c])!;
    for (const [d, dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (mine & d && inside(nr, nc) && !grid[nr][nc]) out.set(key(nr, nc), { r: nr, c: nc });
    }
  }
  return [...out.values()];
}

function fits(grid: Grid, near: Set<string>, r: number, c: number, edges: number): boolean {
  let linked = false;
  for (const [d, dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inside(nr, nc)) continue;
    const other = edgesOf(grid[nr][nc]);
    if (other === null) continue;
    const facing = !!(other & rotate(d));
    if (facing !== !!(edges & d)) return false;
    if (facing && near.has(key(nr, nc))) linked = true;
  }
  return linked;
}

// 這張通道牌所有合法的位置和方向：由上而下、由左而右，原方向優先；轉後形狀相同只列一次
export function placements(grid: Grid, edges: number): { cell: string; rot: 0 | 1 }[] {
  const near = reached(grid);
  const rots: (0 | 1)[] = rotate(edges) === edges ? [0] : [0, 1];
  const out: { cell: string; rot: 0 | 1 }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) continue;
      for (const rot of rots) if (fits(grid, near, r, c, rot ? rotate(edges) : edges)) out.push({ cell: cellName({ r, c }), rot });
    }
  }
  return out;
}

// 放下通道牌（edges 是已經轉好的方向），回傳這次翻開的終點
export function place(grid: Grid, at: Pos, edges: number, dead: boolean): { cell: string; gold: boolean }[] {
  grid[at.r][at.c] = { kind: 'path', edges, dead };
  const found: { cell: string; gold: boolean }[] = [];
  for (let more = true; more; ) {
    more = false;
    const near = reached(grid);
    for (const name of GOAL_CELLS) {
      const { r, c } = cellAt(name)!;
      const goal = grid[r][c];
      if (goal?.kind !== 'goal' || goal.open) continue;
      // 連過來的那一側（從終點看出去的方向）
      const from = DIRS.find(([d, dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        return inside(nr, nc) && near.has(key(nr, nc)) && !!(edgesOf(grid[nr][nc])! & rotate(d));
      });
      if (!from) continue;
      if (!(goal.edges & from[0]) && rotate(goal.edges) & from[0]) goal.edges = rotate(goal.edges);
      goal.open = true;
      found.push({ cell: name, gold: goal.gold });
      more = true;
    }
  }
  return found;
}

const HEAVY = ' ╹╺┗╻┃┏┣╸┛━┻┓┫┳╋';
const LIGHT = ' ╵╶└╷│┌├╴┘─┴┐┤┬┼';
export const glyph = (edges: number, dead: boolean) => (dead ? LIGHT : HEAVY)[edges];
export const cardLabel = (card: PathCard) => `${glyph(card.edges, card.dead)} ${card.dead ? '死路' : '通道'}`;

function drawCell(cell: Cell | null): string {
  if (!cell) return '. ';
  if (cell.kind === 'goal' && !cell.open) return '? ';
  const edges = edgesOf(cell)!;
  const dead = cell.kind === 'path' && cell.dead;
  const first = cell.kind === 'start' ? 'S' : cell.kind === 'goal' && cell.gold ? '$' : glyph(edges, dead);
  return first + (edges & E ? (dead ? '─' : '━') : ' ');
}

// 地圖文字（不含 code block 的 ```）：第一行欄名，每列開頭列號，每格 2 字元
export function render(grid: Grid): string {
  const header = `  ${Array.from({ length: COLS }, (_, c) => String.fromCharCode(65 + c)).join(' ')}`;
  return [header, ...grid.map((row, r) => `${r + 1} ${row.map(drawCell).join('')}`.trimEnd())].join('\n');
}
