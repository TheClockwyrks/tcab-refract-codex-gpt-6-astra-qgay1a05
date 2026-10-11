import type { RenderApi } from "@clockwyrks/simple-2d";
import type { RefractState, Channel, NodeState } from "./game";
import * as C from "./constants";
import { targets, menuItems } from "./simulation";
import { cellX, cellY, complete, spent, same } from "./rules";

const INK = "#e4eee9";
const QUIET = "#81959f";
const LINE = "#243440";
export const HUES: Record<Channel, string> = {
  triangle: "#7af0cd",
  square: "#ffbc70",
  diamond: "#b5a0ff",
};
type Pen = CanvasRenderingContext2D;
function text(
  ctx: Pen,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  weight = 400,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = `${weight} ${size}px ${size <= 14 ? "monospace" : '"Trebuchet MS", sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function line(
  ctx: Pen,
  points: readonly (readonly [number, number])[],
  color: string,
  width = 1,
): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function circle(
  ctx: Pen,
  x: number,
  y: number,
  radius: number,
  color: string,
  fill = false,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  if (fill) ctx.fill();
  else ctx.stroke();
}
function shape(
  ctx: Pen,
  channel: Channel,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  if (channel === "triangle") {
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.866, y + radius * 0.5);
    ctx.lineTo(x - radius * 0.866, y + radius * 0.5);
  } else if (channel === "square") {
    const a = radius / Math.SQRT2;
    ctx.rect(x - a, y - a, a * 2, a * 2);
  } else {
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius, y);
  }
  ctx.closePath();
}
function node(
  ctx: Pen,
  n: NodeState,
  x: number,
  y: number,
  used = 0,
  active = false,
): void {
  ctx.save();
  circle(ctx, x, y, 37, active ? "#54766d" : "#1d2d38");
  circle(ctx, x, y, 33, "#0b151e", true);
  if (n.kind === "crystal") {
    const r = C.NODE_R - 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#182c38";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = used === n.charges ? "#e0edea" : "#8299ab";
    ctx.stroke();
    text(ctx, `${used}/${n.charges}`, x, y - 2, 15, INK, 600, "center");
    for (let i = 0; i < n.charges!; i++)
      circle(
        ctx,
        x + (i - (n.charges! - 1) / 2) * 9,
        y + 14,
        2.2,
        i < used ? "#c9f4e8" : "#4a606e",
        true,
      );
  } else {
    const hue = HUES[n.channel!];
    if (active) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = hue;
    }
    shape(ctx, n.channel!, x, y, C.NODE_R - 9);
    ctx.strokeStyle = hue;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = n.kind === "emitter" ? "#0b151e" : hue;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (n.kind === "emitter") circle(ctx, x, y, 3, hue, true);
    else {
      shape(ctx, n.channel!, x, y, 9);
      ctx.strokeStyle = "#173e3b";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
function background(ctx: Pen): void {
  const grad = ctx.createRadialGradient(720, 330, 40, 640, 360, 800);
  grad.addColorStop(0, "#12212b");
  grad.addColorStop(1, "#080f16");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#23343e";
  for (let x = 32; x < C.STAGE_W; x += 32)
    for (let y = 24; y < C.STAGE_H; y += 32) ctx.fillRect(x, y, 1, 1);
  line(
    ctx,
    [
      [48, 100],
      [1232, 100],
    ],
    LINE,
  );
  line(
    ctx,
    [
      [48, 676],
      [1232, 676],
    ],
    "#1a2a35",
  );
  text(ctx, "R /", 48, 54, 24, HUES.triangle, 600);
  text(ctx, "REFRACT", 105, 54, 17, INK, 600);
  text(
    ctx,
    "OPTICAL STUDIES     /     VOL. 01",
    1232,
    54,
    12,
    QUIET,
    400,
    "right",
  );
}
function button(
  ctx: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  selected: boolean,
  detail?: string,
): void {
  ctx.fillStyle = selected ? "#19392f" : "#101d26";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? "#7af0cd" : "#2a3b47";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (selected) {
    ctx.fillStyle = HUES.triangle;
    ctx.fillRect(x, y, 3, h);
  }
  text(
    ctx,
    label,
    x + 24,
    y + (detail ? 25 : h / 2),
    18,
    selected ? HUES.triangle : INK,
    600,
  );
  if (detail) text(ctx, detail, x + 24, y + 49, 12, QUIET);
  text(
    ctx,
    "↗",
    x + w - 26,
    y + h / 2,
    22,
    selected ? HUES.triangle : QUIET,
    400,
    "center",
  );
}
function footer(ctx: Pen, s: RefractState): void {
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1232,
    696,
    11,
    QUIET,
    400,
    "right",
  );
  if (s.screen === "title")
    text(
      ctx,
      "POINTER TO TRACE  /  ARROWS + ENTER TO CHOOSE",
      100,
      664,
      12,
      QUIET,
    );
  else if (s.screen === "select")
    text(
      ctx,
      "CHOOSE A STUDY    /    ARROWS + ENTER",
      640,
      655,
      12,
      QUIET,
      400,
      "center",
    );
  else if (s.screen === "playing")
    text(
      ctx,
      "HOLD TO TRACE  ·  RELEASE TO KEEP  ·  RETRACE TO UNDO",
      640,
      689,
      12,
      QUIET,
      400,
      "center",
    );
  for (const t of targets(s).filter(
    (t) => t.id === "back" || t.id === "clear",
  )) {
    button(
      ctx,
      t.x,
      t.y,
      t.w,
      t.h,
      t.id === "back" ? C.BACK_LABEL : C.CLEAR_LABEL,
      false,
    );
    if (t.id === "clear")
      text(ctx, "R", t.x - 20, t.y + t.h / 2, 13, QUIET, 400, "center");
  }
}
function title(ctx: Pen, s: RefractState): void {
  text(ctx, "A PUZZLE OF PATHS & POSSIBILITY", 100, 165, 12, HUES.triangle);
  text(ctx, C.TITLE_TEXT, 92, 237, 86, INK, 500);
  text(ctx, C.TAGLINE_TEXT, 100, 304, 17, QUIET, 400);
  const details = [
    `${C.CAMPAIGN_LENGTH} hand-built studies. One illuminating journey.`,
    "An endless sequence. A rising challenge.",
    "Discover the rules of the optical bench.",
  ];
  targets(s).forEach((t, i) =>
    button(
      ctx,
      t.x,
      t.y,
      t.w,
      t.h,
      C.TITLE_ITEMS[i],
      s.menuIndex === i,
      details[i],
    ),
  );
  // A diagram of a refracting prism: all artwork is native canvas geometry.
  ctx.save();
  const centerX = 866,
    centerY = 348;
  circle(ctx, centerX, centerY, 210, "#243742");
  circle(ctx, centerX, centerY, 185, "#1d303a");
  for (let i = 0; i < 60; i++) {
    const a = (i * Math.PI) / 30;
    const r = i % 5 === 0 ? 219 : 214;
    line(
      ctx,
      [
        [centerX + Math.cos(a) * 210, centerY + Math.sin(a) * 210],
        [centerX + Math.cos(a) * r, centerY + Math.sin(a) * r],
      ],
      "#3b505a",
    );
  }
  ctx.fillStyle = "#162c32";
  ctx.beginPath();
  ctx.moveTo(866, 162);
  ctx.lineTo(1030, 448);
  ctx.lineTo(702, 448);
  ctx.closePath();
  ctx.fill();
  line(
    ctx,
    [
      [866, 162],
      [1030, 448],
      [702, 448],
      [866, 162],
    ],
    "#668c87",
    1.5,
  );
  line(
    ctx,
    [
      [866, 162],
      [866, 352],
      [702, 448],
    ],
    "#345c5c",
  );
  line(
    ctx,
    [
      [866, 352],
      [1030, 448],
    ],
    "#345c5c",
  );
  const rays: [Channel, [number, number][]][] = [
    [
      "triangle",
      [
        [568, 413],
        [777, 413],
        [866, 258],
        [1058, 450],
        [1176, 450],
      ],
    ],
    [
      "square",
      [
        [576, 429],
        [810, 429],
        [866, 331],
        [1040, 505],
        [1176, 505],
      ],
    ],
    [
      "diamond",
      [
        [584, 445],
        [844, 445],
        [866, 407],
        [1016, 557],
        [1176, 557],
      ],
    ],
  ];
  rays.forEach(([ch, points]) => {
    ctx.shadowColor = HUES[ch];
    ctx.shadowBlur = 16;
    line(ctx, points, HUES[ch], 2);
    ctx.shadowBlur = 0;
    shape(
      ctx,
      ch,
      points[points.length - 1][0],
      points[points.length - 1][1],
      9,
    );
    ctx.fillStyle = HUES[ch];
    ctx.fill();
  });
  text(ctx, "01", 660, 166, 12, QUIET);
  text(ctx, "INCIDENT LIGHT", 570, 476, 11, QUIET);
  text(ctx, "THREE CHANNELS", 1040, 591, 11, QUIET);
  ctx.restore();
}
function select(ctx: Pen, s: RefractState): void {
  text(ctx, "THE CAMPAIGN", 100, 145, 33, INK, 500);
  text(
    ctx,
    `${s.solvedBoards.length} / ${C.CAMPAIGN_LENGTH} STUDIES COMPLETE`,
    1180,
    148,
    13,
    HUES.triangle,
    400,
    "right",
  );
  const subtitles = [
    "First light",
    "Shared paths",
    "Full spectrum",
    "The summit",
  ];
  C.SET_LABELS.forEach((label, i) => {
    text(ctx, label, 100, 225 + i * 96, 15, INK, 600);
    text(ctx, subtitles[i], 100, 249 + i * 96, 12, QUIET);
  });
  targets(s)
    .filter((t) => t.id.startsWith("board"))
    .forEach((t, i) => {
      const locked = i >= s.unlockedCount,
        done = s.solvedBoards.includes(i),
        highlight = i === s.selectIndex;
      ctx.fillStyle = highlight ? "#203c35" : locked ? "#0d1821" : "#13262c";
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = highlight ? HUES.triangle : done ? "#57716e" : LINE;
      ctx.lineWidth = highlight ? 2 : 1;
      ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
      text(
        ctx,
        String(i + 1).padStart(2, "0"),
        t.x + 18,
        t.y + 29,
        25,
        locked ? "#71808b" : INK,
        500,
      );
      text(
        ctx,
        done ? "✓ SOLVED" : locked ? "— LOCKED" : "START ↗",
        t.x + 18,
        t.y + 59,
        10,
        highlight ? HUES.triangle : QUIET,
      );
    });
}
function howto(ctx: Pen): void {
  text(ctx, "FOLLOW THE LIGHT", 100, 154, 38, INK, 500);
  text(ctx, "Simple pieces. Intertwined possibilities.", 100, 196, 17, QUIET);
  const panels = [
    {
      x: 100,
      title: "01 / CONNECT",
      lines: [
        "Press an outlined emitter and drag through",
        "neighboring nodes. Link its two emitters,",
        "visiting every filled lens of that channel.",
        "Release to keep your beam.",
      ],
      channel: "triangle" as Channel,
    },
    {
      x: 500,
      title: "02 / REFRACT",
      lines: [
        "Move in any of eight directions, diagonals",
        "included. Never jump a gap or touch another",
        "channel’s nodes. Each segment is used once;",
        "opposing diagonals cannot cross.",
      ],
      channel: "square" as Channel,
    },
    {
      x: 900,
      title: "03 / COMPLETE",
      lines: [
        "Any beam can pass through a crystal.",
        "Spend every charge exactly, entering and",
        "leaving each time. Complete all channels",
        "and all crystals to solve the board.",
      ],
      channel: "diamond" as Channel,
    },
  ];
  panels.forEach((p) => {
    const x = p.x;
    line(
      ctx,
      [
        [x + 25, 277],
        [x + 110, 277],
        [x + 195, 277],
      ],
      HUES[p.channel],
      2,
    );
    node(
      ctx,
      { col: 0, row: 0, kind: "emitter", channel: p.channel, charges: null },
      x + 25,
      277,
    );
    node(
      ctx,
      {
        col: 0,
        row: 0,
        kind: p.channel === "diamond" ? "crystal" : "lens",
        channel: p.channel === "diamond" ? null : p.channel,
        charges: p.channel === "diamond" ? 2 : null,
      },
      x + 110,
      277,
      p.channel === "diamond" ? 1 : 0,
    );
    node(
      ctx,
      { col: 0, row: 0, kind: "emitter", channel: p.channel, charges: null },
      x + 195,
      277,
    );
    text(ctx, p.title, x, 350, 16, HUES[p.channel], 600);
    p.lines.forEach((l, i) => text(ctx, l, x, 390 + i * 27, 15, INK));
  });
  text(ctx, "CHANGE YOUR MIND", 100, 535, 12, HUES.triangle);
  text(
    ctx,
    "Trace backward to undo. Grab an end to continue, or a used node to shorten. An invalid move simply stays put.",
    100,
    564,
    16,
    INK,
  );
  text(
    ctx,
    "R  CLEAR BOARD       ESC  BACK       M  MUTE",
    640,
    657,
    13,
    QUIET,
    400,
    "center",
  );
}
function board(ctx: Pen, s: RefractState): void {
  const left = cellX(0, s.board.cols) - 48,
    top = cellY(0, s.board.rows) - 48;
  const width = s.board.cols * C.CELL_PITCH,
    height = s.board.rows * C.CELL_PITCH;
  ctx.fillStyle = "#0b161f99";
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = "#233b46";
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, width, height);
  for (const [x, y, dx, dy] of [
    [left, top, 1, 1],
    [left + width, top, -1, 1],
    [left, top + height, 1, -1],
    [left + width, top + height, -1, -1],
  ])
    line(
      ctx,
      [
        [x, y + dy * 15],
        [x, y],
        [x + dx * 15, y],
      ],
      "#60827f",
      1.5,
    );
  for (let c = 0; c < s.board.cols; c++)
    for (let r = 0; r < s.board.rows; r++) {
      const x = cellX(c, s.board.cols),
        y = cellY(r, s.board.rows);
      line(
        ctx,
        [
          [x - 4, y],
          [x + 4, y],
        ],
        "#30414b",
      );
      line(
        ctx,
        [
          [x, y - 4],
          [x, y + 4],
        ],
        "#30414b",
      );
    }
  for (const b of s.beams) {
    if (b.cells.length < 2) continue;
    const points = b.cells.map(
      (c) =>
        [cellX(c.col, s.board.cols), cellY(c.row, s.board.rows)] as [
          number,
          number,
        ],
    );
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = HUES[b.channel];
    ctx.shadowBlur = 18;
    line(ctx, points, HUES[b.channel] + "25", 13);
    line(ctx, points, HUES[b.channel], 3);
    ctx.shadowBlur = 0;
    line(ctx, points, "#effff5a0", 1);
    ctx.restore();
  }
  for (const n of s.board.nodes)
    node(
      ctx,
      n,
      cellX(n.col, s.board.cols),
      cellY(n.row, s.board.rows),
      spent(s.beams, n),
      s.beams.some((b) => b.cells.some((c) => same(c, n))),
    );
  if (s.tracing) {
    const b = s.beams.find((b) => b.channel === s.tracing!.channel)!;
    const c = b.cells[b.cells.length - 1];
    circle(
      ctx,
      cellX(c.col, s.board.cols),
      cellY(c.row, s.board.rows),
      40 + Math.sin(s.simTime * 4) * 2,
      HUES[b.channel],
    );
  }
}
function playing(ctx: Pen, s: RefractState): void {
  const isCampaign = s.mode === "campaign";
  text(
    ctx,
    isCampaign
      ? `CAMPAIGN / ${C.SET_LABELS[Math.floor(s.boardIndex / 6)]}`
      : "CASCADE / ENDLESS STUDIES",
    48,
    139,
    12,
    QUIET,
  );
  text(
    ctx,
    isCampaign
      ? `Study ${String(s.boardIndex + 1).padStart(2, "0")}`
      : `Study ${String(s.solvedCount + (s.screen === "playing" ? 1 : 0)).padStart(2, "0")}`,
    48,
    182,
    32,
    INK,
    500,
  );
  if (isCampaign)
    text(
      ctx,
      `${s.solvedBoards.length} / ${C.CAMPAIGN_LENGTH} COMPLETE`,
      48,
      223,
      12,
      QUIET,
    );
  else {
    text(
      ctx,
      `${C.HUD_SOLVED_LABEL}  ${s.solvedCount}`,
      48,
      225,
      14,
      HUES.triangle,
    );
    text(ctx, `${C.HUD_TIER_LABEL}  ${s.tier}`, 48, 252, 14, QUIET);
  }
  text(ctx, "CHANNELS", 48, 324, 12, QUIET);
  s.beams.forEach((b, i) => {
    const y = 371 + i * 64;
    shape(ctx, b.channel, 63, y, 12);
    ctx.strokeStyle = HUES[b.channel];
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, b.channel.toUpperCase(), 90, y - 7, 12, HUES[b.channel]);
    text(
      ctx,
      complete(s.board, b) ? "COMPLETE ✓" : "OPEN PATH",
      90,
      y + 14,
      11,
      QUIET,
    );
  });
  board(ctx, s);
  if (s.screen === "playing") {
    text(ctx, "THE OBJECTIVE", 1030, 173, 12, HUES.triangle);
    text(ctx, "Connect each pair.", 1030, 210, 17, INK);
    text(ctx, "Thread every lens.", 1030, 238, 17, INK);
    text(ctx, "Spend every charge.", 1030, 266, 17, INK);
    line(
      ctx,
      [
        [1030, 302],
        [1198, 302],
      ],
      LINE,
    );
    const crystals = s.board.nodes.filter((n) => n.kind === "crystal");
    text(
      ctx,
      crystals.length ? "CRYSTAL CHARGES" : "FIRST PRINCIPLE",
      1030,
      332,
      11,
      QUIET,
    );
    if (crystals.length) {
      const total = crystals.reduce((v, n) => v + n.charges!, 0),
        used = crystals.reduce((v, n) => v + spent(s.beams, n), 0);
      text(ctx, `${used} / ${total}`, 1030, 372, 30, INK, 500);
      text(ctx, "Shared by all channels", 1030, 413, 13, QUIET);
    } else {
      text(ctx, "One continuous path.", 1030, 371, 15, INK);
      text(ctx, "Many ways to see it.", 1030, 398, 15, QUIET);
    }
  } else {
    text(
      ctx,
      s.screen === "complete"
        ? `ALL ${C.CAMPAIGN_LENGTH} SOLVED`
        : C.SOLVED_TITLE_TEXT,
      984,
      190,
      24,
      HUES.triangle,
      500,
    );
    text(
      ctx,
      s.screen === "complete"
        ? "The spectrum is yours."
        : isCampaign
          ? `Study ${s.boardIndex + 1} complete`
          : `${s.solvedCount} boards illuminated`,
      984,
      235,
      16,
      INK,
    );
    const items = menuItems(s);
    targets(s).forEach((t, i) =>
      button(ctx, t.x, t.y, t.w, t.h, items[i], s.menuIndex === i),
    );
  }
}
export function render(s: RefractState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  background(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "select") select(ctx, s);
  else if (s.screen === "howto") howto(ctx);
  else playing(ctx, s);
  footer(ctx, s);
  ctx.restore();
}
