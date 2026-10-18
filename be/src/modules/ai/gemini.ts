/** The only place that talks to Google Gemini. The API key never leaves the backend. */
import { GoogleGenAI } from '@google/genai';
import type { AiIntent } from '../../contracts';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { LLM_SCHEMA, SYSTEM_INSTRUCTION } from './interpret';

let client: GoogleGenAI | null = null;

export const geminiConfigured = () => Boolean(env.GEMINI_API_KEY);

/** Errors worth one more try on the backup model: overloaded (503), rate-limited (429), server errors, timeouts. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  const name = (err as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(err));
}

async function generate(model: string, message: string): Promise<unknown> {
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY! });
  const res = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseJsonSchema: LLM_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 2048,
      abortSignal: AbortSignal.timeout(12_000),
    },
  });
  const text = res.text;
  if (!text) throw new Error(`Gemini returned no text (${res.candidates?.[0]?.finishReason ?? 'unknown reason'})`);
  return JSON.parse(text);
}

/**
 * Ask Gemini to turn the request into our structured parameters (JSON that matches LLM_SCHEMA).
 * If the main model is busy (Google answers 503 "high demand" from time to time), the backup model gets
 * one try; if that fails too, the caller falls back to the local keyword parser.
 */
export async function askGemini(prompt: string, previous?: AiIntent | null): Promise<unknown> {
  // The user's text goes in as clearly delimited DATA, never mixed into our instructions.
  const message = previous
    ? `Current playlist parameters (JSON): ${JSON.stringify(previous)}\n\nThe listener wants to change the playlist like this:\n"""${prompt}"""\n\nReturn the complete updated parameters. Keep the title unless the change makes it wrong.`
    : `Listener request:\n"""${prompt}"""`;
  try {
    return await generate(env.GEMINI_MODEL, message);
  } catch (err) {
    const backup = env.GEMINI_FALLBACK_MODEL;
    if (!backup || backup === env.GEMINI_MODEL || !isTransient(err)) throw err;
    logger.warn({ err: String(err) }, `Gemini ${env.GEMINI_MODEL} unavailable → trying ${backup}`);
    return generate(backup, message);
  }
}
