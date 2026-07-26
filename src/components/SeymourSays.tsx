/**
 * One remark from Seymour, on the dashboard.
 *
 * Presentational on purpose — the decision about *whether* there is anything
 * worth saying lives in lib/seymour-says.ts, so this never has to guess.
 * Deliberately quiet: one italic line where the recipe count would otherwise
 * be. It's a comment, not an announcement.
 *
 * No mascot. There used to be one here, a few inches below the identical
 * mascot in the site header, which made a page that already said "Seymour"
 * twice in text say it twice in pictures as well. The header carries the
 * character; this carries what he has to say. The italics are enough to mark
 * the line as his — they're the only italics on the page.
 */
export default function SeymourSays({ text }: { text: string }) {
  return <p className="mt-1 italic text-charcoal/70">{text}</p>;
}
