import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GroqClient } from '../src/ai/GroqClient';
import { AiDialogue, stripHtml } from '../src/gameplay/AiDialogue';

/**
 * Groq AI suite — the api.groq.com endpoint is unreachable in CI, so the
 * client is exercised against mocked fetch responses (success, HTTP error,
 * network failure) and its offline fallbacks are verified directly.
 */
describe('Groq AI dialogue (street talk & mission briefings)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    GroqClient.setStoredKey('');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    GroqClient.setStoredKey('');
  });

  const mockGroq = (
    handler: (url: string, init: RequestInit | undefined) => Promise<unknown> | unknown
  ): void => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return await handler(url, init);
    }) as typeof fetch;
  };

  it('resolves the API key with in-game storage priority over the build-time env', () => {
    const client = new GroqClient();
    // Build-time .env key (loaded by Vite/Vitest) guarantees a key is present
    expect(client.hasKey).toBe(true);
    const envKey = client.resolveKey();
    expect(envKey).toMatch(/^gsk_/);

    // A locally pasted key always overrides the build-time env key
    GroqClient.setStoredKey('gsk_local_key');
    expect(client.resolveKey()).toBe('gsk_local_key');

    GroqClient.setStoredKey('');
    expect(client.resolveKey()).toBe(envKey);
  });

  it('completes chat prompts with Groq and surfaces the model reply', async () => {
    let capturedAuth = '';
    let capturedModel = '';
    mockGroq((url, init) => {
      expect(url).toContain('https://api.groq.com/openai/v1/chat/completions');
      capturedAuth = (init!.headers as Record<string, string>).Authorization;
      const body = JSON.parse(init!.body as string);
      capturedModel = body.model;
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '  "Keep walking, homie." ' } }] }),
      };
    });

    const client = new GroqClient();
    const text = await client.complete({ system: 'sys', user: 'usr', maxTokens: 64 });
    expect(text).toBe('Keep walking, homie.');
    expect(capturedAuth).toBe(`Bearer ${client.resolveKey()}`);
    expect(capturedModel).toBe('llama-3.1-8b-instant');
    expect(client.lastError).toBeNull();
  });

  it('returns null on HTTP errors and network failures with lastError populated', async () => {
    mockGroq(() => ({ ok: false, status: 429, json: async () => ({}) }));
    const http = new GroqClient();
    expect(await http.complete({ system: 's', user: 'u' })).toBeNull();
    expect(http.lastError).toBe('Groq HTTP 429');

    mockGroq(() => {
      throw new Error('offline');
    });
    const offline = new GroqClient();
    expect(await offline.complete({ system: 's', user: 'u' })).toBeNull();
    expect(offline.lastError).toBe('offline');
    expect(offline.status).toBe('error');
  });

  it('generates AI street talk with location context and falls back offline', async () => {
    // Success path: line comes from Groq
    mockGroq(() => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Nice weather for a heist, aint it?' } }] }),
    }));
    const ai = new AiDialogue(new GroqClient());
    const good = await ai.getPedLine({
      name: 'Marcus',
      x: -250,
      z: 40,
      hour: 19,
      wantedLevel: 2,
    });
    expect(good.source).toBe('groq');
    expect(good.text).toContain('heist');

    // Offline path: canned Los Santos fallback line keeps the city talking
    mockGroq(() => {
      throw new Error('offline');
    });
    const offlineAi = new AiDialogue(new GroqClient());
    const bad = await offlineAi.getPedLine({
      name: 'Denise',
      x: 120,
      z: 8,
      hour: 8,
      wantedLevel: 0,
    });
    expect(bad.source).toBe('fallback');
    expect(bad.text.length).toBeGreaterThan(15);

    // District context is resolved from world data in the user prompt
    mockGroq((url, init) => {
      const body = JSON.parse(init!.body as string);
      expect(body.messages[1].content).toContain('Marcus');
      expect(body.messages[1].content).toContain('wanted stars');
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Sup.' } }] }),
      };
    });
    const ctxAi = new AiDialogue(new GroqClient());
    await ctxAi.getPedLine({ name: 'Marcus', x: -36, z: 18, hour: 12, wantedLevel: 3 });
  });

  it('briefs missions in character, caches per mission, and falls back offline', async () => {
    let calls = 0;
    mockGroq(() => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Get the car and bring it back shiny, kid.' } }],
        }),
      };
    });
    const ai = new AiDialogue(new GroqClient());
    const first = await ai.getMissionBriefing('simeon_repo', {
      giver: 'Simeon Yetarian',
      title: 'Repossession',
      objectiveText: 'Steal the Pegassi Zentorno in Rockford Hills.',
    });
    expect(first.source).toBe('groq');
    expect(first.text).toContain('car');

    // Cached: second request makes no network call
    const second = await ai.getMissionBriefing('simeon_repo', {
      giver: 'Simeon Yetarian',
      title: 'Repossession',
      objectiveText: 'Steal the Pegassi Zentorno in Rockford Hills.',
    });
    expect(second).toBe(first);
    expect(calls).toBe(1);

    // Offline: generic in-character fallback briefing
    mockGroq(() => {
      throw new Error('offline');
    });
    const offlineAi = new AiDialogue(new GroqClient());
    const fallback = await offlineAi.getMissionBriefing('lester_heist', {
      giver: 'Lester Crest',
      title: 'The Vinewood Job',
      objectiveText: 'Collect the heist package.',
    });
    expect(fallback.source).toBe('fallback');
    expect(fallback.text.length).toBeGreaterThan(10);
  });

  it('strips HTML from mission objective markup for clean LLM input', () => {
    expect(
      stripHtml('Steal the <span class="hl-blue">Zentorno</span> in <b>Rockford Hills</b>.')
    ).toBe('Steal the Zentorno in Rockford Hills.');
  });
});
