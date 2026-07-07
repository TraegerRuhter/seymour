/**
 * Seymour's mascot: a man-eating plant (Venus flytrap) in a terracotta pot.
 * Inline SVG so it inherits crisp rendering at any size and needs no network.
 */
export default function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Seymour">
      {/* stem */}
      <path
        d="M262 400c-10-52 6-92 22-140"
        stroke="#6A9A83"
        strokeWidth={26}
        fill="none"
        strokeLinecap="round"
      />
      {/* leaves */}
      <path d="M256 348c-44-2-72-24-82-58 40-2 70 20 82 58z" fill="#81B29A" />
      <path d="M272 366c42-12 60-38 60-72-36 8-56 34-60 72z" fill="#81B29A" />
      {/* head: open flytrap jaws */}
      <g transform="rotate(-16 292 176)">
        <path d="M180 176a112 92 0 0 1 224 0z" fill="#81B29A" />
        <path d="M192 176a100 62 0 0 0 200 0z" fill="#6A9A83" />
        <path d="M196 176h192l-16 24c-56 20-104 20-160 0z" fill="#5C2622" />
        <path
          d="M196 176l16 20 16-20 16 20 16-20 16 20 16-20 16 20 16-20 16 20 16-20 16 20 16-20z"
          fill="#FAF7F2"
        />
        <circle cx="250" cy="112" r="11" fill="#2D2D2A" />
        <circle cx="334" cy="112" r="11" fill="#2D2D2A" />
      </g>
      {/* pot */}
      <path d="M188 400h136l-14 66a16 16 0 0 1-16 13h-76a16 16 0 0 1-16-13z" fill="#E07A5F" />
      <rect x="174" y="380" width="164" height="32" rx="12" fill="#C96547" />
    </svg>
  );
}
