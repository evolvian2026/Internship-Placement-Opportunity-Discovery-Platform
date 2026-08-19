/** Text utilities shared by slugs, dedupe hashing and the normalizer. */

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Slug with a short random suffix, for guaranteed uniqueness. */
export function uniqueSlug(input: string, suffix: string): string {
  const base = slugify(input) || 'item';
  return `${base}-${suffix}`.slice(0, 100);
}

const COMPANY_NOISE = [
  'private limited',
  'pvt ltd',
  'pvt. ltd.',
  'pvt limited',
  'public limited',
  'limited',
  'ltd',
  'llp',
  'inc',
  'incorporated',
  'corporation',
  'corp',
  'company',
  'co',
  'technologies',
  'technology',
  'solutions',
  'services',
  'india',
  'global',
  'group',
  'holdings',
];

/**
 * Normalise a company name for duplicate detection.
 * "ABC Technologies Pvt. Ltd." and "ABC Technologies Private Limited"
 * both collapse to "abc".
 */
export function normalizeCompanyName(name: string): string {
  let out = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const noise of COMPANY_NOISE) {
    out = out.replace(new RegExp(`\\b${noise}\\b`, 'g'), ' ');
  }
  out = out.replace(/\s+/g, ' ').trim();
  // Never return an empty key — fall back to the squashed original.
  return out || name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const TITLE_NOISE = [
  'hiring',
  'urgent',
  'immediate',
  'opening',
  'openings',
  'vacancy',
  'vacancies',
  'apply now',
  'job',
  'jobs',
  'recruitment',
  'notification',
  'off campus',
  'offcampus',
  'drive',
  'freshers',
  'fresher',
  'batch',
];

/** Normalise a job title so "Software Engineer" ≈ "SOFTWARE ENGINEER (Fresher Hiring)". */
export function normalizeTitle(title: string): string {
  let out = title
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/[^a-z0-9\s+#.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const noise of TITLE_NOISE) {
    out = out.replace(new RegExp(`\\b${noise}\\b`, 'g'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim() || title.toLowerCase().trim();
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Jaccard similarity over token sets — cheap and good enough for dedupe. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

/** Levenshtein-based ratio, used for short strings such as titles. */
export function similarityRatio(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const prev = new Array<number>(s2.length + 1);
  const curr = new Array<number>(s2.length + 1);
  for (let j = 0; j <= s2.length; j += 1) prev[j] = j;

  for (let i = 1; i <= s1.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= s2.length; j += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= s2.length; j += 1) prev[j] = curr[j];
  }
  return 1 - prev[s2.length] / Math.max(s1.length, s2.length);
}

/** Strip HTML while keeping paragraph breaks, for descriptions from feeds. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
