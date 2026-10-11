import * as C from "./constants";
import { CAMPAIGN } from "./campaign";
import { generate } from "./generator";
import type {
  RefractState,
  RefractDebugApi,
  BeamState,
  Cell,
  Screen,
  PointerDevice,
} from "./game";
import {
  cellX,
  cellY,
  same,
  parseBoard,
  emptyBeams,
  canExtend,
  complete,
  spent,
  solved,
} from "./rules";
export { complete, spent, solved } from "./rules";
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function initialState(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: { cols: 0, rows: 0, nodes: [] },
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}
export function menuItems(s: RefractState): readonly string[] {
  if (s.screen === "title") return C.TITLE_ITEMS;
  if (s.screen === "complete") return ["BACK TO SELECT", "MAIN MENU"];
  if (s.screen === "solved")
    return s.mode === "cascade"
      ? C.SOLVED_ITEMS
      : [
          ...(s.boardIndex < C.CAMPAIGN_LENGTH - 1 ? ["NEXT BOARD"] : []),
          "REPLAY",
          "BACK TO SELECT",
        ];
  return [];
}
export function targets(s: RefractState): Target[] {
  const back = { id: "back", x: 48, y: 620, w: 160, h: C.TARGET_MIN_H };
  if (s.screen === "playing")
    return [{ id: "clear", x: 1072, y: 620, w: 160, h: C.TARGET_MIN_H }, back];
  if (s.screen === "howto") return [back];
  if (s.screen === "select")
    return Array.from({ length: C.CAMPAIGN_LENGTH }, (_, i) => ({
      id: `board-${i + 1}`,
      x: 260 + (i % 6) * 134,
      y: 200 + Math.floor(i / 6) * 96,
      w: 116,
      h: 78,
    })).concat(back);
  return menuItems(s).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 100 : 984,
    y: (s.screen === "title" ? 348 : 308) + i * 88,
    w: s.screen === "title" ? 380 : 248,
    h: C.TARGET_MIN_H,
  }));
}
const screen = (
  s: RefractState,
  next: Screen,
  menuIndex = 0,
): RefractState => ({
  ...s,
  screen: next,
  menuIndex,
  selectIndex: next === "select" ? s.boardIndex : s.selectIndex,
  armedTarget: null,
});
export const clear = (s: RefractState): RefractState => ({
  ...s,
  beams: s.beams.map((b) => ({ ...b, cells: [] })),
  tracing: null,
});
export function load(s: RefractState, lines: readonly string[]): RefractState {
  const board = parseBoard(lines);
  return {
    ...s,
    screen: "playing",
    board,
    beams: emptyBeams(board),
    tracing: null,
    armedTarget: null,
  };
}
function campaign(s: RefractState, index: number): RefractState {
  return {
    ...load(s, CAMPAIGN[index]),
    boardIndex: index,
    selectIndex: index,
    menuIndex: 0,
  };
}
function cascade(s: RefractState): RefractState {
  return { ...load(s, generate(s.tier)), menuIndex: 0 };
}
export function action(s: RefractState, name: C.ActionName): RefractState {
  if (name === "clear") return s.screen === "playing" ? clear(s) : s;
  if (name === "back") {
    if (s.screen === "title") return s;
    if (s.screen === "howto") return screen(s, "title", 2);
    if (s.screen === "select") return screen(s, "title", 0);
    if (s.screen === "complete") return screen(s, "select");
    const next =
      s.mode === "campaign" ? screen(s, "select") : screen(s, "title", 1);
    return s.screen === "playing" ? clear(next) : next;
  }
  if (s.screen === "select") {
    const col = s.selectIndex % 6,
      row = Math.floor(s.selectIndex / 6);
    if (name === "left" || name === "right")
      return {
        ...s,
        selectIndex: row * 6 + ((col + (name === "left" ? 5 : 1)) % 6),
      };
    if (name === "up" || name === "down")
      return {
        ...s,
        selectIndex: ((row + (name === "up" ? 3 : 1)) % 4) * 6 + col,
      };
    if (name === "confirm" && s.selectIndex < s.unlockedCount)
      return campaign(s, s.selectIndex);
    return s;
  }
  const items = menuItems(s);
  if (!items.length) return s;
  if (name === "up" || name === "down")
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "up" ? items.length - 1 : 1)) % items.length,
    };
  if (name !== "confirm") return s;
  if (s.screen === "title") {
    if (s.menuIndex === 0) return screen({ ...s, mode: "campaign" }, "select");
    if (s.menuIndex === 1)
      return cascade({ ...s, mode: "cascade", solvedCount: 0, tier: 1 });
    return screen(s, "howto");
  }
  if (s.screen === "complete")
    return screen(s, s.menuIndex === 0 ? "select" : "title");
  if (s.mode === "cascade")
    return cascade(s.menuIndex === 1 ? { ...s, solvedCount: 0, tier: 1 } : s);
  const choice = items[s.menuIndex];
  return choice === "NEXT BOARD"
    ? campaign(s, s.boardIndex + 1)
    : choice === "REPLAY"
      ? campaign(s, s.boardIndex)
      : screen(s, "select");
}
function finish(s: RefractState): RefractState {
  if (s.screen !== "playing" || !solved(s.board, s.beams)) return s;
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return screen(
      {
        ...s,
        tracing: null,
        solvedCount,
        tier: Math.min(
          Math.floor(solvedCount / C.TIER_ADVANCE) + 1,
          C.MAX_TIER,
        ),
      },
      "solved",
    );
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return screen(
    {
      ...s,
      tracing: null,
      solvedBoards,
      selectIndex: s.boardIndex,
      unlockedCount: Math.max(
        s.unlockedCount,
        Math.min(s.boardIndex + 2, C.CAMPAIGN_LENGTH),
      ),
    },
    solvedBoards.length === C.CAMPAIGN_LENGTH ? "complete" : "solved",
  );
}
const replaceBeam = (s: RefractState, beam: BeamState): RefractState => ({
  ...s,
  beams: s.beams.map((b) => (b.channel === beam.channel ? beam : b)),
});
function grab(s: RefractState, cell: Cell): RefractState {
  const node = s.board.nodes.find((n) => same(n, cell))!;
  let beam = s.beams.find(
    (b) =>
      b.channel === node.channel &&
      node.kind === "emitter" &&
      b.cells.length < 2,
  );
  if (beam) beam = { ...beam, cells: [cell] };
  else {
    beam = s.beams.find(
      (b) => same(b.cells[0], cell) || same(b.cells[b.cells.length - 1], cell),
    );
    if (beam)
      beam = {
        ...beam,
        cells: same(beam.cells[0], cell)
          ? [...beam.cells].reverse()
          : beam.cells,
      };
    else {
      const through = s.beams.filter((b) => b.cells.some((c) => same(c, cell)));
      if (through.length !== 1) return s;
      beam = through[0];
      const last = beam.cells.map((c) => same(c, cell)).lastIndexOf(true);
      beam = { ...beam, cells: beam.cells.slice(0, last + 1) };
    }
  }
  return { ...replaceBeam(s, beam), tracing: { channel: beam.channel } };
}
/** The engine's ordered samples and debug poses share this single input path. */
export function pointerEvent(
  s: RefractState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): RefractState {
  let next: RefractState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const target = targets(next).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target && (type === "down" || (type === "move" && !s.pointer.down))) {
    if (target.id.startsWith("menu-"))
      next = { ...next, menuIndex: Number(target.id.slice(5)) };
    if (target.id.startsWith("board-"))
      next = { ...next, selectIndex: Number(target.id.slice(6)) - 1 };
  }
  if (type === "up") {
    next = {
      ...next,
      armedTarget: null,
      tracing: null,
      beams: next.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    if (target && target.id === s.armedTarget)
      return action(
        next,
        target.id === "back"
          ? "back"
          : target.id === "clear"
            ? "clear"
            : "confirm",
      );
    return next;
  }
  if (type === "down")
    next = { ...next, armedTarget: target?.id ?? null, tracing: null };
  if (target && type === "down") return next;
  if (next.screen !== "playing") return next;
  const node = next.board.nodes.find(
    (n) =>
      Math.hypot(
        cellX(n.col, next.board.cols) - x,
        cellY(n.row, next.board.rows) - y,
      ) <= C.NODE_HIT_R,
  );
  if (!node) return next;
  const cell = { col: node.col, row: node.row };
  if (type === "down") return grab(next, cell);
  if (!next.tracing || !next.pointer.down) return next;
  const beam = next.beams.find((b) => b.channel === next.tracing!.channel)!;
  if (same(beam.cells[beam.cells.length - 2], cell))
    return replaceBeam(next, { ...beam, cells: beam.cells.slice(0, -1) });
  if (canExtend(next.board, next.beams, beam.channel, cell))
    next = replaceBeam(next, { ...beam, cells: [...beam.cells, cell] });
  return finish(next);
}
export function snapshot(s: RefractState) {
  return {
    version: C.REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      ...s.board,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s.beams, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        {
          cells: b.cells.map((c) => ({ ...c })),
          complete: complete(s.board, b),
        },
      ]),
    ),
    solved: solved(s.board, s.beams),
    tracing: s.tracing
      ? {
          channel: s.tracing.channel,
          live: {
            ...s.beams
              .find((b) => b.channel === s.tracing!.channel)!
              .cells.slice(-1)[0],
          },
        }
      : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug: RefractDebugApi = {
  version: C.REFRACT_DEBUG_VERSION,
  reset: (s) => initialState(s.muted),
  snapshot,
  reconcile: (s) => ({ ...s }),
  setMode: (s, mode) => ({ ...s, mode }),
  setScreen: (s, screen) => ({ ...s, screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
  setSolvedCount: (s, solvedCount) => ({ ...s, solvedCount }),
  setTier: (s, tier) => ({ ...s, tier }),
  generateBoard: (s, tier) => load(s, generate(tier)),
  loadBoard: load,
  pointerDown: (s, x, y, d) => pointerEvent(s, "down", x, y, d),
  pointerMove: (s, x, y, d) => pointerEvent(s, "move", x, y, d),
  pointerUp: (s, d) => pointerEvent(s, "up", s.pointer.x, s.pointer.y, d),
  clear,
};
