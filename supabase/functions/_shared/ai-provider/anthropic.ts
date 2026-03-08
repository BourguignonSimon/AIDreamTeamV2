/**
 * Anthropic Claude Fallback Provider
 *
 * Automatic failover provider when the primary AI provider is unavailable.
 * Uses claude-haiku-4-5 for cost efficiency on fallback. (AR-05)
 * Specification: Section 6.2
 */

import type { AIPrompt, AIProvider, AIResponse } from './types.ts';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model = 'claude-haiku-4-5-20251001';

  constructor(private readonly apiKey: string) {}

  async complete(prompt: AIPrompt): Promise<AIResponse> {
    const startTime = Date.now();
    const calledAt = new Date().toISOString();

    const requestBody = {
      model: this.model,
      max_tokens: prompt.max_tokens ?? 4096,
      temperature: prompt.temperature ?? 0.3,
      system: prompt.system,
      messages: prompt.messages,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        // Opt out of model training per SEC-GDPR-03
        'anthropic-beta': 'no-training',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const rawContent = data.content[0]?.text ?? '';

    return {
      content: rawContent,
      provider: this.name,
      model_id: data.model ?? this.model,
      prompt_tokens: data.usage?.input_tokens ?? 0,
      completion_tokens: data.usage?.output_tokens ?? 0,
      latency_ms: latencyMs,
      called_at: calledAt,
    };
  }
}
