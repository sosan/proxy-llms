import type { FilterFn } from "../../interfaces/rtk";

// Port of apply_filter (rtk/src/cmds/system/pipe_cmd.rs) — catch_unwind equivalent
// On panic/error: passthrough raw output + warn to stderr
export function safeApply(fn: FilterFn, text: string): string {
  if (typeof fn !== "function") return text;
  try {
    const out = fn(text);
    if (typeof out !== "string") return text;
    return out;
  } catch (err: unknown) {
    // Rust: eprintln!("[rtk] warning: filter panicked — passing through raw output")
    const name = fn.filterName || fn.name || "anonymous";
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rtk] warning: filter '${name}' panicked — passing through raw output: ${message}`);
    return text;
  }
}
