/**
 * AI Provider Abstraction Layer — Type Definitions
 *
 * All AI calls in Operia go through this interface. No pipeline logic has
 * knowledge of which concrete AI provider is active (AR-05).
 *
 * Specification: Section 6.2
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIPrompt {
  system: string;
  messages: AIMessage[];
  max_tokens?: number;
  temperature?: number;
  /** Controls whether the AI must respond with valid JSON or free text */
  response_format?: 'text' | 'json';
}

export interface AIResponse {
  content: string;
  provider: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  called_at: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  complete(prompt: AIPrompt): Promise<AIResponse>;
}
