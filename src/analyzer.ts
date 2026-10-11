import { CHANNELS, TIERS } from "./constants";
import type { BoardState } from "./game";

export interface Route {
  readonly cells: readonly number[];
  readonly edges: bigint;
  readonly blocks: bigint;
  readonly uses: readonly number[];
}
export interface Analysis {
  readonly routes: readonly (readonly Route[])[];
  readonly solutions: readonly (readonly Route[])[];
  readonly determinedShare: number;
  readonly branching: number;
  readonly sharedCrystals: number;
}
interface Link {
  to: number;
  edge: number;
  cross: number;
}
/** Exhaustive certification. A work limit rejects expensive candidates, never accepts an estimate. */
export function analyze(
  board: BoardState,
  maxSolutions = TIERS[TIERS.length - 1].maxSolutions,
  workLimit = 2_000_000,
): Analysis | null {
  const ns = board.nodes,
    n = ns.length;
  const channels = CHANNELS.filter((c) => ns.some((v) => v.channel === c));
  const links: Link[][] = ns.map(() => []);
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      if (
        Math.max(
          Math.abs(ns[a].col - ns[b].col),
          Math.abs(ns[a].row - ns[b].row),
        ) === 1
      )
        edges.push([a, b]);
  edges.forEach(([a, b], edge) => {
    const na = ns[a],
      nb = ns[b];
    const cross =
      na.col !== nb.col && na.row !== nb.row
        ? edges.findIndex(
            ([c, d]) =>
              c !== a &&
              c !== b &&
              d !== a &&
              d !== b &&
              ns[c].col !== ns[d].col &&
              ns[c].row !== ns[d].row &&
              ns[c].col + ns[d].col === na.col + nb.col &&
              ns[c].row + ns[d].row === na.row + nb.row,
          )
        : -1;
    links[a].push({ to: b, edge, cross });
    links[b].push({ to: a, edge, cross });
  });
  links.forEach((list) => list.sort((a, b) => a.to - b.to));
  const bits = edges.map((_, i) => 1n << BigInt(i));
  const crystalIds = ns
    .map((v, i) => (v.kind === "crystal" ? i : -1))
    .filter((i) => i >= 0);
  const visits = new Uint8Array(n),
    used = new Uint8Array(edges.length);
  let work = 0,
    aborted = false;
  const routes: Route[][] = [];
  for (const channel of channels) {
    const ends = ns
      .map((v, i) => (v.kind === "emitter" && v.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    if (ends.length !== 2) return null;
    const lensCount = ns.filter(
      (v) => v.kind === "lens" && v.channel === channel,
    ).length;
    const found = new Map<string, Route>();
    const path = [ends[0]],
      trail: number[] = [];
    visits[ends[0]] = 1;
    const dfs = (at: number, remaining: number): void => {
      if (++work > workLimit) {
        aborted = true;
        return;
      }
      if (at === ends[1]) {
        if (remaining) return;
        const sorted = [...trail].sort((a, b) => a - b),
          key = sorted.join(",");
        if (!found.has(key)) {
          let mask = 0n,
            blocks = 0n;
          for (const e of trail) {
            mask |= bits[e];
            blocks |= bits[e];
            const [a] = edges[e];
            const cross = links[a].find((l) => l.edge === e)!.cross;
            if (cross >= 0) blocks |= bits[cross];
          }
          found.set(key, {
            cells: [...path],
            edges: mask,
            blocks,
            uses: crystalIds.map((i) => visits[i]),
          });
        }
        return;
      }
      for (const l of links[at]) {
        const v = ns[l.to];
        if (
          (v.channel !== null && v.channel !== channel) ||
          used[l.edge] ||
          (l.cross >= 0 && used[l.cross]) ||
          visits[l.to] >= (v.kind === "crystal" ? v.charges! : 1)
        )
          continue;
        if (l.to === ends[1] && remaining) continue;
        visits[l.to]++;
        used[l.edge] = 1;
        path.push(l.to);
        trail.push(l.edge);
        dfs(l.to, remaining - (v.kind === "lens" ? 1 : 0));
        trail.pop();
        path.pop();
        used[l.edge] = 0;
        visits[l.to]--;
        if (aborted) return;
      }
    };
    dfs(ends[0], lensCount);
    visits[ends[0]] = 0;
    if (aborted || !found.size) return null;
    routes.push([...found.values()]);
  }
  const solutions: Route[][] = [],
    combo: Route[] = [],
    charges = crystalIds.map((i) => ns[i].charges!),
    totals = charges.map(() => 0);
  const combine = (ch: number, blocked: bigint): void => {
    if (++work > workLimit) {
      aborted = true;
      return;
    }
    if (ch === routes.length) {
      if (totals.every((v, i) => v === charges[i])) solutions.push([...combo]);
      return;
    }
    for (const r of routes[ch]) {
      if (
        (r.edges & blocked) !== 0n ||
        r.uses.some((v, i) => v + totals[i] > charges[i])
      )
        continue;
      r.uses.forEach((v, i) => (totals[i] += v));
      combo.push(r);
      combine(ch + 1, blocked | r.blocks);
      combo.pop();
      r.uses.forEach((v, i) => (totals[i] -= v));
      if (solutions.length > maxSolutions || aborted) return;
    }
  };
  combine(0, 0n);
  if (aborted || !solutions.length || solutions.length > maxSolutions)
    return null;
  const intersection = solutions[0].map((r) => r.edges);
  let choices = 0,
    steps = 0,
    sharedCrystals = 0;
  for (const solution of solutions) {
    visits.fill(0);
    used.fill(0);
    sharedCrystals = Math.max(
      sharedCrystals,
      crystalIds.filter(
        (_, i) => solution.filter((r) => r.uses[i] > 0).length > 1,
      ).length,
    );
    for (let ch = 0; ch < solution.length; ch++) {
      const r = solution[ch],
        channel = channels[ch];
      intersection[ch] &= r.edges;
      visits[r.cells[0]]++;
      for (let j = 1; j < r.cells.length; j++) {
        const at = r.cells[j - 1];
        for (const l of links[at]) {
          const v = ns[l.to];
          if (
            (v.channel === null || v.channel === channel) &&
            !used[l.edge] &&
            (l.cross < 0 || !used[l.cross]) &&
            visits[l.to] < (v.kind === "crystal" ? v.charges! : 1)
          )
            choices++;
        }
        const link = links[at].find((l) => l.to === r.cells[j])!;
        used[link.edge] = 1;
        visits[link.to]++;
        steps++;
      }
    }
  }
  const popcount = (v: bigint) => v.toString(2).replace(/0/g, "").length;
  const length = solutions[0].reduce((s, r) => s + r.cells.length - 1, 0);
  return {
    routes,
    solutions,
    determinedShare: intersection.reduce((s, v) => s + popcount(v), 0) / length,
    branching: choices / steps,
    sharedCrystals,
  };
}
export function meetsFloor(analysis: Analysis, tier: number): boolean {
  const t = TIERS[tier - 1];
  return (
    analysis.routes.every((r) => r.length >= t.minRoutes) &&
    analysis.solutions.length >= t.minSolutions &&
    analysis.solutions.length <= t.maxSolutions &&
    analysis.determinedShare <= t.maxDeterminedShare &&
    analysis.branching >= t.minBranching &&
    analysis.sharedCrystals >= t.minSharedCrystals
  );
}
