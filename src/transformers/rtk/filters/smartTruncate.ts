// Port concept of filter::smart_truncate (rtk/src/core/filter.rs).
// Keep HEAD + TAIL lines, replace middle with "... +N lines truncated".
import { SMART_TRUNCATE_MIN_LINES } from "../constants";
import { truncateHeadTail } from "./_truncate";

export function smartTruncate(input: string): string {
  const lines = input.split("\n");
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input;

  return truncateHeadTail(lines).join("\n");
}

(smartTruncate as { filterName?: string }).filterName = "smart-truncate";
