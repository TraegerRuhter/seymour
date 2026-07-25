import Logo from './Logo';

/**
 * One remark from Seymour, on the dashboard.
 *
 * Presentational on purpose — the decision about *whether* there is anything
 * worth saying lives in lib/seymour-says.ts, so this never has to guess.
 * Deliberately quiet: the mascot at reading size next to a single line, not a
 * banner or a card. It's a comment, not an announcement.
 */
export default function SeymourSays({ text }: { text: string }) {
  return (
    <div className="mt-1.5 flex items-start gap-2.5">
      <Logo className="mt-0.5 h-6 w-6 shrink-0" />
      <p className="italic text-charcoal/70">{text}</p>
    </div>
  );
}
