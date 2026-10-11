import { CHANNELS, TIERS } from "./constants";
import { analyze, meetsFloor } from "./analyzer";
import { parseBoard } from "./rules";
import { SEEDS } from "./seeds";

const randomInt = (min: number, max: number, random: () => number): number =>
  min + Math.floor(random() * (max - min + 1));
export function fitsTier(lines: readonly string[], tier: number): boolean {
  const t = TIERS[tier - 1],
    b = parseBoard(lines);
  if (
    b.cols < t.minCols ||
    b.cols > t.maxCols ||
    b.rows < t.minRows ||
    b.rows > t.maxRows ||
    b.cols * b.rows - b.nodes.length > t.maxEmptyCells
  )
    return false;
  const crystals = b.nodes.filter((n) => n.kind === "crystal");
  if (
    crystals.length < t.minCrystals ||
    crystals.length > t.maxCrystals ||
    crystals.some((n) => n.charges! < t.minCharges || n.charges! > t.maxCharges)
  )
    return false;
  return CHANNELS.every((ch, i) =>
    i < t.channels
      ? b.nodes.filter((n) => n.kind === "emitter" && n.channel === ch)
          .length === 2
      : b.nodes.every((n) => n.channel !== ch),
  );
}
/**
 * Bounded rejection sampling avoids a slow or unbounded search on the UI thread.
 * Geometry is sampled independently. We perturb node locations, endpoint locations,
 * channel assignments and crystal charges, then certify the actual emitted picture.
 * A certified starting point is the fallback if the search budget is exhausted.
 * No mutable catalogue, random seed or progression is held outside game state.
 */
export function generate(
  tier: number,
  random: () => number = Math.random,
): readonly string[] {
  const t = TIERS[tier - 1];
  if (!t) throw new RangeError(`Unknown tier: ${tier}`);
  const cols = randomInt(t.minCols, t.maxCols, random),
    rows = randomInt(t.minRows, t.maxRows, random);
  const pool = SEEDS[`${tier}-${cols}-${rows}`];
  const seed = pool[randomInt(0, pool.length - 1, random)];
  for (let attempt = 0; attempt < 10; attempt++) {
    let candidate = [...seed];
    if (random() < 0.5) candidate.reverse();
    if (random() < 0.5)
      candidate = candidate.map((r) => [...r].reverse().join(""));
    const cells = candidate.join("").split("");
    const mutations = attempt === 9 ? 0 : randomInt(1, 3, random);
    for (let m = 0; m < mutations; m++) {
      const a = randomInt(0, cells.length - 1, random),
        b = randomInt(0, cells.length - 1, random);
      if (random() < 0.65) [cells[a], cells[b]] = [cells[b], cells[a]];
      else if (!"TSD".includes(cells[a])) {
        const palette = `.${"tsd".slice(0, t.channels)}${Array.from({ length: t.maxCharges }, (_, i) => i + 1).join("")}`;
        cells[a] = palette[randomInt(0, palette.length - 1, random)];
      }
    }
    candidate = Array.from({ length: rows }, (_, r) =>
      cells.slice(r * cols, (r + 1) * cols).join(""),
    );
    if (!fitsTier(candidate, tier)) continue;
    const result = analyze(parseBoard(candidate), t.maxSolutions, 250_000);
    if (result && meetsFloor(result, tier)) return candidate;
  }
  // Seeds are independently certified by the test suite, including the floor.
  return [...seed];
}
