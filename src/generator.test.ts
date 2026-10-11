import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { analyze, meetsFloor } from "./analyzer";
import { generate, fitsTier } from "./generator";
import { SEEDS } from "./seeds";
import { parseBoard, cellX, cellY } from "./rules";
import { game } from "./game";
import { TIERS, CHANNELS, STAGE_W, STAGE_H } from "./constants";

function rng(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
describe("exhaustive difficulty certification", () => {
  it.each(Object.entries(SEEDS))(
    "certifies all fallback boards in %s",
    (key, boards) => {
      const tier = Number(key.split("-")[0]);
      for (const lines of boards) {
        expect(fitsTier(lines, tier)).toBe(true);
        const a = analyze(parseBoard(lines), TIERS[tier - 1].maxSolutions);
        expect(a).not.toBeNull();
        expect(meetsFloor(a!, tier)).toBe(true);
      }
    },
  );
  it("rejects unsolvable boards and refuses incomplete searches or excessive solutions", () => {
    expect(analyze(parseBoard(["T.T"]))).toBeNull();
    expect(analyze(parseBoard(["Ttt"]))).toBeNull();
    expect(analyze(parseBoard(["TtT"]), 256, 1)).toBeNull();
    expect(analyze(parseBoard([".Tt", "ttT", ".tt"]), 1)).toBeNull();
  });
  it("counts each undirected solution once and measures its forced segments", () => {
    const a = analyze(parseBoard([".Tt", "ttT", ".tt"]))!;
    expect(a.solutions).toHaveLength(2);
    expect(a.routes[0]).toHaveLength(2);
    expect(a.determinedShare).toBe(0.5);
    expect(a.branching).toBeCloseTo(7 / 3);
  });
  it("distinguishes complete channel routes from crystal-satisfying solutions", () => {
    const a = analyze(parseBoard(["T.S", "t2s", "T.S"]))!;
    expect(a.routes.every((r) => r.length > 1)).toBe(true);
    expect(a.sharedCrystals).toBe(1);
    expect(
      a.solutions.every((s) => s.reduce((v, r) => v + r.uses[0], 0) === 2),
    ).toBe(true);
  });
  it("rejects candidates outside their tier shape or channel contract", () => {
    expect(fitsTier(["TT"], 1)).toBe(false);
    expect(fitsTier(["T..", "...", "..T"], 1)).toBe(false);
    expect(fitsTier(["TtT", "sSs", "ssS"], 1)).toBe(false);
    expect(fitsTier(["T2T", "ttt", "ttt"], 1)).toBe(false);
    expect(() => generate(0)).toThrow();
  });
});

describe("Cascade generation", () => {
  it.each([1, 2, 3, 4, 5])(
    "emits only certified, varied boards at tier %s",
    (tier) => {
      const random = rng(790 + tier),
        seen = new Set<string>(),
        sizes = new Set<string>();
      for (let i = 0; i < 24; i++) {
        const lines = generate(tier, random),
          board = parseBoard(lines);
        seen.add(lines.join("/"));
        sizes.add(`${board.cols}x${board.rows}`);
        expect(fitsTier(lines, tier)).toBe(true);
        const a = analyze(board, TIERS[tier - 1].maxSolutions);
        expect(a).not.toBeNull();
        expect(meetsFloor(a!, tier)).toBe(true);
      }
      const t = TIERS[tier - 1];
      expect(seen.size).toBeGreaterThan(12);
      expect(sizes.size).toBe(
        (t.maxCols - t.minCols + 1) * (t.maxRows - t.minRows + 1),
      );
    },
    20000,
  );
  it.each([1, 2, 3, 4, 5])(
    "plays a generated tier %s solution through the actual engine",
    async (tier) => {
      const events = new EventTarget();
      const engine = createEngine({
        canvas: createCanvas(STAGE_W, STAGE_H) as unknown as HTMLCanvasElement,
        width: STAGE_W,
        height: STAGE_H,
        game,
        clock: new ConstantClock(16),
        surface: {
          cssWidth: () => STAGE_W,
          cssHeight: () => STAGE_H,
          dpr: () => 1,
          events: () => events,
        },
      });
      await engine.initialize();
      const lines = generate(tier, rng(915 + tier));
      const board = parseBoard(lines),
        a = analyze(board)!;
      engine.apply((s) => engine.debug.setMode(s, "cascade"));
      engine.apply((s) => engine.debug.setTier(s, tier));
      engine.apply((s) => engine.debug.loadBoard(s, lines));
      for (const route of a.solutions[0]) {
        route.cells.forEach((id, i) => {
          const n = board.nodes[id],
            x = cellX(n.col, board.cols),
            y = cellY(n.row, board.rows);
          engine.apply((s) =>
            i === 0
              ? engine.debug.pointerDown(s, x, y, "touch")
              : engine.debug.pointerMove(s, x, y, "touch"),
          );
        });
        engine.apply((s) => engine.debug.pointerUp(s, "touch"));
      }
      const snap = engine.debug.snapshot(engine.state);
      expect(snap.solved).toBe(true);
      expect(snap.screen).toBe("solved");
      expect(snap.solvedCount).toBe(1);
      expect(Object.keys(snap.beams)).toEqual(
        CHANNELS.slice(0, TIERS[tier - 1].channels),
      );
      await engine.advance(1);
      engine.destroy();
    },
  );
});
