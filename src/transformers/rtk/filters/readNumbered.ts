// Handles Cursor/Codex read_file output: "  1|content\n  2|content".
// Strategy mirrors Rust filter::smart_truncate (filter.rs): keep head+tail, drop middle.
import { SMART_TRUNCATE_MIN_LINES } from "../constants";
import { truncateHeadTail } from "./_truncate";

const LINE_RE = /^\s*\d+\|/;

export function readNumbered(input: string): string {
  const lines = input.split("\n");
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input;

  return truncateHeadTail(lines, {
    marker: "... +0 lines truncated (file continues)",
  }).join("\n");
}

(readNumbered as { filterName?: string }).filterName = "read-numbered";

// Exposed for autodetect
export const READ_NUMBERED_LINE_RE: RegExp = LINE_RE;
