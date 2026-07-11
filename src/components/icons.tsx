/**
 * Seymour's custom icon set — flat, rounded, two-to-three tone illustrations in
 * the app palette (terracotta / olive / charcoal / cream), used everywhere an
 * emoji used to be. All are 24×24 and sized by the caller via className.
 */
import type { SVGProps, FC } from 'react';
import type { MealType } from '@/lib/types';

export type IconComponent = FC<SVGProps<SVGSVGElement>>;

// Palette (kept local so icons render identically in light and dark mode).
const T = '#E07A5F'; // terracotta
const TD = '#C96547'; // terracotta dark
const O = '#81B29A'; // olive
const OD = '#6A9A83'; // olive dark
const C = '#2D2D2A'; // charcoal
const K = '#FAF7F2'; // cream
const M = '#5C2622'; // dark maw (matches the header/app-icon mascot's mouth)

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden focusable="false" {...props}>
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- nav ------ */

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill={O} />
      <path d="M12 3.2 2.6 10.8a1 1 0 0 0 1.26 1.55L12 5.6l8.14 6.75a1 1 0 0 0 1.26-1.55z" fill={T} />
      <rect x="10" y="14" width="4" height="7" rx="1" fill={C} />
    </Svg>
  );
}

export function RecipesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2z" fill={OD} />
      <path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z" fill={O} />
      <path d="M13 3h5a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2h-5zM11 3H6a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h5z" fill={K} />
      <path d="M12 8v9" stroke={T} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 6.5c0-1 1-1.5 2.2-1.5" stroke={T} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function PlanIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill={K} />
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5V9h-17z" fill={T} />
      <rect x="7" y="3" width="2" height="4" rx="1" fill={C} />
      <rect x="15" y="3" width="2" height="4" rx="1" fill={C} />
      <circle cx="8.5" cy="13" r="1.4" fill={O} />
      <circle cx="12" cy="13" r="1.4" fill={OD} />
      <circle cx="15.5" cy="13" r="1.4" fill={O} />
      <circle cx="8.5" cy="16.6" r="1.4" fill={OD} />
      <circle cx="12" cy="16.6" r="1.4" fill={O} />
    </Svg>
  );
}

export function ShoppingIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5h1.6a1 1 0 0 1 .98.8L7 8h11.8a1 1 0 0 1 .97 1.25l-1.4 5.3a1.5 1.5 0 0 1-1.45 1.12H9.2a1.5 1.5 0 0 1-1.47-1.2L6 5.9" fill="none" stroke={C} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 9.2h10.8l-1.3 5a1 1 0 0 1-.97.75H9.1a1 1 0 0 1-.98-.8z" fill={O} />
      <circle cx="9.5" cy="19" r="1.6" fill={T} />
      <circle cx="16" cy="19" r="1.6" fill={T} />
    </Svg>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path
        d="M12 2.6l1.5 1.6 2.1-.6.7 2.1 2.1.7-.6 2.1L20.9 12l-1.6 1.5.6 2.1-2.1.7-.7 2.1-2.1-.6L12 21.4l-1.5-1.6-2.1.6-.7-2.1-2.1-.7.6-2.1L3.1 12l1.6-1.5-.6-2.1 2.1-.7.7-2.1 2.1.6z"
        fill={O}
      />
      <circle cx="12" cy="12" r="3.6" fill={K} />
      <circle cx="12" cy="12" r="1.7" fill={T} />
    </Svg>
  );
}

/* -------------------------------------------------------------- meals ------ */

export function BreakfastIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 15a5 5 0 1 1 1.5-9.8A4.5 4.5 0 0 1 16 6a4 4 0 0 1 1.4 7.7A4 4 0 0 1 13 17H9a4 4 0 0 1-2-2z" fill={K} stroke={OD} strokeWidth=".9" />
      <circle cx="11" cy="11" r="3.2" fill={T} />
      <circle cx="11" cy="11" r="1.4" fill={TD} />
    </Svg>
  );
}

export function LunchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9.5 12 5l8 4.5-8 3z" fill={TD} />
      <path d="M5 12.2l7 2.6 7-2.6v1.3a2 2 0 0 1-1.3 1.9l-5.7 2.1-5.7-2.1A2 2 0 0 1 5 13.5z" fill={T} />
      <path d="M6 11l3 1 3-1.2 3 1.2 3-1" stroke={O} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function DinnerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {/* fork + knife */}
      <path d="M4 4v3.6a1.4 1.4 0 0 0 2.8 0V4M5.4 8.5V20" stroke={C} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M19.4 4c-1.5 1.2-1.5 5.4 0 6.6M19.4 10.6V20" stroke={C} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* plate + food */}
      <circle cx="12" cy="12.5" r="6.2" fill={K} stroke={O} strokeWidth="1.3" />
      <path d="M9 13.2c0-1.7 1.3-2.8 3-2.8s3 1.1 3 2.8z" fill={T} />
      <circle cx="12" cy="10.6" r="1.1" fill={OD} />
    </Svg>
  );
}

export function SnackIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 7c-1-1.6-3-2.2-4.6-1.2C5.4 7 5 9.6 6 12.4 6.8 14.7 8.6 18 11 18c.6 0 .8-.3 1-.3s.4.3 1 .3c2.4 0 4.2-3.3 5-5.6 1-2.8.6-5.4-1.4-6.6C15 4.8 13 5.4 12 7z" fill={T} />
      <path d="M12 7c.2-1.6 1-2.7 2.4-3.2" stroke={OD} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M12.3 6.6c.9-.2 1.8-1 2.1-2.1-1 .1-1.8.9-2.1 2.1z" fill={O} />
    </Svg>
  );
}

/* --------------------------------------------------------- categories ------ */

export function ProduceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21c-3-1-5-4-5-8 2 0 4 .8 5 2.4C13 13.8 15 13 17 13c0 4-2 7-5 8z" fill={O} />
      <path d="M12 20c0-4 0-8 0-11" stroke={OD} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 9c-.6-2.2-2.4-3.6-4.6-3.6.2 2.2 2 3.9 4.6 3.9zM12 8.4c.5-1.9 2-3.1 3.9-3.1-.2 1.9-1.7 3.3-3.9 3.4z" fill={OD} />
    </Svg>
  );
}

export function MeatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8.5 6C12 6 19 7 19 12.5S13 20 9.5 20 4 17 4 14c0-1.4.8-2.3.8-3.3C4.8 8.4 6 6 8.5 6z" fill={T} />
      <path d="M8 7.4C10.8 7.4 17 8 17 12.5s-4.8 6-7.6 6" fill="none" stroke={TD} strokeWidth="1.2" opacity=".7" />
      <circle cx="7" cy="13" r="1.5" fill={K} />
      <circle cx="6.2" cy="10.5" r="1" fill={K} />
    </Svg>
  );
}

export function DairyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 8h8v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" fill={K} stroke={OD} strokeWidth=".8" />
      <path d="M8 8 9.5 4h5L16 8z" fill={O} />
      <path d="M8 12h8v3H8z" fill={O} opacity=".9" />
      <path d="M10.5 4h3v4h-3z" fill={OD} />
    </Svg>
  );
}

export function BakeryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 13c0-2.8 3.6-5 8-5s8 2.2 8 5c0 1.2-1 2-2.4 2H6.4C5 15 4 14.2 4 13z" fill={T} />
      <path d="M6 15h12l-1 3.6a1.5 1.5 0 0 1-1.45 1.1H8.45A1.5 1.5 0 0 1 7 18.6z" fill={TD} />
      <path d="M9 11.5l1.2-2M12 11l1.2-2M15 11.5l1.2-2" stroke={K} strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function FrozenIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path
        d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"
        stroke={O}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 6.5 10.4 5M12 6.5 13.6 5M12 17.5 10.4 19M12 17.5 13.6 19M6 9.3 4.6 8.6 4.8 10.4M18 9.3l1.4-.7-.2 1.8M6 14.7l-1.4.7.2-1.8M18 14.7l1.4.7-.2-1.8" stroke={OD} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function PantryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="7.5" width="11" height="13" rx="2.5" fill={O} />
      <rect x="6.5" y="10.5" width="11" height="6.5" rx="0.5" fill={K} />
      <rect x="7.5" y="4" width="9" height="4" rx="1.5" fill={TD} />
      <rect x="9.5" y="12" width="5" height="3.2" rx="1" fill={T} />
    </Svg>
  );
}

export function SpicesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 9h9v9a3 3 0 0 1-3 3h-3a3 3 0 0 1-3-3z" fill={K} stroke={OD} strokeWidth=".8" />
      <path d="M7.5 9 8 5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5L16.5 9z" fill={T} />
      <circle cx="10.5" cy="6" r=".7" fill={K} />
      <circle cx="13.5" cy="6" r=".7" fill={K} />
      <circle cx="12" cy="6.4" r=".7" fill={K} />
      <path d="M10 13h4M10.5 16h3" stroke={O} strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function BasketIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 9h14l-1.1 9.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8z" fill={O} />
      <path d="M8.5 9 11 4M15.5 9 13 4" stroke={TD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 9h16" stroke={C} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12.5v4M14 12.5v4" stroke={OD} strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------ actions ------ */

export function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15.5 5.5 18.5 8.5 9 18l-3.6.6L6 15z" fill={T} />
      <path d="M14.2 6.8 17.2 9.8" stroke={K} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M15.5 5.5 17 4a1.4 1.4 0 0 1 2 2l-1.5 1.5z" fill={OD} />
      <path d="M6 15l-.6 3.6L9 18z" fill={C} />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 7.5h12l-1 11.2a2 2 0 0 1-2 1.8H9a2 2 0 0 1-2-1.8z" fill={O} />
      <path d="M4.5 7.5h15" stroke={C} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 7.5V6a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 6v1.5" fill="none" stroke={C} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke={K} strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function ShuffleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 7.5h3.2c1.2 0 2.3.6 3 1.6l4.6 6.3c.7 1 1.8 1.6 3 1.6h2.2" fill="none" stroke={T} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 16.5h3.2c1.2 0 2.3-.6 3-1.6l4.6-6.3c.7-1 1.8-1.6 3-1.6h2.2" fill="none" stroke={O} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m17.5 5 2.7 2.5-2.7 2.5M17.5 14l2.7 2.5-2.7 2.5" fill="none" stroke={T} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ArchiveIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="5.5" width="16" height="4.5" rx="1.2" fill={TD} />
      <path d="M5 10h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill={T} />
      <path d="M10 13.5h4" stroke={K} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function InboxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 13 6.8 6.4A2 2 0 0 1 8.7 5h6.6a2 2 0 0 1 1.9 1.4L19.5 13v4a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" fill={O} />
      <path d="M4.5 13H9a1 1 0 0 1 1 1 2 2 0 0 0 4 0 1 1 0 0 1 1-1h4.5" fill={OD} />
      <path d="M12 6.5v4m0 0-1.6-1.6M12 10.5l1.6-1.6" stroke={T} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DiceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" fill={T} />
      <circle cx="8.5" cy="8.5" r="1.5" fill={K} />
      <circle cx="15.5" cy="8.5" r="1.5" fill={K} />
      <circle cx="12" cy="12" r="1.5" fill={K} />
      <circle cx="8.5" cy="15.5" r="1.5" fill={K} />
      <circle cx="15.5" cy="15.5" r="1.5" fill={K} />
    </Svg>
  );
}

export function InstallIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="3" width="11" height="18" rx="2.5" fill={O} />
      <rect x="8" y="5.5" width="8" height="11" rx="1" fill={K} />
      <circle cx="12" cy="18.7" r="1" fill={K} />
      <path d="M12 7.5v5m0 0-1.8-1.8M12 12.5l1.8-1.8" stroke={T} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function GridIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.8" fill={O} />
      <rect x="13" y="4" width="7" height="7" rx="1.8" fill={T} />
      <rect x="4" y="13" width="7" height="7" rx="1.8" fill={T} />
      <rect x="13" y="13" width="7" height="7" rx="1.8" fill={O} />
    </Svg>
  );
}

export function ListIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="7" r="1.6" fill={T} />
      <circle cx="6" cy="12" r="1.6" fill={O} />
      <circle cx="6" cy="17" r="1.6" fill={T} />
      <path d="M10.5 7h9M10.5 12h9M10.5 17h9" stroke={C} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------- theme ------- */

export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4.2" fill={T} />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" stroke={TD} strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" fill={O} />
      <circle cx="15" cy="7" r="1" fill={K} />
      <circle cx="18" cy="10.5" r=".7" fill={K} />
    </Svg>
  );
}

export function SystemIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="11" rx="2" fill={O} />
      <rect x="5.5" y="7" width="13" height="7" rx="1" fill={K} />
      <path d="M9 19h6M12 16v3" stroke={C} strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

/* --------------------------------------------------------- decorative ------ */

export function BowlIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" fill={O} />
      <path d="M3.5 11h17" stroke={OD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 8c-.6-1.4.2-2.6 1-3.2M12 7.5c-.7-1.6.2-3 1-3.6M16 8c-.6-1.4.2-2.6 1-3.2" stroke={T} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function PlateIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {/* fork + knife framing an empty plate */}
      <path d="M3.5 4v3.4a1.3 1.3 0 0 0 2.6 0V4M4.8 8.2V20" stroke={OD} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M20 4c-1.4 1.2-1.4 5 0 6.2M20 10.2V20" stroke={OD} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="12" r="7" fill={K} stroke={T} strokeWidth="1.4" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke={O} strokeWidth="1.3" />
    </Svg>
  );
}

/** Seymour's mascot wearing a chef hat — the friendly empty-state illustration. */
export function ChefPlantIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {/* Head assembly shifted up so a longer neck fits underneath without
          crowding the pot — was sitting almost directly on it. */}
      <g transform="translate(0,-1.1)">
        {/* hat */}
        <path d="M8 5.2a2.6 2.6 0 0 1 4.9-.6 2.4 2.4 0 0 1 3.2 3.2c.4.7.3 1.7-.4 2.3H8.3c-.7-.6-.8-1.6-.4-2.3A2.6 2.6 0 0 1 8 5.2z" fill={K} stroke={O} strokeWidth=".8" />
        <rect x="8.4" y="9.6" width="7.2" height="2.2" rx=".6" fill={K} stroke={O} strokeWidth=".7" />
        {/* jaws — same wide-mouth silhouette and dark maw as the Logo mascot */}
        <path d="M6.2 14a5.8 4.6 0 0 1 11.6 0z" fill={O} />
        <path d="M6.2 14a5.8 3.2 0 0 0 11.6 0z" fill={OD} />
        <path d="M7.1 14h9.8l-1 1.4c-2.6 1.1-5.2 1.1-7.8 0z" fill={M} />
        {/* teeth: 4 even segments spanning the full 7.1–16.9 mouth width so
            the zigzag closes on a flat top edge — the old path ended on a
            "valley" point, so its closing line cut across diagonally and
            made the last tooth look like a lopsided wedge. */}
        <path d="M7.1 14l1.23 1.1 1.22-1.1 1.23 1.1 1.22-1.1 1.23 1.1 1.22-1.1 1.23 1.1 1.22-1.1z" fill={K} />
        <circle cx="9.5" cy="12.4" r=".85" fill={C} />
        <circle cx="14.5" cy="12.4" r=".85" fill={C} />
      </g>
      {/* stem + leaves — bridges head to pot so it reads as a plant, like the Logo */}
      <path d="M12 16.3c-.5.9-.6 1.6-.3 2.2" stroke={OD} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M11.6 17.9c-1.6-.1-2.6-.8-3-2 1.7-.1 2.7.7 3 2z" fill={O} />
      <path d="M12.4 18.1c1.6-.3 2.4-1.2 2.4-2.5-1.5.2-2.2 1.1-2.4 2.5z" fill={O} />
      {/* pot */}
      <path d="M9 19h6l-.7 2.2a1 1 0 0 1-1 .8h-2.6a1 1 0 0 1-1-.8z" fill={T} />
      <rect x="8.3" y="18" width="7.4" height="1.8" rx=".7" fill={TD} />
    </Svg>
  );
}

export function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5z" fill={T} />
      <path d="M18.5 13c.3 1.6.8 2.1 2.4 2.4-1.6.3-2.1.8-2.4 2.4-.3-1.6-.8-2.1-2.4-2.4 1.6-.3 2.1-.8 2.4-2.4z" fill={O} />
    </Svg>
  );
}

/** Meal-type → icon, for plan tiles and the dashboard "today" strip. */
export const MEAL_TYPE_ICON: Record<MealType, IconComponent> = {
  breakfast: BreakfastIcon,
  lunch: LunchIcon,
  dinner: DinnerIcon,
  snack: SnackIcon,
};
