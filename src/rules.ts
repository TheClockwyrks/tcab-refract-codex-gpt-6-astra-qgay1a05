import * as C from "./constants";
import type { BeamState, BoardState, Cell, Channel, NodeState } from "./game";

export const same = (a: Cell | undefined, b: Cell | undefined): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const cellX = (col: number, cols: number): number =>
  C.BOARD_CX - ((cols - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number, rows: number): number =>
  C.BOARD_CY - ((rows - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const nodeAt = (board: BoardState, cell: Cell): NodeState | undefined =>
  board.nodes.find((n) => same(n, cell));
export const spent = (beams: readonly BeamState[], cell: Cell): number =>
  beams.reduce(
    (sum, b) => sum + b.cells.filter((c) => same(c, cell)).length,
    0,
  );
export const segments = (beam: BeamState): [Cell, Cell][] =>
  beam.cells.slice(1).map((c, i) => [beam.cells[i], c]);
export function parseBoard(lines: readonly string[]): BoardState {
  const cols = lines[0]?.length ?? 0;
  if (
    !cols ||
    cols > C.GRID_MAX_COLS ||
    !lines.length ||
    lines.length > C.GRID_MAX_ROWS ||
    lines.some((l) => l.length !== cols)
  )
    throw new Error("Invalid board dimensions");
  const nodes: NodeState[] = [];
  lines.forEach((line, row) =>
    [...line].forEach((char, col) => {
      if (char === ".") return;
      const index = "tsd".indexOf(char.toLowerCase());
      if (index >= 0)
        nodes.push({
          col,
          row,
          kind: char === char.toUpperCase() ? "emitter" : "lens",
          channel: C.CHANNELS[index],
          charges: null,
        });
      else if (/^[1-3]$/.test(char) && Number(char) <= C.MAX_CHARGES)
        nodes.push({
          col,
          row,
          kind: "crystal",
          channel: null,
          charges: Number(char),
        });
      else throw new Error(`Unknown board symbol: ${char}`);
    }),
  );
  return { cols, rows: lines.length, nodes };
}
export const emptyBeams = (board: BoardState): BeamState[] =>
  C.CHANNELS.filter((channel) =>
    board.nodes.some((n) => n.channel === channel),
  ).map((channel) => ({ channel, cells: [] }));
export function complete(board: BoardState, beam: BeamState): boolean {
  if (beam.cells.length < 2) return false;
  const first = nodeAt(board, beam.cells[0]);
  const last = nodeAt(board, beam.cells[beam.cells.length - 1]);
  return (
    first?.kind === "emitter" &&
    last?.kind === "emitter" &&
    first.channel === beam.channel &&
    last.channel === beam.channel &&
    !same(first, last) &&
    board.nodes
      .filter((n) => n.kind === "lens" && n.channel === beam.channel)
      .every((n) => beam.cells.filter((c) => same(c, n)).length === 1)
  );
}
export function solved(
  board: BoardState,
  beams: readonly BeamState[],
): boolean {
  return (
    beams.length > 0 &&
    beams.every((b) => complete(board, b)) &&
    board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(beams, n) === n.charges &&
          beams.every(
            (b) =>
              !same(b.cells[0], n) && !same(b.cells[b.cells.length - 1], n),
          ),
      )
  );
}
/** Limits only: coverage and crystal satisfaction never reject an extension. */
export function canExtend(
  board: BoardState,
  beams: readonly BeamState[],
  channel: Channel,
  target: Cell,
): boolean {
  const beam = beams.find((b) => b.channel === channel);
  if (!beam?.cells.length) return false;
  const from = beam.cells[beam.cells.length - 1];
  if (
    same(from, target) ||
    Math.abs(from.col - target.col) > 1 ||
    Math.abs(from.row - target.row) > 1
  )
    return false;
  const node = nodeAt(board, target);
  if (!node || (node.channel !== null && node.channel !== channel))
    return false;
  if (beam.cells.length > 1 && nodeAt(board, from)?.kind === "emitter")
    return false;
  if (
    node.kind === "crystal"
      ? spent(beams, node) >= node.charges!
      : beam.cells.some((c) => same(c, target))
  )
    return false;
  for (const b of beams)
    for (const [a, z] of segments(b)) {
      if (
        (same(a, from) && same(z, target)) ||
        (same(z, from) && same(a, target))
      )
        return false;
      if (
        a.col !== z.col &&
        a.row !== z.row &&
        from.col !== target.col &&
        from.row !== target.row &&
        a.col + z.col === from.col + target.col &&
        a.row + z.row === from.row + target.row
      )
        return false;
    }
  return true;
}
