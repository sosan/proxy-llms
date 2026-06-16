import { SMART_TRUNCATE_HEAD, SMART_TRUNCATE_TAIL } from "../constants";

/** Truncate a list of lines by keeping the first `head` lines and the last `tail`
 *  lines, replacing the middle with a single marker line. Used by both
 *  smartTruncate and readNumbered. */
export function truncateHeadTail(
  lines: string[],
  options: { head?: number; tail?: number; marker?: string } = {}
): string[] {
  const headCount = options.head ?? SMART_TRUNCATE_HEAD;
  const tailCount = options.tail ?? SMART_TRUNCATE_TAIL;
  const head = lines.slice(0, headCount);
  const tail = lines.slice(lines.length - tailCount);
  const cut = lines.length - head.length - tail.length;
  return [...head, options.marker ?? `... +${cut} lines truncated`, ...tail];
}
