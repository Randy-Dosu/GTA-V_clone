/**
 * MusicApi — real-song resolution for the in-game radio via the public
 * iTunes / Apple Music Search API (no API key required).
 *
 * Every curated Kweku Smoke & Stonebwoy track is looked up by artist + title,
 * returning a playable streaming preview URL plus artwork/album metadata.
 * When a song is selected in the radio deck, the resolved stream is bound to
 * the catalog song and played by the AudioEngine's HTML audio path; if the
 * network or lookup fails, the built-in instrumental seamlessly takes over.
 */

export interface MusicApiResult {
  /** Catalog song id this result was resolved for */
  songId: string;
  /** Matched track name from the API */
  title: string;
  /** Matched artist name from the API */
  artist: string;
  /** Album / single the track belongs to */
  album: string;
  /** Directly playable streaming URL (m4a preview) */
  previewUrl: string;
  /** Album cover artwork URL */
  artworkUrl: string;
  /** Store genre (e.g. "Afro-Beat", "Ghanaian Pop") */
  genre: string;
  /** Original release date (YYYY-MM-DD or full ISO) */
  releaseDate: string;
  /** Music API provider used for the lookup */
  source: 'apple-music-api';
}

interface ITunesTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
}

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const LOOKUP_TIMEOUT_MS = 8000;

/** Normalize text for confident artist/title matching */
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\((feat|ft|with)[^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class MusicApi {
  /** songId -> resolved result (or null when confidently unavailable) */
  private cache = new Map<string, MusicApiResult | null>();
  /** songId -> in-flight lookup promise (dedupes parallel calls) */
  private inflight = new Map<string, Promise<MusicApiResult | null>>();
  /** number of live API lookups performed this session */
  public lookupCount = 0;

  /**
   * Resolve a catalog song to real streaming audio via the music API.
   * Cached per session; failures resolve to null (instrumental fallback).
   */
  public async resolveTrack(songId: string, artist: string, title: string): Promise<MusicApiResult | null> {
    if (this.cache.has(songId)) return this.cache.get(songId) ?? null;
    const pending = this.inflight.get(songId);
    if (pending) return pending;

    const task = this.fetchAndMatch(songId, artist, title)
      .then((result) => {
        this.cache.set(songId, result);
        return result;
      })
      .catch(() => {
        this.cache.set(songId, null);
        return null;
      })
      .finally(() => {
        this.inflight.delete(songId);
      });

    this.inflight.set(songId, task);
    return task;
  }

  /** True when the API already produced a playable stream for this song */
  public hasStream(songId: string): boolean {
    const hit = this.cache.get(songId);
    return !!hit && !!hit.previewUrl;
  }

  private async fetchAndMatch(songId: string, artist: string, title: string): Promise<MusicApiResult | null> {
    const titleBase = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || title;
    const term = `${artist} ${titleBase}`.trim();
    const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(term)}&media=music&entity=song&limit=6`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    let tracks: ITunesTrack[];
    try {
      this.lookupCount++;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: ITunesTrack[] };
      tracks = Array.isArray(data?.results) ? data.results : [];
    } finally {
      clearTimeout(timer);
    }

    const best = this.pickBestMatch(tracks, artist, titleBase);
    if (!best || !best.previewUrl) return null;

    return {
      songId,
      title: best.trackName || title,
      artist: best.artistName || artist,
      album: best.collectionName || '',
      previewUrl: best.previewUrl,
      artworkUrl: (best.artworkUrl100 || '').replace(/\/100x100/, '/300x300'),
      genre: best.primaryGenreName || '',
      releaseDate: (best.releaseDate || '').slice(0, 10),
      source: 'apple-music-api',
    };
  }

  /** Score iTunes results and return the most confident artist+title match */
  private pickBestMatch(tracks: ITunesTrack[], artist: string, titleBase: string): ITunesTrack | null {
    const normArtist = norm(artist);
    const normTitle = norm(titleBase);
    let best: ITunesTrack | null = null;
    let bestScore = 0;

    for (const t of tracks) {
      if (!t.previewUrl || !t.trackName) continue;
      const nTrack = norm(t.trackName);
      const nResArtist = norm(t.artistName || '');
      let artistScore = 0;
      let titleScore = 0;

      // Artist confidence
      if (nResArtist.includes(normArtist) || normArtist.includes(nResArtist)) artistScore = 2;

      // Title confidence (either direction covers "(feat. Ginton)" suffixes)
      if (nTrack.includes(normTitle)) titleScore = 2;
      else if (normTitle.includes(nTrack) && nTrack.length >= 4) titleScore = 1;

      let score = artistScore + titleScore;
      // Penalize covers/karaoke/remix/tribute noise
      if (/(remix|cover|karaoke|tribute|instrumental|sped up|slowed)/.test(nTrack)) score -= 3;

      // Require title confidence too — never accept an artist-only match
      if (score > bestScore && titleScore >= 1) {
        bestScore = score;
        best = t;
      }
    }

    // Need at least a confident title match (+ artist or exact-title confidence)
    return bestScore >= 2 ? best : null;
  }
}
