import "./stage.css";
import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import {
  initialState,
  debug,
  action,
  pointerEvent,
  snapshot,
  complete,
  spent,
  solved,
} from "./simulation";
import { render } from "./render";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

export interface RefractDebugApi {
  readonly version: number;
  reset(state: DeepReadonly<RefractState>): RefractState;
  snapshot(state: DeepReadonly<RefractState>): ReturnType<typeof snapshot>;
  reconcile(state: DeepReadonly<RefractState>): RefractState;
  setMode(state: DeepReadonly<RefractState>, mode: Mode): RefractState;
  setScreen(state: DeepReadonly<RefractState>, screen: Screen): RefractState;
  setMenuIndex(state: DeepReadonly<RefractState>, index: number): RefractState;
  setSolvedCount(
    state: DeepReadonly<RefractState>,
    count: number,
  ): RefractState;
  setTier(state: DeepReadonly<RefractState>, tier: number): RefractState;
  generateBoard(state: DeepReadonly<RefractState>, tier: number): RefractState;
  loadBoard(
    state: DeepReadonly<RefractState>,
    board: readonly string[],
  ): RefractState;
  pointerDown(
    state: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    state: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(
    state: DeepReadonly<RefractState>,
    device?: PointerDevice,
  ): RefractState;
  clear(state: DeepReadonly<RefractState>): RefractState;
}
export const BACKGROUND = "#080f16";
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const tones = [440, 320, 660, 880, 180];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 2 ? "triangle" : "sine",
        freq: tones[i],
        freqTo: tones[i] * (i === 1 || i === 4 ? 0.6 : 1.5),
        durationMs: [85, 65, 220, 480, 160][i],
        gain: 0.1,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    for (const channel of C.CHANNELS)
      api.diagnostics.register(channel, (s) => {
        const b = s.beams.find((b) => b.channel === channel);
        return b
          ? `${Math.max(0, b.cells.length - 1)} segments · ${complete(s.board, b) ? "complete" : "open"}`
          : "absent";
      });
    for (let row = 0; row < C.GRID_MAX_ROWS; row++)
      api.diagnostics.register(
        `crystals row ${row}`,
        (s) =>
          s.board.nodes
            .filter((n) => n.kind === "crystal" && n.row === row)
            .map((n) => `${n.col}: ${spent(s.beams, n)}/${n.charges}`)
            .join(" · ") || "—",
      );
    api.diagnostics.register("solved", (s) => solved(s.board, s.beams));
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [initialState(), debug];
  },
  update(state, api, dt) {
    let next: RefractState = state;
    const cues = new Set<string>();
    const transition = (after: RefractState, clearing = false) => {
      for (const before of next.beams) {
        const b = after.beams.find((b) => b.channel === before.channel);
        if (
          !b ||
          after.board !== next.board ||
          next.screen !== "playing" ||
          after.screen === "select" ||
          after.screen === "title"
        )
          continue;
        if (b.cells.length > before.cells.length && b.cells.length > 1)
          cues.add(C.CUES.connect);
        if (b.cells.length < before.cells.length && before.cells.length > 1)
          cues.add(clearing ? C.CUES.clear : C.CUES.retract);
        if (!complete(next.board, before) && complete(after.board, b))
          cues.add(C.CUES.channelComplete);
      }
      if (
        next.screen === "playing" &&
        (after.screen === "solved" || after.screen === "complete")
      )
        cues.add(C.CUES.solved);
      next = after;
    };
    for (const name of C.ACTIONS)
      if (api.input.pressed(name)) {
        if (name === "mute") api.audio.setMuted(!api.audio.muted());
        else transition(action(next, name), name === "clear");
      }
    for (const p of api.input.pointerSamples()) {
      if (!p.primary || (p.type !== "move" && p.button !== "primary")) continue;
      transition(
        pointerEvent(next, p.type, p.x, p.y, p.device),
        p.type === "up" && next.armedTarget === "clear",
      );
    }
    for (const cue of cues) api.audio.play(cue);
    const p = api.input.pointer();
    return {
      ...next,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      muted: api.audio.muted(),
      simTime: next.simTime + dt,
    };
  },
  render,
};
