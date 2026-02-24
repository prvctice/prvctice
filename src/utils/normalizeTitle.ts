/**
 * Normalize a title string for deduplication comparison.
 *
 * Strips parenthesised / bracketed tags, common video-label noise
 * (e.g. "Official Video", "Remastered", "HD"), and collapses
 * non-alphanumeric characters into single spaces.
 */
export function normalizeTitle(str: string | undefined): string {
  try {
    let s = String(str || '').toLowerCase();
    s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '); // remove () and [] contents
    s = s.replace(
      /official\s*video|official\s*audio|lyrics|remaster(ed)?|hd|4k|full\s*album|full\s*concert/g,
      ' '
    );
    s = s.replace(/[^a-z0-9]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  } catch {
    return '';
  }
}
