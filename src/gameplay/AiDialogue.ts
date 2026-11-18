import { GroqClient } from '../ai/GroqClient';
import { getDistrictAndStreet } from '../world/WorldData';

/**
 * AiDialogue — Groq-powered dynamic dialogue for Los Santos.
 *
 * Two features:
 *  1. Street Talk: press T near any pedestrian for an in-character,
 *     location-aware AI line (name, district, time of day & wanted level
 *     are woven into the prompt).
 *  2. Mission Briefings: when a story mission starts, the giver delivers
 *     an AI-written briefing in their own voice.
 *
 * Every generation resolves to a `{ text, source }` result; when Groq is
 * unreachable, rate-limited or has no key, the built-in canned Los Santos
 * lines keep the city alive offline.
 */

export interface AiLine {
  text: string;
  source: 'groq' | 'fallback';
}

export interface PedContext {
  name: string;
  x: number;
  z: number;
  /** Hour of day 0..23 */
  hour: number;
  wantedLevel: number;
}

export interface MissionBriefContext {
  giver: string;
  title: string;
  objectiveText: string;
}

/** Strip HTML tags from mission objective markup for clean LLM input */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function timeLabel(hour: number): string {
  if (hour < 6) return 'late night';
  if (hour < 11) return 'morning';
  if (hour < 14) return 'midday';
  if (hour < 18) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

const PED_SYSTEM =
  'You are a colourful resident of the video-game city Los Santos (GTA V world). ' +
  'Reply as the given character with ONE spoken sentence only: max 22 words, gritty, ' +
  'funny or street-smart GTA tone. No quotes, no stage directions, no narration — just the line they say.';

const BRIEFING_SYSTEM =
  'You write mission briefings for a GTA V-style Los Santos story. Reply in character as the named ' +
  'mission giver with 1-2 punchy spoken sentences (max 40 words) briefing the mission. ' +
  'No quotes, no stage directions — just what they say.';

const FALLBACK_PED_LINES: string[] = [
  'Watch where you are going, man — this city eats people like breakfast.',
  'You look lost. Everything south of the boulevard is gang territory, homie.',
  'Another day in paradise... if paradise had traffic this bad.',
  'Hey, you are that guy from the news, right? Do not tell anyone I saw you.',
  'Rent is due, cops are everywhere, and you want to chat? Beautiful day though.',
  'They paved paradise and put up a parking lot. Welcome to Los Santos.',
  'Keep your head down around here, unless you want a free haircut from a nine millimetre.',
  'I saw a helicopter land on the Maze Bank roof this morning. Something big is brewing.',
  'You would not believe the week I am having. My car got repoed twice.',
  'Vinewood promises everything and delivers traffic tickets, friend.',
  'Life is good, man. Sun is out, tacos are cheap, cops are... present.',
  'If you are looking for trouble it will find you first around here.',
];

const FALLBACK_BRIEFINGS: string[] = [
  'Listen up — get in, get it done, and get out clean. No loose ends.',
  'Keep it tight and keep it quiet. I only fund winners.',
  'Do this right and there is a fat envelope waiting for you afterwards.',
];

export class AiDialogue {
  private groq: GroqClient;
  private fallbackCursor = 0;
  /** Plain-text cache of generated mission briefings (per mission id) */
  private briefingCache = new Map<string, AiLine>();

  constructor(groq: GroqClient) {
    this.groq = groq;
  }

  /** Location-aware in-character street line for a nearby pedestrian */
  public async getPedLine(ctx: PedContext): Promise<AiLine> {
    const loc = getDistrictAndStreet(ctx.x, ctx.z);
    const wanted =
      ctx.wantedLevel > 0
        ? ` The player currently has ${ctx.wantedLevel} wanted stars, so act nervous around the cops.`
        : '';
    const text = await this.groq.complete({
      system: PED_SYSTEM,
      user:
        `Your character name is ${ctx.name}. The player (Franklin) just walked up to you on ` +
        `${loc.street} in ${loc.district} during the ${timeLabel(ctx.hour)}.${wanted} ` +
        'Say one in-character sentence to Franklin.',
      maxTokens: 70,
      temperature: 0.95,
    });
    if (text) return { text, source: 'groq' };
    return { text: this.nextFallback(FALLBACK_PED_LINES), source: 'fallback' };
  }

  /** In-character AI briefing from the mission giver (cached per mission) */
  public async getMissionBriefing(missionId: string, ctx: MissionBriefContext): Promise<AiLine> {
    const cached = this.briefingCache.get(missionId);
    if (cached) return cached;

    const text = await this.groq.complete({
      system: BRIEFING_SYSTEM,
      user:
        `You are ${ctx.giver}. Brief the mission "${ctx.title}". Objective: ${ctx.objectiveText}. ` +
        'Speak your briefing out loud now.',
      maxTokens: 110,
      temperature: 0.85,
    });
    const line: AiLine = text
      ? { text, source: 'groq' }
      : { text: this.nextFallback(FALLBACK_BRIEFINGS), source: 'fallback' };
    this.briefingCache.set(missionId, line);
    return line;
  }

  private nextFallback(pool: string[]): string {
    const line = pool[this.fallbackCursor % pool.length];
    this.fallbackCursor++;
    return line;
  }
}
