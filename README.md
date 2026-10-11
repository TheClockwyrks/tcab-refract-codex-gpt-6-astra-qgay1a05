# Refract

**Draw the light.** Refract is a browser puzzle on a dark optical bench. Trace a beam between each channel’s outlined emitters, thread every filled lens, and spend every crystal charge. Mint triangles, amber squares, and violet diamonds identify the three channels by both color and shape.

Campaign contains 24 hand-built studies across four sets. Cascade generates an endless sequence of puzzles across five difficulty tiers, advancing every five solves. There is no timer or move limit. Progress lasts for the current session.

## Run

```sh
npm ci
npm run dev
```

Open the address Vite prints. No backend, credentials, or runtime network resources are required.

## Build

```sh
npm run build
```

Serve `dist/` with any static HTTP server. `npm run preview` serves the production build locally.

## Controls

- **Mouse, pen, or touch:** press an outlined emitter and drag between neighboring nodes, including diagonals. Release to keep the path.
- **Edit a beam:** grab either end to resume; grab an internal node to shorten. Drag backward along the path to undo one segment at a time.
- **R / CLEAR:** empty the current board.
- **Arrows or WASD:** select a menu item or campaign board. **Enter / Space:** confirm. **Escape / BACK:** return.
- **M:** toggle sound. **Backtick:** toggle the engine’s diagnostic overlay.

A beam cannot touch another channel’s nodes, reuse a segment, or cross an opposing diagonal. Crystals can be shared between channels; each entry spends one charge, and every entry must also have an exit. Invalid moves leave the trace live so you can try another direction.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests run the real Simple 2D engine over an in-process canvas and controlled clocks, exercise pointer and keyboard input, and certify the Cascade generator. Cascade samples dimensions independently, perturbs node layouts and charges, and exhaustively checks candidates against all five difficulty measures. Bounded rejection sampling falls back to a certified seed of the sampled dimensions if its search budget runs out.

The code separates immutable screen/input transitions (`simulation.ts`), beam rules (`rules.ts`), exhaustive analysis and generation, and canvas presentation (`render.ts`). The game’s debug API is returned through `engine.debug`; it is not installed on the page. Engine and game state can be inspected or posed by an embedding test harness through `engine.state` and `engine.apply`.

## Showcase

`showcase/` includes a player-facing description, screenshots of the running game, and a gzipped replay captured with Simple 2D’s draw-command recorder. All artwork and sound are generated in code.
