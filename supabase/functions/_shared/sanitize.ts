/**
 * Input Sanitization and Prompt Injection Mitigation
 *
 * All user-supplied content (documents, transcripts) must be wrapped in
 * structural XML tags before being passed to AI models. (Section 6.4)
 *
 * Prompt injection patterns are checked on all user-supplied content
 * before it enters the AI pipeline.
 */

/**
 * Patterns that commonly indicate prompt injection attempts.
 * Specification: Section 6.4
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore previous instructions/i,
  /ignore all previous/i,
  /system prompt/i,
  /you are now/i,
  /disregard the above/i,
  /disregard all previous/i,
  /act as/i,
  /new instructions/i,
  /forget your instructions/i,
  /override your/i,
  /jailbreak/i,
];

/**
 * Returns true if the text appears to contain a prompt injection attempt.
 */
export function containsInjectionAttempt(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Wraps document content chunks in XML tags to signal to the model that
 * this is data to be analyzed, not instructions to follow.
 * Specification: Section 6.4
 */
export function sanitizeDocumentContent(chunks: string[]): string {
  return chunks
    .map((chunk, i) => `<document_excerpt index="${i}">\n${chunk}\n</document_excerpt>`)
    .join('\n\n');
}

/**
 * Wraps transcript content in XML tags.
 * Specification: Section 6.4
 */
export function sanitizeTranscriptContent(transcript: string): string {
  return `<interview_transcript>\n${transcript}\n</interview_transcript>`;
}

/**
 * Validates a batch of document chunks for injection attempts.
 * Throws if any chunk contains suspicious content.
 */
export function validateDocumentChunks(chunks: string[]): void {
  for (let i = 0; i < chunks.length; i++) {
    if (containsInjectionAttempt(chunks[i])) {
      throw new Error(
        `Document chunk ${i} contains content that may be a prompt injection attempt. ` +
        `Please review the document content and remove any instruction-like text.`
      );
    }
  }
}

/**
 * Validates transcript content for injection attempts.
 */
export function validateTranscript(transcript: string): void {
  if (containsInjectionAttempt(transcript)) {
    throw new Error(
      'The transcript contains content that may be a prompt injection attempt. ' +
      'Please review and redact any instruction-like text before submitting.'
    );
  }
}

/**
 * Token estimation utility (rough approximation: 1 token ≈ 4 chars for English text).
 * Used for token budget management (Section 6.5).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Token budget constants per step (Section 6.5).
 */
export const TOKEN_BUDGETS = {
  hypothesis_generation: {
    max_context_tokens: 32_000,
    chunk_size_tokens: 4_000,
    overlap_tokens: 200,
    strategy: 'hierarchical_summary' as const,
  },
  gap_analysis: {
    max_context_tokens: 48_000,
    chunk_size_tokens: 6_000,
    overlap_tokens: 300,
    strategy: 'full_context' as const,
  },
} as const;

/**
 * Splits text into chunks of approximately `chunkSizeTokens` tokens with overlap.
 */
export function chunkText(
  text: string,
  chunkSizeTokens: number,
  overlapTokens: number
): string[] {
  const approxChunkSize = chunkSizeTokens * 4; // chars
  const overlapSize = overlapTokens * 4;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + approxChunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlapSize;
    if (start >= text.length) break;
  }

  return chunks;
}
