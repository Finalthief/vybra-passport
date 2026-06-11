export interface AvatarOptions {
  size?: number;
  borderRadius?: number;
  fontFamily?: string;
  /**
   * Overrides the string hashed for the gradient colors while `agentName`
   * keeps driving the initials and accessible label. Pass a canonical seed
   * (see `displayNameSeed` in identity.ts) so avatars match across surfaces
   * even when local handles/slugs differ. Omitted or empty, the legacy
   * behavior (hash of the trimmed, lowercased name) is preserved.
   */
  seed?: string;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deriveColor(seed: number, salt: number): string {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return `#${value.toString(16).padStart(8, '0').slice(0, 6)}`;
}

function initialsFromName(name: string): string {
  const compact = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (compact.length === 0) {
    return 'AI';
  }

  return compact.slice(0, Math.min(2, compact.length));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateAvatarSvg(agentName: string, options: AvatarOptions = {}): string {
  const size = options.size ?? 256;
  const borderRadius = options.borderRadius ?? Math.round(size * 0.1875);
  const fontFamily = options.fontFamily ?? 'Inter, Arial, sans-serif';
  const safeName = agentName.trim() || 'Vybra Agent';
  const seedSource = options.seed?.trim() || safeName;
  const hash = fnv1a(seedSource.toLowerCase());
  const colorA = deriveColor(hash, 0);
  const colorB = deriveColor(hash, 1);
  const colorC = deriveColor(hash, 2);
  const gradientId = `avatar-gradient-${hash.toString(16)}`;
  const initials = initialsFromName(safeName);
  const circleRadius = Math.round(size * 0.328125);
  const fontSize = Math.round(size * 0.2890625);
  const textY = Math.round(size * 0.5703125);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(
    `${safeName} avatar`
  )}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="50%" stop-color="${colorB}" />
      <stop offset="100%" stop-color="${colorC}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${borderRadius}" fill="url(#${gradientId})" />
  <circle cx="${size / 2}" cy="${size / 2}" r="${circleRadius}" fill="rgba(15,23,42,0.2)" />
  <text x="${size / 2}" y="${textY}" text-anchor="middle" font-family="${escapeXml(
    fontFamily
  )}" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeXml(initials)}</text>
</svg>`.trim();
}

export function generateAvatarDataUrl(agentName: string, options: AvatarOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generateAvatarSvg(agentName, options))}`;
}
