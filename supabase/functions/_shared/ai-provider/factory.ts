/**
 * AI Provider Factory and Fallback Orchestration
 *
 * Creates provider instances and implements automatic failover.
 * The primary provider is always tried first; on any error, the fallback
 * is transparently used. Pipeline logic is completely agnostic to which
 * provider serves the request. (AR-05)
 *
 * Specification: Section 6.2
 */

import type { AIPrompt, AIProvider, AIResponse } from './types.ts';
import { GoogleGeminiProvider } from './google.ts';
import { AnthropicProvider } from './anthropic.ts';

export function createAIProvider(): AIProvider {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set');
  }
  return new GoogleGeminiProvider(apiKey);
}

export function createFallbackProvider(): AIProvider {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new AnthropicProvider(apiKey);
}

/**
 * Calls the primary AI provider with automatic fallback to Anthropic.
 *
 * Both provider failures are logged. If both fail, a combined error is thrown.
 * The calling Edge Function is responsible for retry logic at the execution level.
 */
export async function callAIWithFallback(prompt: AIPrompt): Promise<AIResponse> {
  const primary = createAIProvider();

  try {
    const response = await primary.complete(prompt);
    console.log(`[AI] Primary provider (${primary.name}) succeeded. Tokens: ${response.prompt_tokens}+${response.completion_tokens}. Latency: ${response.latency_ms}ms`);
    return response;
  } catch (primaryError) {
    console.error(`[AI] Primary provider (${primary.name}) failed:`, primaryError);

    let fallback: AIProvider;
    try {
      fallback = createFallbackProvider();
    } catch (configError) {
      console.error('[AI] Fallback provider not configured:', configError);
      throw primaryError; // Re-throw primary error if fallback isn't configured
    }

    try {
      const response = await fallback.complete(prompt);
      console.warn(`[AI] Serving via fallback provider: ${fallback.name}. Tokens: ${response.prompt_tokens}+${response.completion_tokens}`);
      return response;
    } catch (fallbackError) {
      console.error(`[AI] Fallback provider (${fallback.name}) also failed:`, fallbackError);
      throw new Error(
        `All AI providers unavailable.\n` +
        `Primary (${primary.name}): ${primaryError instanceof Error ? primaryError.message : String(primaryError)}\n` +
        `Fallback (${fallback.name}): ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      );
    }
  }
}
