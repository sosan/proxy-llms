// =============================================================================
// ENVIRONMENT BINDINGS
// =============================================================================

/**
 * ENVIRONMENT BINDINGS
 */
export interface Env {
  NVIDIA_API_KEY: string
  NVIDIA_BASE_URL: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  LMSTUDIO_BASE_URL?: string
  LLAMACPP_BASE_URL?: string
  OLLAMA_BASE_URL?: string
  ANTHROPIC_OPUS_MODEL?: string
  ANTHROPIC_SONNET_MODEL?: string
  ANTHROPIC_HAIKU_MODEL?: string
  ANTHROPIC_DEFAULT_MODEL?: string
  DEBUG?: string
  LOG_PAYLOAD?: string
  LOG_METRICS?: string
  RTK_ENABLED?: string
  CAVEMAN_ENABLED?: string
  CAVEMAN_LEVEL?: string
  PROCESSOR: DurableObjectNamespace
  ANALYTICS: AnalyticsEngineDataset
  ANALYTICS_ACCOUNT_ID?: string
  ANALYTICS_API_TOKEN?: string
}


/**
 * SYSTEM CONTRACTS & INTERFACES
 */

// Define ApiResponse and ProcessState more precisely if not globally available or for clarity
export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
  timestamp: string
}

// Define the structure for content parts within a message
export interface MessageContentPart {
  type: 'text' | 'image' | 'image_url'; // Add other types as needed
  text?: string;
  image_url?: { url: string }; // Example for image
}

// Define the structure for chat messages
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContentPart[];
}

// Structure for the generic payload sent by the client
export interface GenericPayload {
  provider?: string; // Explicitly specify the provider
  model?: string;    // The model alias or full ID to use
  messages?: ChatMessage[]; // Messages array for chat completions
  content?: string | MessageContentPart[];  // Fallback for single string content (e.g., some older OpenAI/completion APIs)
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stream_options?: unknown; // Keep flexible for different provider stream options
  // Fields specific to certain models or providers that might not fit the common structure
  // For example, chat_template_kwargs is specific to some models like GLM
  [key: string]: unknown; // Allow for any additional provider-specific fields
}

export interface ProcessState {
  status: string
  data?: GenericPayload // Store the original payload
  result?: unknown
  error?: string
  startTime?: number
  completedAt?: number
  failedAt?: number
  progress: number
}

export interface ProviderConfig {
  endpoint: string;
  alterEndpoint?: string; // Alternative endpoint for Anthropic-compatible path (e.g., '/messages' on NIM)
  models: Record<string, string>; // alias: 'provider/model-id'
  format: 'anthropic' | 'openai' | 'google';
  supportsToolCalling?: boolean; // Whether models in this config support tool calling
}
