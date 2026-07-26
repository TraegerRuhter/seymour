import type { GrowthStage } from '@/lib/growth';

/**
 * Seymour's mascot: a man-eating plant (Venus flytrap) in a clay pot.
 * Inline SVG so it inherits crisp rendering at any size and needs no network.
 *
 * The plant grows with `stage` (see lib/growth.ts) — a seed in an empty pot at
 * 0, a plant with a second head by 4. The pot never changes size: it's the
 * fixed reference that makes the growth legible, and a pot that grew with him
 * would just read as the whole drawing zooming.
 *
 * `stage` defaults to 2, the shape the mascot had before any of this, so every
 * decorative use of the logo stays exactly as it was. Only the places that
 * deliberately opt in — the header, mainly — track how much you've cooked.
 */

/**
 * Where the stem ends and the head hangs from, per stage.
 *
 * The later stems are shorter than the growth curve wants them to be, because
 * the head scales about the tip: at stage 4 a taller stem pushed the top of
 * the trap past y=0 and the viewBox clipped it. Growth after stage 2 is
 * carried by the head and the leaves rather than by height.
 */
const STEM = {
  0: { path: 'M262 400c-2-16 0-26 2-36', tip: [266, 362] },
  1: { path: 'M262 400c-6-30 2-52 12-80', tip: [276, 316] },
  2: { path: 'M262 400c-10-52 6-92 22-140', tip: [284, 260] },
  3: { path: 'M262 400c-12-58 6-100 24-146', tip: [286, 254] },
  4: { path: 'M262 400c-14-62 6-106 26-152', tip: [288, 248] },
} as const satisfies Record<GrowthStage, { path: string; tip: readonly [number, number] }>;

/**
 * How big the trap is, per stage. Stage 0 has none at all.
 *
 * The top of the head sits at `tipY - 203.3 * scale` (measured, not derived —
 * the -16° rotation lifts one corner well above where the arc's own geometry
 * suggests). That leaves no room to both raise the stem and enlarge the head
 * much past stage 2 without the viewBox clipping the top of the trap, so the
 * later stages grow mostly outward: more leaves, and at stage 4 a second head.
 */
const HEAD_SCALE: Record<GrowthStage, number> = { 0: 0, 1: 0.55, 2: 1, 3: 1.09, 4: 1.18 };

/**
 * A second, smaller trap budding off a side stem. Stage 4 only — it's the
 * thing that makes "enormous" unmistakable, where another 8% of head would
 * just look like a rendering difference.
 */
const BUD = {
  stem: 'M264 380c-26-10-42-28-48-52',
  tip: [216, 322],
  scale: 0.42,
} as const;

/** Leaf pairs earned along the way, drawn low to high. */
const LEAVES: Record<GrowthStage, readonly string[]> = {
  // Two seed leaves, straight off the soil — the only thing a seed has.
  0: [
    'M258 372c-26-2-42-14-48-34 24-2 42 12 48 34z',
    'M270 374c25-4 38-20 38-42-22 6-34 22-38 42z',
  ],
  1: ['M256 366c-34-2-56-18-64-44 32-2 55 16 64 44z'],
  2: [
    'M256 348c-44-2-72-24-82-58 40-2 70 20 82 58z',
    'M272 366c42-12 60-38 60-72-36 8-56 34-60 72z',
  ],
  3: [
    'M256 348c-44-2-72-24-82-58 40-2 70 20 82 58z',
    'M272 366c42-12 60-38 60-72-36 8-56 34-60 72z',
    'M254 386c-38-2-62-20-70-50 34-2 60 20 70 50z',
  ],
  4: [
    'M256 348c-44-2-72-24-82-58 40-2 70 20 82 58z',
    'M272 366c42-12 60-38 60-72-36 8-56 34-60 72z',
    'M254 386c-38-2-62-20-70-50 34-2 60 20 70 50z',
    'M274 390c36-10 52-32 52-62-31 7-48 29-52 62z',
  ],
};

/** The natural attachment point of the head, in the drawing's own coordinates. */
const ANCHOR = [284, 260] as const;

/**
 * Move the head to a stem tip and scale it about that same point, so it stays
 * attached rather than drifting off the neck as it grows.
 */
function placeHead([tx, ty]: readonly [number, number], scale: number): string {
  const [ax, ay] = ANCHOR;
  return `translate(${tx - ax} ${ty - ay}) translate(${ax} ${ay}) scale(${scale}) translate(${-ax} ${-ay})`;
}

/**
 * Open flytrap jaws.
 *
 * The two halves are grouped so they can be closed independently — see the
 * `.sey-chomp` rules in globals.css. Everything above the mouth line lives in
 * the upper group (eyes included, or they'd float free of a closing head) and
 * everything below it in the lower. Paint order matters: upper jaw, lower jaw,
 * maw, teeth.
 */
function Head() {
  return (
    <g transform="rotate(-16 292 176)">
      <g className="sey-jaw sey-jaw--upper">
        <path d="M180 176a112 92 0 0 1 224 0z" fill="#5C9A80" />
        <circle cx="250" cy="112" r="11" fill="#171C18" />
        <circle cx="334" cy="112" r="11" fill="#171C18" />
      </g>
      <g className="sey-jaw sey-jaw--lower">
        <path d="M192 176a100 62 0 0 0 200 0z" fill="#3F7A66" />
        <path d="M196 176h192l-16 24c-56 20-104 20-160 0z" fill="#4A211D" />
        <path
          d="M196 176l16 20 16-20 16 20 16-20 16 20 16-20 16 20 16-20 16 20 16-20 16 20 16-20z"
          fill="#F2F0E8"
        />
      </g>
    </g>
  );
}

export default function Logo({
  className = 'h-8 w-8',
  stage = 2,
}: {
  className?: string;
  stage?: GrowthStage;
}) {
  const stem = STEM[stage];

  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Seymour">
      <path d={stem.path} stroke="#3F7A66" strokeWidth={26} fill="none" strokeLinecap="round" />

      {LEAVES[stage].map((d, i) => (
        <path key={i} d={d} fill="#5C9A80" />
      ))}

      {stage === 4 && (
        <>
          <path d={BUD.stem} stroke="#3F7A66" strokeWidth={16} fill="none" strokeLinecap="round" />
          <g transform={placeHead(BUD.tip, BUD.scale)}>
            <Head />
          </g>
        </>
      )}

      {HEAD_SCALE[stage] > 0 && (
        <g transform={placeHead(STEM[stage].tip, HEAD_SCALE[stage])}>
          <Head />
        </g>
      )}

      {/* pot — the fixed reference the growth is measured against */}
      <path d="M188 400h136l-14 66a16 16 0 0 1-16 13h-76a16 16 0 0 1-16-13z" fill="#C05F42" />
      <rect x="174" y="380" width="164" height="32" rx="12" fill="#A34630" />
    </svg>
  );
}
