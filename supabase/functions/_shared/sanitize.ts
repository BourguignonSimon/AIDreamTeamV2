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
 *
 * SEC-03: All patterns use \b word-boundary anchors to avoid false positives on
 * common business language (e.g. "we need to act as a bridge between...").
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+)?previous\s+instructions\b/i,
  /\bignore\s+all\s+previous\b/i,
  /\bsystem\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\bdisregard\s+(?:the\s+above|all\s+previous)\b/i,
  /\bact\s+as\s+(?:an?\s+)?(?:AI|assistant|GPT|Claude|LLM)\b/i,
  /\bnew\s+instructions\b/i,
  /\bforget\s+your\s+instructions\b/i,
  /\boverride\s+your\b/i,
  /\bjailbreak\b/i,
  /\bDAN\s+mode\b/i,
];

/**
 * Maximum allowed character length for a single document chunk.
 * Guards against runaway payloads that could exhaust memory (SEC-03).
 */
const MAX_CHUNK_CHARS = 800_000;

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
 * Validates a batch of document chunks for injection attempts and size.
 * Throws if any chunk contains suspicious content or exceeds the max size guard (SEC-03).
 */
export function validateDocumentChunks(chunks: string[]): void {
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length > MAX_CHUNK_CHARS) {
      throw new Error(
        `Document chunk ${i} exceeds the maximum allowed size (${MAX_CHUNK_CHARS} chars). ` +
        `Please split the document into smaller parts.`
      );
    }
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
