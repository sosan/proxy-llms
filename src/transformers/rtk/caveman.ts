// Caveman injector: appends a caveman-style instruction into the system message
// of the final request body, just before it is dispatched to the provider executor.
// Dispatches by format so it works for both translated and native-passthrough flows.

import { CAVEMAN_PROMPTS } from "./cavemanPrompts";
import type { CavemanLevel } from "../../interfaces/rtk";

const SEP = "\n\n";

/** Content part used in OpenAI/Claude message arrays */
interface TextPart {
  type: string;
  text?: string;
}

/** OpenAI/Claude message shape */
interface Message {
  role?: string;
  content?: string | TextPart[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Generic request body with common fields across formats */
interface RequestBody {
  instructions?: string;
  messages?: Message[];
  input?: Message[];
  system?: string | Array<{ type: string; text: string; cache_control?: unknown }>;
  systemInstruction?: SystemInstruction;
  system_instruction?: SystemInstruction;
  request?: { systemInstruction?: SystemInstruction };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface SystemInstruction {
  parts?: Array<{ text?: string }>;
}

export function injectCaveman(body: RequestBody, format: string, level: CavemanLevel): void {
  const prompt = CAVEMAN_PROMPTS[level];
  if (!body || !prompt) return;

  switch (format) {
    case "claude":
    case "anthropic":
      injectClaudeSystem(body, prompt);
      return;
    case "gemini":
    case "google":
    case "gemini-cli":
    case "vertex":
    case "antigravity":
      // Antigravity wraps Gemini shape in body.request → injectGeminiSystem handles it
      injectGeminiSystem(body, prompt);
      return;
    default:
      // OpenAI and OpenAI-shaped formats (responses/codex/cursor/kiro/ollama)
      injectMessagesSystem(body, prompt);
  }
}

// OpenAI-shaped: messages[] (chat) or input[] (responses) or instructions (responses string)
function injectMessagesSystem(body: RequestBody, prompt: string): void {
  // OpenAI Responses API: top-level string field
  if (typeof body.instructions === "string") {
    body.instructions = body.instructions
      ? `${body.instructions}${SEP}${prompt}`
      : prompt;
    return;
  }

  const arr = Array.isArray(body.messages) ? body.messages
    : Array.isArray(body.input) ? body.input
      : null;
  if (!arr) return;

  const idx = arr.findIndex((m) => m && (m.role === "system" || m.role === "developer"));
  if (idx >= 0) {
    appendToOpenAIMessage(arr[idx], prompt);
  } else {
    arr.unshift({ role: "system", content: prompt });
  }
}

function appendToOpenAIMessage(msg: Message, prompt: string): void {
  if (typeof msg.content === "string") {
    msg.content = `${msg.content}${SEP}${prompt}`;
  } else if (Array.isArray(msg.content)) {
    // Responses-style array of parts {type:"input_text"|"text", text}
    msg.content.push({ type: "input_text", text: prompt });
  } else {
    msg.content = prompt;
  }
}

// Claude shape: body.system as string | array of {type:"text", text}
// Insert before the last cache_control block to keep caveman inside the cached prefix.
function injectClaudeSystem(body: RequestBody, prompt: string): void {
  if (typeof body.system === "string" && body.system.length > 0) {
    body.system = `${body.system}${SEP}${prompt}`;
    return;
  }
  if (Array.isArray(body.system)) {
    const block: { type: string; text: string } = { type: "text", text: prompt };
    let lastCacheIdx = -1;
    for (let i = body.system.length - 1; i >= 0; i--) {
      if (body.system[i]?.cache_control) { lastCacheIdx = i; break; }
    }
    if (lastCacheIdx >= 0) {
      body.system.splice(lastCacheIdx, 0, block);
    } else {
      body.system.push(block);
    }
    return;
  }
  body.system = prompt;
}

// Gemini shape: body.system_instruction | body.systemInstruction | body.request.systemInstruction
// Each shape: { parts: [{ text }] }
function injectGeminiSystem(body: RequestBody, prompt: string): void {
  const target = body.request && typeof body.request === "object" ? body.request : body;
  const useSnake = Object.prototype.hasOwnProperty.call(target, "system_instruction");
  const key = useSnake ? "system_instruction" : "systemInstruction";
  const sys = target[key as keyof typeof target] as SystemInstruction | undefined;
  if (sys && Array.isArray(sys.parts)) {
    sys.parts.push({ text: prompt });
    return;
  }
  (target as Record<string, unknown>)[key] = { parts: [{ text: prompt }] };
}
