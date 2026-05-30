import { FILTERS } from "./constants";
import { gitDiff } from "./filters/gitDiff";
import { gitStatus } from "./filters/gitStatus";
import { grep } from "./filters/grep";
import { find } from "./filters/find";
import { dedupLog } from "./filters/dedupLog";
import { ls } from "./filters/ls";
import { tree } from "./filters/tree";
import { smartTruncate } from "./filters/smartTruncate";
import { readNumbered } from "./filters/readNumbered";
import { searchList } from "./filters/searchList";
import type { FilterFn } from "../../interfaces/rtk";

const REGISTRY: Record<string, FilterFn> = {
  [FILTERS.GIT_DIFF]: gitDiff as FilterFn,
  [FILTERS.GIT_STATUS]: gitStatus as FilterFn,
  [FILTERS.GREP]: grep as FilterFn,
  [FILTERS.FIND]: find as FilterFn,
  [FILTERS.DEDUP_LOG]: dedupLog as FilterFn,
  [FILTERS.LS]: ls as FilterFn,
  [FILTERS.TREE]: tree as FilterFn,
  [FILTERS.SMART_TRUNCATE]: smartTruncate as FilterFn,
  [FILTERS.READ_NUMBERED]: readNumbered as FilterFn,
  [FILTERS.SEARCH_LIST]: searchList as FilterFn,
};

// Rust resolve_filter aliases (pipe_cmd.rs): grep|rg, find|fd
const ALIASES: Record<string, FilterFn> = {
  rg: grep as FilterFn,
  fd: find as FilterFn,
};

export function resolveFilter(name: string): FilterFn | null {
  return REGISTRY[name] || ALIASES[name] || null;
}

export function allFilters(): Record<string, FilterFn> {
  return REGISTRY;
}
