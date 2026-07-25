/**
 * Seymour's mascot: a man-eating plant (Venus flytrap) in a moss pot.
 * Inline SVG so it inherits crisp rendering at any size and needs no network.
 */
export default function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Seymour">
      {/* stem */}
      <path
        d="M262 400c-10-52 6-92 22-140"
        stroke="#3F7A66"
        strokeWidth={26}
        fill="none"
        strokeLinecap="round"
      />
      {/* leaves */}
      <path d="M256 348c-44-2-72-24-82-58 40-2 70 20 82 58z" fill="#5C9A80" />
      <path d="M272 366c42-12 60-38 60-72-36 8-56 34-60 72z" fill="#5C9A80" />
      {/* head: open flytrap jaws.
          The two halves are grouped so they can be closed independently — see
          the `.sey-chomp` rules in globals.css. Everything above the mouth
          line lives in the upper group (eyes included, or they'd float free of
          a closing head) and everything below it in the lower. Paint order is
          unchanged: upper jaw, lower jaw, maw, teeth. */}
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
      {/* pot */}
      <path d="M188 400h136l-14 66a16 16 0 0 1-16 13h-76a16 16 0 0 1-16-13z" fill="#C05F42" />
      <rect x="174" y="380" width="164" height="32" rx="12" fill="#A34630" />
    </svg>
  );
}
