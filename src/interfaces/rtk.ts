// Shared types for RTK filter system

/** A filter function that takes input text and returns compressed/transformed text.
 *  The optional `filterName` property is attached at module load time for diagnostics. */
export type FilterFn = ((input: string) => string) & { filterName?: string };

/** Caveman intensity levels. */
export type CavemanLevel = "lite" | "full" | "ultra";

/** Statistics collected during message compression. */
export interface CompressStats {
  bytesBefore: number;
  bytesAfter: number;
  hits: Array<{ shape: string; filter: string | undefined; saved: number }>;
}

/** Generic request body shape consumed by caveman / RTK index. */
export interface RequestBody {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Message shape present in OpenAI/Claude raw request bodies.
 *  Intentionally looser than ChatMessage (general.ts) because RTK
 *  operates on *raw* request bodies before any format translation.
 *  Fields like `type`, `output`, and the index signature are required
 *  for shapes like OpenAI Responses (function_call_output) and
 *  Kiro (conversationState) that do not fit the standard ChatMessage contract. */
export interface Message {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
  type?: string;
  output?: string | Array<{ type: string; text?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Block shape used inside Claude message content for tool_result entries. */
export interface Block {
  type: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
