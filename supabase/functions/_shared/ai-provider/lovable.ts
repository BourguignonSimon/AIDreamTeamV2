/**
 * Lovable AI Gateway Provider
 *
 * Primary AI provider for all Operia pipeline steps.
 * Uses the Lovable AI Gateway which proxies to Google Gemini Flash.
 * Specification: Section 6.2, AR-05
 */

import type { AIPrompt, AIProvider, AIResponse } from './types.ts';

export class LovableGatewayProvider implements AIProvider {
  readonly name = 'lovable_gateway';
  readonly model = 'google/gemini-2.0-flash';

  constructor(private readonly apiKey: string) {}

  async complete(prompt: AIPrompt): Promise<AIResponse> {
    const startTime = Date.now();
    const calledAt = new Date().toISOString();

    // Build messages array: system message first, then user messages
    const messages = [
      { role: 'system', content: prompt.system },
      ...prompt.messages,
    ];

    const requestBody = {
      model: this.model,
      messages,
      max_tokens: prompt.max_tokens ?? 4096,
      temperature: prompt.temperature ?? 0.3,
      ...(prompt.response_format === 'json' && {
        response_format: { type: 'json_object' },
      }),
    };

    const response = await fetch('https://api.lovable.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        // Opt out of model training per SEC-GDPR-03
        'X-No-Training': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lovable Gateway error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    return {
      content: data.choices[0].message.content,
      provider: this.name,
      model_id: data.model ?? this.model,
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      latency_ms: latencyMs,
      called_at: calledAt,
    };
  }
}
