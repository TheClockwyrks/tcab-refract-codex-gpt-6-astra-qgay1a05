import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type RefractState } from "./game";
import { cellX, cellY, parseBoard, complete, canExtend } from "./rules";
import { targets, action } from "./simulation";
import { CAMPAIGN } from "./campaign";
import * as C from "./constants";

async function fixture() {
  const events = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  return { engine, events };
}
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterEach(() => {
  f.engine.destroy();
});
const pose = (fn: (s: RefractState) => RefractState) => f.engine.apply(fn);
const read = () => f.engine.debug.snapshot(f.engine.state);
const load = (b: readonly string[]) =>
  pose((s) => f.engine.debug.loadBoard(s, b));
function point(
  col: number,
  row: number,
  type: "down" | "move" = "move",
  device: "mouse" | "pen" | "touch" = "mouse",
) {
  const b = f.engine.state.board,
    x = cellX(col, b.cols),
    y = cellY(row, b.rows);
  pose((s) =>
    type === "down"
      ? f.engine.debug.pointerDown(s, x, y, device)
      : f.engine.debug.pointerMove(s, x, y, device),
  );
}
const up = () => pose((s) => f.engine.debug.pointerUp(s));
function draw(cells: readonly (readonly [number, number])[]) {
  cells.forEach(([c, r], i) => point(c, r, i ? "move" : "down"));
  up();
}
async function key(code: string) {
  f.events.dispatchEvent(
    Object.assign(new Event("keydown"), { code, repeat: false }),
  );
  await f.engine.advance(1);
  f.events.dispatchEvent(Object.assign(new Event("keyup"), { code }));
  await f.engine.advance(1);
}
function pointer(type: string, x: number, y: number, options = {}) {
  f.events.dispatchEvent(
    Object.assign(new Event(`pointer${type}`), {
      clientX: x,
      clientY: y,
      pointerId: 1,
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
      buttons: type === "up" ? 0 : 1,
      ...options,
    }),
  );
}
function tap(id: string) {
  const t = targets(f.engine.state).find((t) => t.id === id)!;
  pose((s) =>
    f.engine.debug.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2, "touch"),
  );
  pose((s) => f.engine.debug.pointerUp(s, "touch"));
}

describe("state and the engine contract", () => {
  it("starts with every declared field and a pure snapshot", () => {
    const s = read();
    expect(s).toMatchObject({
      version: C.REFRACT_DEBUG_VERSION,
      screen: "title",
      mode: "campaign",
      menuIndex: 0,
      boardIndex: 0,
      solvedBoards: [],
      unlockedCount: 1,
      selectIndex: 0,
      solvedCount: 0,
      tier: 1,
      tracing: null,
      pointer: { x: 0, y: 0, down: false, device: "mouse" },
      simTime: 0,
      muted: false,
    });
    s.solvedBoards.push(3);
    expect(read().solvedBoards).toEqual([]);
  });
  it("accumulates supplied seconds on every screen and across uneven frames", async () => {
    f.engine.setClock(new SequenceClock([10, 30, 20]));
    await f.engine.advance(30);
    expect(read().simTime).toBeCloseTo(0.6);
    pose((s) => f.engine.debug.setScreen(s, "howto"));
    await f.engine.advance(30);
    expect(read().simTime).toBeCloseTo(1.2);
  });
  it("poses only named fields and reconciles without advancing", () => {
    load(["TtT"]);
    point(0, 0, "down");
    const before = f.engine.state;
    pose((s) => f.engine.debug.setMode(s, "cascade"));
    expect(f.engine.state).toEqual({ ...before, mode: "cascade" });
    pose((s) => f.engine.debug.setSolvedCount(s, 9));
    expect(read().tier).toBe(1);
    pose((s) => f.engine.debug.setTier(s, 4));
    expect(read().solvedCount).toBe(9);
    pose((s) => f.engine.debug.setMenuIndex(s, 7));
    expect(read().menuIndex).toBe(7);
    const posed = f.engine.state;
    pose((s) => f.engine.debug.reconcile(s));
    pose((s) => f.engine.debug.reconcile(s));
    expect(f.engine.state).toEqual(posed);
    pose((s) => f.engine.debug.setScreen(s, "solved"));
    expect(read().tracing).not.toBeNull();
  });
  it("resets session data while keeping the mute bit", () => {
    pose((s) => ({
      ...s,
      muted: true,
      simTime: 12,
      solvedBoards: [0, 1],
      tier: 4,
      solvedCount: 17,
    }));
    pose((s) => f.engine.debug.reset(s));
    expect(read()).toMatchObject({
      screen: "title",
      solvedBoards: [],
      solvedCount: 0,
      tier: 1,
      simTime: 0,
      muted: true,
      board: { cols: 0, rows: 0, nodes: [] },
    });
  });
  it("rejects malformed notation and accepts maximum dimensions", () => {
    for (const b of [
      [],
      [""],
      ["TT", "t"],
      ["TX"],
      ["TT......"],
      Array(7).fill("T"),
    ])
      expect(() => load(b)).toThrow();
    load(["T......", ".......", ".......", ".......", ".......", "......T"]);
    expect(read().board.nodes.map((n) => [n.x, n.y])).toEqual([
      [352, 152],
      [928, 632],
    ]);
  });
  it("keeps previous state values intact through a complete trace", () => {
    load(["TtT"]);
    const old = f.engine.state;
    draw([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(old.beams[0].cells).toEqual([]);
    expect(read().solved).toBe(true);
  });
  it("registers readable diagnostics and mirrors runtime muting", async () => {
    load(["T1T"]);
    point(0, 0, "down");
    point(1, 0);
    await key("KeyM");
    expect(read().muted).toBe(true);
    const d = f.engine.diagnostics();
    expect(d.find((d) => d.name === "screen")?.value).toBe("playing");
    expect(d.some((d) => String(d.value).includes("1/1"))).toBe(true);
    expect(d.every((d) => !d.error)).toBe(true);
  });
});

describe("drawing limits and completion", () => {
  it("solves on the last segment immediately, with no extra frame or release", () => {
    load(["TtT"]);
    point(0, 0, "down");
    point(1, 0);
    expect(read().screen).toBe("playing");
    point(2, 0);
    expect(read()).toMatchObject({
      screen: "solved",
      tracing: null,
      solved: true,
      solvedBoards: [0],
      unlockedCount: 2,
    });
    const beams = read().beams;
    point(1, 0);
    up();
    expect(read().beams).toEqual(beams);
  });
  it("allows unfinished coverage at the second emitter without solving", () => {
    load(["TT", "t."]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    expect(read().beams.triangle.complete).toBe(false);
    expect(read().screen).toBe("playing");
    point(1, 0, "down");
    point(0, 1);
    expect(read().beams.triangle.cells).toHaveLength(2);
  });
  it("refuses gaps, nonadjacency, and nodes belonging to other channels", () => {
    load(["T.S.tT"]);
    point(0, 0, "down");
    point(1, 0);
    point(2, 0);
    point(4, 0);
    expect(read().beams.triangle.cells).toHaveLength(1);
    expect(read().tracing).not.toBeNull();
    load(["TStT"]);
    point(0, 0, "down");
    point(1, 0);
    expect(read().beams.triangle.cells).toHaveLength(1);
  });
  it("enforces exclusive diagonals across channels", () => {
    load(["TS", "ST"]);
    draw([
      [0, 0],
      [1, 1],
    ]);
    point(1, 0, "down");
    point(0, 1);
    expect(read().beams.square.cells).toHaveLength(1);
    expect(read().screen).toBe("playing");
  });
  it("enforces segment exclusivity and forbids a lens revisit", () => {
    load(["Ttt", "t2T"]);
    point(0, 0, "down");
    point(1, 0);
    point(1, 1);
    point(0, 1);
    point(1, 0);
    expect(read().beams.triangle.cells).toHaveLength(4);
    const b = parseBoard(["T2T"]);
    const beams = [
      {
        channel: "triangle" as const,
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
          { col: 2, row: 0 },
        ],
      },
    ];
    expect(canExtend(b, beams, "triangle", { col: 1, row: 0 })).toBe(false);
  });
  it("spends on entry, refunds on retract, and needs a completed crossing", () => {
    load(["T1T"]);
    point(0, 0, "down");
    point(1, 0);
    expect(read().board.nodes[1].spent).toBe(1);
    expect(read().solved).toBe(false);
    point(0, 0);
    expect(read().board.nodes[1].spent).toBe(0);
    point(1, 0);
    point(2, 0);
    expect(read().solved).toBe(true);
  });
  it("allows two channels to share a crystal and refuses spent charges", () => {
    load(["T.S", "t2s", "T.S"]);
    draw([
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ]);
    point(2, 0, "down");
    point(2, 1);
    point(1, 1);
    expect(read().board.nodes.find((n) => n.kind === "crystal")?.spent).toBe(2);
    point(2, 2);
    expect(read().solved).toBe(true);
    load(["T.S", "t1s", "T.S"]);
    draw([
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ]);
    point(2, 0, "down");
    point(2, 1);
    point(1, 1);
    expect(read().beams.square.cells).toHaveLength(2);
  });
  it("checks hit radius exactly and ignores empty-space presses", () => {
    load(["TtT"]);
    const x = cellX(0, 3),
      y = cellY(0, 1);
    pose((s) => f.engine.debug.pointerDown(s, x - C.NODE_HIT_R - 0.01, y));
    expect(read().tracing).toBeNull();
    expect(read().pointer.down).toBe(true);
    up();
    pose((s) => f.engine.debug.pointerDown(s, x - C.NODE_HIT_R, y, "pen"));
    expect(read().tracing?.channel).toBe("triangle");
    expect(read().pointer.device).toBe("pen");
  });
  it("discards an unextended start on release", () => {
    load(["TT"]);
    point(0, 0, "down");
    up();
    expect(read().beams.triangle.cells).toEqual([]);
    point(1, 0, "down");
    expect(read().beams.triangle.cells).toEqual([{ col: 1, row: 0 }]);
  });
  it("resumes either end by orienting the stored sequence", () => {
    load(["TttT"]);
    draw([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    point(0, 0, "down");
    expect(read().beams.triangle.cells).toEqual([
      { col: 2, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 0 },
    ]);
    point(1, 0);
    expect(read().beams.triangle.cells).toHaveLength(2);
  });
  it("shortens at an internal node and refuses grabbing an unused lens", () => {
    load(["TtttT"]);
    point(2, 0, "down");
    expect(read().tracing).toBeNull();
    up();
    draw([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    point(1, 0, "down");
    expect(read().beams.triangle.cells).toHaveLength(2);
    expect(read().tracing?.live).toEqual({ col: 1, row: 0 });
  });
  it("refuses an internal node shared by beams, but prioritizes an endpoint", () => {
    load(["T.S", "t2s", "T.S"]);
    draw([
      [0, 0],
      [1, 1],
      [0, 1],
    ]);
    draw([
      [2, 0],
      [1, 1],
      [2, 1],
    ]);
    point(1, 1, "down");
    expect(read().tracing).toBeNull();
    up();
    point(2, 1, "down");
    point(1, 1);
    up();
    point(1, 1, "down");
    expect(read().tracing?.channel).toBe("square");
  });
  it("keeps the last occurrence when shortening a repeated crystal", () => {
    load(["Ttt", "t2t", "ttT"]);
    pose((s) => ({
      ...s,
      beams: [
        {
          channel: "triangle",
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 1, row: 0 },
            { col: 2, row: 0 },
            { col: 2, row: 1 },
            { col: 1, row: 1 },
            { col: 0, row: 1 },
          ],
        },
      ],
    }));
    point(1, 1, "down");
    expect(read().beams.triangle.cells).toHaveLength(6);
  });
  it("clears from the debug surface on any screen while preserving nodes", () => {
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    const board = read().board;
    pose((s) => f.engine.debug.clear(s));
    expect(read().beams.triangle.cells).toEqual([]);
    expect(read().screen).toBe("solved");
    expect(read().board).toEqual(board);
  });
});

describe("menus, targets, and independent progressions", () => {
  it("operates all title choices from keyboard and wraps selection", async () => {
    await key("ArrowUp");
    expect(read().menuIndex).toBe(2);
    await key("Enter");
    expect(read().screen).toBe("howto");
    await key("Escape");
    expect(read().menuIndex).toBe(2);
    await key("ArrowDown");
    expect(read().menuIndex).toBe(0);
    await key("Enter");
    expect(read().screen).toBe("select");
  });
  it("has correctly sized, disjoint targets wholly within the stage", () => {
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const)
      for (const mode of ["campaign", "cascade"] as const) {
        pose((s) => ({ ...s, screen, mode }));
        const ts = targets(f.engine.state);
        ts.forEach((t, i) => {
          expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
          expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.y).toBeGreaterThanOrEqual(0);
          expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
          expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
          for (const o of ts.slice(i + 1))
            expect(
              t.x + t.w <= o.x ||
                o.x + o.w <= t.x ||
                t.y + t.h <= o.y ||
                o.y + o.h <= t.y,
            ).toBe(true);
        });
      }
  });
  it("requires press and release in the same target, and highlights touch presses", () => {
    const t = targets(f.engine.state)[1];
    pose((s) => f.engine.debug.pointerDown(s, t.x + 10, t.y + 10, "touch"));
    expect(read().menuIndex).toBe(1);
    pose((s) => f.engine.debug.pointerMove(s, 10, 10, "touch"));
    up();
    expect(read().screen).toBe("title");
    tap("menu-0");
    expect(read().screen).toBe("select");
    tap("board-2");
    expect(read().screen).toBe("select");
    tap("board-1");
    expect(read().screen).toBe("playing");
  });
  it("disarms a held pointer across screen transitions", () => {
    const t = targets(f.engine.state)[0];
    pose((s) => f.engine.debug.pointerDown(s, t.x + 10, t.y + 10));
    pose((s) => f.engine.debug.setScreen(s, "solved"));
    up();
    expect(read().screen).toBe("solved");
  });
  it("wraps campaign grid in rows and columns and returns to the last study", async () => {
    tap("menu-0");
    await key("ArrowLeft");
    expect(read().selectIndex).toBe(5);
    await key("ArrowUp");
    expect(read().selectIndex).toBe(23);
    await key("Enter");
    expect(read().screen).toBe("select");
    tap("board-1");
    tap("back");
    expect(read().selectIndex).toBe(0);
    tap("back");
    expect(read().menuIndex).toBe(0);
  });
  it("ships all 24 exact campaign boards and starts each empty", () => {
    expect(CAMPAIGN).toHaveLength(C.CAMPAIGN_LENGTH);
    for (let i = 0; i < CAMPAIGN.length; i++) {
      pose((s) => ({
        ...s,
        screen: "select",
        selectIndex: i,
        unlockedCount: C.CAMPAIGN_LENGTH,
      }));
      pose((s) => action(s, "confirm"));
      expect(
        read().board.nodes.map(({ col, row, kind, channel, charges }) => ({
          col,
          row,
          kind,
          channel,
          charges,
        })),
      ).toEqual(parseBoard(CAMPAIGN[i]).nodes);
      expect(f.engine.state.beams.every((b) => !b.cells.length)).toBe(true);
    }
  });
  it("replay does not change unlock state, and next opens the next board", () => {
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    tap("menu-1");
    expect(read().boardIndex).toBe(0);
    expect(read().beams.triangle.cells).toHaveLength(0);
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    expect(read().solvedBoards).toEqual([0]);
    tap("menu-0");
    expect(read().boardIndex).toBe(1);
  });
  it("finishes the campaign and keeps every board unlocked for replay", () => {
    pose((s) => ({
      ...s,
      boardIndex: 23,
      solvedBoards: Array.from({ length: 23 }, (_, i) => i),
      unlockedCount: 24,
    }));
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    expect(read().screen).toBe("complete");
    expect(read().solvedBoards).toHaveLength(24);
    tap("menu-0");
    expect(read().screen).toBe("select");
    pose((s) => f.engine.debug.setScreen(s, "complete"));
    tap("menu-1");
    expect(read().screen).toBe("title");
  });
  it("has no next choice after replaying board 24", () => {
    pose((s) => ({ ...s, boardIndex: 23 }));
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    expect(read().targets).toHaveLength(2);
    tap("menu-0");
    expect(read().boardIndex).toBe(23);
    expect(read().screen).toBe("playing");
  });
  it("preserves campaign progress through Cascade and resets only the run on restart", () => {
    pose((s) => ({
      ...s,
      solvedBoards: [0, 1],
      unlockedCount: 3,
      boardIndex: 1,
      selectIndex: 1,
    }));
    tap("menu-1");
    expect(read()).toMatchObject({
      mode: "cascade",
      screen: "playing",
      solvedCount: 0,
      tier: 1,
      solvedBoards: [0, 1],
      unlockedCount: 3,
      boardIndex: 1,
    });
    pose((s) => f.engine.debug.setSolvedCount(s, 4));
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    expect(read()).toMatchObject({ solvedCount: 5, tier: 2, screen: "solved" });
    tap("menu-0");
    expect(read().tier).toBe(2);
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    tap("menu-1");
    expect(read()).toMatchObject({
      solvedCount: 0,
      tier: 1,
      solvedBoards: [0, 1],
    });
    tap("back");
    expect(read().menuIndex).toBe(1);
    tap("menu-0");
    expect(read().solvedBoards).toEqual([0, 1]);
  });
  it("caps Cascade at its last tier and ignores confirm during play", async () => {
    pose((s) => ({ ...s, mode: "cascade", solvedCount: 100 }));
    load(["TT"]);
    await key("Enter");
    expect(read().screen).toBe("playing");
    draw([
      [0, 0],
      [1, 0],
    ]);
    expect(read()).toMatchObject({ tier: C.MAX_TIER, solvedCount: 101 });
    await key("Escape");
    expect(read().menuIndex).toBe(1);
  });
  it("reads clear only during play", async () => {
    load(["TT"]);
    draw([
      [0, 0],
      [1, 0],
    ]);
    await key("KeyR");
    expect(read().beams.triangle.cells).toHaveLength(2);
    pose((s) => f.engine.debug.setScreen(s, "playing"));
    await key("KeyR");
    expect(read().beams.triangle.cells).toHaveLength(0);
  });
});

describe("real engine pointer samples, sound and rendering", () => {
  it("resolves every ordered sample in one frame and emits each cue once", async () => {
    load(["TttT"]);
    const cues: string[] = [];
    f.engine.events.on("cue:played", (e) => cues.push(e.cue));
    pointer("down", cellX(0, 4), C.BOARD_CY);
    for (let c = 1; c < 4; c++) pointer("move", cellX(c, 4), C.BOARD_CY);
    pointer("up", cellX(3, 4), C.BOARD_CY);
    await f.engine.advance(1);
    expect(read().solved).toBe(true);
    expect(cues.sort()).toEqual(
      [C.CUES.connect, C.CUES.channelComplete, C.CUES.solved].sort(),
    );
    expect(read().pointer.down).toBe(false);
  });
  it("ignores a secondary contact and retains the primary device", async () => {
    load(["TtT"]);
    pointer("down", cellX(0, 3), C.BOARD_CY, { pointerType: "touch" });
    pointer("move", cellX(2, 3), C.BOARD_CY, {
      pointerId: 2,
      isPrimary: false,
      pointerType: "touch",
    });
    await f.engine.advance(1);
    expect(read().beams.triangle.cells).toHaveLength(1);
    expect(read().pointer.device).toBe("touch");
  });
  it("plays distinct retract and clear cues, and no clear for an empty board", async () => {
    load(["TttT"]);
    const cues: string[] = [];
    f.engine.events.on("cue:played", (e) => cues.push(e.cue));
    pointer("down", cellX(0, 4), C.BOARD_CY);
    pointer("move", cellX(1, 4), C.BOARD_CY);
    pointer("move", cellX(2, 4), C.BOARD_CY);
    pointer("move", cellX(1, 4), C.BOARD_CY);
    await f.engine.advance(1);
    expect(cues).toContain(C.CUES.retract);
    await key("KeyR");
    await key("KeyR");
    expect(cues.filter((c) => c === C.CUES.clear)).toHaveLength(1);
  });
  it("renders all screens and records real canvas draw operations", async () => {
    f.engine.startRecording();
    for (const screen of ["title", "howto", "select"] as const) {
      pose((s) => f.engine.debug.setScreen(s, screen));
      await f.engine.advance(1);
    }
    load(CAMPAIGN[23]);
    for (const screen of ["playing", "solved", "complete"] as const) {
      pose((s) => f.engine.debug.setScreen(s, screen));
      await f.engine.advance(1);
    }
    const recording = f.engine.stopRecording();
    expect(recording.frames).toHaveLength(6);
    expect(recording.ops.length).toBeGreaterThan(100);
    expect(recording.images).toHaveLength(0);
  });
  it("derives completeness from the actual board", () => {
    const board = parseBoard(["TtT"]);
    expect(
      complete(board, {
        channel: "triangle",
        cells: [
          { col: 0, row: 0 },
          { col: 2, row: 0 },
        ],
      }),
    ).toBe(false);
  });
});

it("restores the last entered study when returning to the campaign grid", () => {
  tap("menu-0");
  pose((s) => action(s, "right"));
  expect(read().selectIndex).toBe(1);
  tap("back");
  tap("menu-0");
  expect(read().selectIndex).toBe(0);
  pose((s) => ({ ...s, unlockedCount: 4, selectIndex: 2 }));
  pose((s) => action(s, "confirm"));
  tap("back");
  pose((s) => action(s, "down"));
  tap("back");
  tap("menu-0");
  expect(read().selectIndex).toBe(2);
});
