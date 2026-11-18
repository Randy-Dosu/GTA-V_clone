/**
 * GroqClient — ultra-fast LLM inference for in-game AI dialogue via the
 * Groq API (OpenAI-compatible chat completions endpoint).
 *
 * API key resolution priority:
 *   1. Key pasted in-game (Settings → Groq API Key) — persisted in localStorage
 *   2. `VITE_GROQ_API_KEY` build-time environment variable (`.env` file)
 *
 * The key is NEVER committed to the repository (`.env` is gitignored) —
 * create your own `.env` or paste the key in Settings. All requests carry a
 * timeout and every failure resolves to `null` so gameplay falls back to
 * the canned offline lines without ever blocking the frame loop.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_TIMEOUT_MS = 9000;
const KEY_STORAGE_NAME = 'groq-api-key';

export interface GroqPrompt {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export type GroqStatus = 'active' | 'no-key' | 'error';

export class GroqClient {
  public requestCount = 0;
  public lastError: string | null = null;

  /** Read the locally pasted key (in-game Settings storage) */
  public static getStoredKey(): string {
    try {
      return localStorage.getItem(KEY_STORAGE_NAME) ?? '';
    } catch {
      return '';
    }
  }

  /** Persist an in-game-provided key; empty string clears it */
  public static setStoredKey(key: string): void {
    try {
      const trimmed = key.trim();
      if (trimmed) localStorage.setItem(KEY_STORAGE_NAME, trimmed);
      else localStorage.removeItem(KEY_STORAGE_NAME);
    } catch {
      // Storage unavailable (private mode) — key applies to this session only
    }
  }

  /** Build-time `.env` key (`VITE_GROQ_API_KEY`), when present */
  private envKey(): string {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> }).env;
      return (env?.VITE_GROQ_API_KEY ?? '').trim();
    } catch {
      return '';
    }
  }

  /** The key this client will authenticate with (localStorage → .env) */
  public resolveKey(): string {
    return GroqClient.getStoredKey() || this.envKey();
  }

  public get hasKey(): boolean {
    return this.resolveKey().length > 0;
  }

  public get status(): GroqStatus {
    if (!this.hasKey) return 'no-key';
    return this.lastError ? 'error' : 'active';
  }

  /**
   * Single-shot chat completion. Resolves `null` on any failure (offline,
   * bad key, rate limit, timeout) — callers apply their own fallback text.
   */
  public async complete(prompt: GroqPrompt): Promise<string | null> {
    const key = this.resolveKey();
    if (!key) {
      this.lastError = null;
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), prompt.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.requestCount++;

    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: prompt.maxTokens ?? 90,
          temperature: prompt.temperature ?? 0.9,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      });
      if (!res.ok) {
        this.lastError = `Groq HTTP ${res.status}`;
        return null;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        this.lastError = 'Groq empty response';
        return null;
      }
      this.lastError = null;
      return text.replace(/^["“”']+|["“”']+$/g, '');
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Groq request failed';
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
