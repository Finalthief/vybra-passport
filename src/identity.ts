import { generateAvatarSvg, type AvatarOptions } from './avatar';
import { PASSPORT_PAYLOAD_VERSION, sha256Hex } from './passport';
import { generateQrCodeDataUrl, generateQrCodeSvg, type QrSvgOptions } from './qr';
import { buildCollectiveAgentUrl } from './surfaces';
import type {
  PassportIdentity,
  PassportPayload,
  PassportSurfaceProfile,
  Surface,
  SurfaceHandleHints,
} from './types';

/**
 * Canonical identity contract (Passport v2)
 * ------------------------------------------
 * - `canonicalSlug` is the one true handle/slug form used in URLs and
 *   cross-surface lookups: lowercase, ASCII letters/digits, hyphen-separated
 *   (`Iris_Hart` -> `iris-hart`).
 * - `displayNameSeed` is the one true seed for avatars and QR identity art:
 *   derived from the Passport display name, never from local slugs. Slug-ish
 *   inputs (`Iris_Hart`, `iris-hart`) and the display name (`Iris Hart`) all
 *   collapse to the same seed (`iris hart`), so surfaces that historically
 *   seeded from local slugs converge on the same visuals.
 * - These helpers are additive; the legacy exports (`generateAvatarSvg`,
 *   `generateQrSvg`, `sanitizeForFederation`) keep their exact behavior.
 */

export const MIN_SUPPORTED_PASSPORT_VERSION = 0;

const CANONICAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type IdentityLike = string | Pick<PassportIdentity, 'displayName'>;
type HandleLike = string | Pick<PassportIdentity, 'globalHandle'>;

function displayNameOf(identity: IdentityLike): string {
  return typeof identity === 'string' ? identity : identity.displayName;
}

function handleOf(handle: HandleLike): string {
  return typeof handle === 'string' ? handle : handle.globalHandle;
}

/** Trims and collapses internal whitespace; keeps case and punctuation for display. */
export function normalizeDisplayName(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * Canonical seed for avatars/QR identity art. Underscores, hyphens, and
 * whitespace runs all read as word separators, so display names and legacy
 * slug variants of the same identity produce the same seed.
 */
export function displayNameSeed(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/**
 * Canonical handle/slug: lowercase ASCII, hyphen-separated, no leading or
 * trailing hyphens. Diacritics are stripped (`Härt` -> `hart`); every other
 * non-alphanumeric run becomes a single hyphen. Returns '' when nothing
 * sluggable remains.
 */
export function canonicalSlug(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isCanonicalSlug(value: string | null | undefined): boolean {
  return Boolean(value) && CANONICAL_SLUG_PATTERN.test(value as string);
}

/** True when the value is not canonical but still canonicalizes to a usable slug. */
export function isLegacyHandle(value: string | null | undefined): boolean {
  if (!value || isCanonicalSlug(value)) {
    return false;
  }

  return canonicalSlug(value).length > 0;
}

/** Canonical-form equality: `handlesMatch('Iris_Hart', 'iris-hart') === true`. */
export function handlesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftCanonical = canonicalSlug(left);
  return leftCanonical.length > 0 && leftCanonical === canonicalSlug(right);
}

export interface HandleMigration {
  from: string;
  to: string;
  changed: boolean;
}

export function migrateLegacyHandle(input: string): HandleMigration {
  const to = canonicalSlug(input);
  return { from: input, to, changed: to !== input };
}

/**
 * Lookup candidates for resolving records stored under legacy handle
 * variants (e.g. Gallery's `Iris_Hart` for canonical `iris-hart`). The
 * original input comes first, then the canonical slug, then common
 * underscore/case/space variants. Deduplicated, order-stable.
 */
export function legacyHandleCandidates(handle: string): string[] {
  const canonical = canonicalSlug(handle);
  if (!canonical) {
    return handle ? [handle] : [];
  }

  const words = canonical.split('-');
  const titleWords = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const candidates = [
    handle,
    canonical,
    words.join('_'),
    titleWords.join('_'),
    titleWords.join('-'),
    words.join(' '),
    titleWords.join(' '),
    words.join(''),
    titleWords.join(''),
  ];

  return [...new Set(candidates)];
}

export interface HandleCollision {
  canonical: string;
  sources: string[];
}

export interface HandleMigrationPlan {
  migrations: HandleMigration[];
  changed: HandleMigration[];
  collisions: HandleCollision[];
  /** Inputs that canonicalize to '' and cannot be migrated automatically. */
  invalid: string[];
  /** True when there are no collisions and no invalid handles. */
  safe: boolean;
}

/**
 * Dry-run a bulk handle migration. Flags collisions (distinct legacy handles
 * that collapse to the same canonical slug) so callers can resolve them
 * before renaming anything. Exact duplicate inputs are deduplicated first.
 */
export function planHandleMigration(handles: readonly string[]): HandleMigrationPlan {
  const unique = [...new Set(handles)];
  const migrations: HandleMigration[] = [];
  const invalid: string[] = [];
  const byCanonical = new Map<string, string[]>();

  for (const handle of unique) {
    const migration = migrateLegacyHandle(handle);
    if (!migration.to) {
      invalid.push(handle);
      continue;
    }

    migrations.push(migration);
    const sources = byCanonical.get(migration.to) ?? [];
    sources.push(handle);
    byCanonical.set(migration.to, sources);
  }

  const collisions: HandleCollision[] = [];
  for (const [canonical, sources] of byCanonical) {
    if (sources.length > 1) {
      collisions.push({ canonical, sources });
    }
  }

  return {
    migrations,
    changed: migrations.filter((migration) => migration.changed),
    collisions,
    invalid,
    safe: collisions.length === 0 && invalid.length === 0,
  };
}

/**
 * Deterministic fingerprint of the display-name seed, for cross-surface
 * consistency checks ("are these two records the same identity?"). It is
 * NOT a replacement for the server-issued `identity.id`.
 */
export function identityFingerprint(identity: IdentityLike): string {
  return sha256Hex(`vybra-passport:v${PASSPORT_PAYLOAD_VERSION}:${displayNameSeed(displayNameOf(identity))}`);
}

/** The seed string the Passport contract uses for avatar/QR art. */
export function avatarSeed(identity: IdentityLike): string {
  return displayNameSeed(displayNameOf(identity));
}

/**
 * Avatar generation pinned to the Passport display-name seed. For plain
 * display names this is byte-identical to `generateAvatarSvg(displayName)`;
 * for slug-ish inputs (`Iris_Hart`) the gradient matches the display-name
 * avatar instead of drifting.
 */
export function generatePassportAvatarSvg(identity: IdentityLike, options: AvatarOptions = {}): string {
  const displayName = displayNameOf(identity);
  const label = normalizeDisplayName(displayName) || displayName;
  return generateAvatarSvg(label, { seed: displayNameSeed(displayName), ...options });
}

export function generatePassportAvatarDataUrl(identity: IdentityLike, options: AvatarOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatePassportAvatarSvg(identity, options))}`;
}

/**
 * Canonical QR payload: the Collective agent URL built from the canonical
 * slug, so `Iris_Hart` and `iris-hart` encode the same URL.
 */
export function passportQrValue(handle: HandleLike, baseUrl?: string): string {
  const raw = handleOf(handle);
  const canonical = canonicalSlug(raw) || raw;
  return baseUrl === undefined
    ? buildCollectiveAgentUrl(canonical)
    : buildCollectiveAgentUrl(canonical, baseUrl);
}

export function generatePassportQrSvg(handle: HandleLike, options?: QrSvgOptions): string;
export function generatePassportQrSvg(handle: HandleLike, baseUrl: string, options?: QrSvgOptions): string;
export function generatePassportQrSvg(
  handle: HandleLike,
  baseUrlOrOptions?: string | QrSvgOptions,
  options: QrSvgOptions = {}
): string {
  const baseUrl = typeof baseUrlOrOptions === 'string' ? baseUrlOrOptions : undefined;
  const resolvedOptions = typeof baseUrlOrOptions === 'string' ? options : baseUrlOrOptions ?? {};
  return generateQrCodeSvg(passportQrValue(handle, baseUrl), resolvedOptions);
}

export function generatePassportQrDataUrl(handle: HandleLike, options?: QrSvgOptions): string;
export function generatePassportQrDataUrl(handle: HandleLike, baseUrl: string, options?: QrSvgOptions): string;
export function generatePassportQrDataUrl(
  handle: HandleLike,
  baseUrlOrOptions?: string | QrSvgOptions,
  options: QrSvgOptions = {}
): string {
  const baseUrl = typeof baseUrlOrOptions === 'string' ? baseUrlOrOptions : undefined;
  const resolvedOptions = typeof baseUrlOrOptions === 'string' ? options : baseUrlOrOptions ?? {};
  return generateQrCodeDataUrl(passportQrValue(handle, baseUrl), resolvedOptions);
}

export interface PassportConsistencyIssue {
  level: 'error' | 'warning';
  code:
    | 'unsupported_payload_version'
    | 'legacy_payload_version'
    | 'missing_display_name'
    | 'invalid_global_handle'
    | 'non_canonical_global_handle'
    | 'collective_agent_handle_mismatch'
    | 'duplicate_surface'
    | 'legacy_surface_handle'
    | 'surface_handle_mismatch'
    | 'invalid_validity_window';
  message: string;
  surface?: Surface;
}

/**
 * Non-throwing audit of a passport payload against the v2 identity contract.
 * Errors mean the payload should not be trusted as-is; warnings flag legacy
 * data that `normalizePassportHandles` (or a server-side migration) can fix.
 */
export function checkPassportConsistency(payload: PassportPayload): PassportConsistencyIssue[] {
  const issues: PassportConsistencyIssue[] = [];

  if (payload.payloadVersion > PASSPORT_PAYLOAD_VERSION || payload.payloadVersion < MIN_SUPPORTED_PASSPORT_VERSION) {
    issues.push({
      level: 'error',
      code: 'unsupported_payload_version',
      message: `payloadVersion ${payload.payloadVersion} is outside the supported range ${MIN_SUPPORTED_PASSPORT_VERSION}-${PASSPORT_PAYLOAD_VERSION}.`,
    });
  } else if (payload.payloadVersion < PASSPORT_PAYLOAD_VERSION) {
    issues.push({
      level: 'warning',
      code: 'legacy_payload_version',
      message: `payloadVersion ${payload.payloadVersion} predates v${PASSPORT_PAYLOAD_VERSION}; run upgradePassportPayload() before use.`,
    });
  }

  if (!normalizeDisplayName(payload.identity.displayName)) {
    issues.push({
      level: 'error',
      code: 'missing_display_name',
      message: 'identity.displayName is empty; avatars and QR seeds cannot be derived.',
    });
  }

  const globalCanonical = canonicalSlug(payload.identity.globalHandle);
  if (!globalCanonical) {
    issues.push({
      level: 'error',
      code: 'invalid_global_handle',
      message: `identity.globalHandle ${JSON.stringify(payload.identity.globalHandle)} does not canonicalize to a usable slug.`,
    });
  } else if (payload.identity.globalHandle !== globalCanonical) {
    issues.push({
      level: 'warning',
      code: 'non_canonical_global_handle',
      message: `identity.globalHandle "${payload.identity.globalHandle}" should be the canonical slug "${globalCanonical}".`,
    });
  }

  if (
    globalCanonical &&
    payload.collectiveAgent.handle &&
    canonicalSlug(payload.collectiveAgent.handle) !== globalCanonical
  ) {
    issues.push({
      level: 'warning',
      code: 'collective_agent_handle_mismatch',
      message: `collectiveAgent.handle "${payload.collectiveAgent.handle}" does not match identity.globalHandle "${payload.identity.globalHandle}".`,
    });
  }

  const seenSurfaces = new Set<Surface>();
  for (const profile of payload.surfaces) {
    if (seenSurfaces.has(profile.surface)) {
      issues.push({
        level: 'error',
        code: 'duplicate_surface',
        message: `surfaces contains more than one entry for "${profile.surface}".`,
        surface: profile.surface,
      });
      continue;
    }
    seenSurfaces.add(profile.surface);

    const profileCanonical = canonicalSlug(profile.handle);
    if (globalCanonical && profileCanonical === globalCanonical) {
      if (profile.handle !== profileCanonical) {
        issues.push({
          level: 'warning',
          code: 'legacy_surface_handle',
          message: `surfaces.${profile.surface}.handle "${profile.handle}" is a legacy variant of "${profileCanonical}".`,
          surface: profile.surface,
        });
      }
      continue;
    }

    const hint = payload.handleHints[profile.surface];
    if (hint !== undefined && canonicalSlug(hint) === profileCanonical) {
      continue;
    }

    issues.push({
      level: 'warning',
      code: 'surface_handle_mismatch',
      message: `surfaces.${profile.surface}.handle "${profile.handle}" matches neither identity.globalHandle nor handleHints.${profile.surface}.`,
      surface: profile.surface,
    });
  }

  const issuedAt = new Date(payload.issuedAt).getTime();
  const expiresAt = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    issues.push({
      level: 'error',
      code: 'invalid_validity_window',
      message: `issuedAt/expiresAt do not form a valid window (${payload.issuedAt} -> ${payload.expiresAt}).`,
    });
  }

  return issues;
}

export interface NormalizedPassportResult {
  payload: PassportPayload;
  changed: boolean;
  changes: string[];
}

/**
 * Returns a copy of the payload with all handles canonicalized. When a
 * surface handle changes (e.g. Gallery's `Iris_Hart` -> `iris-hart`), the
 * original legacy handle is preserved in `handleHints[surface]` (unless a
 * hint already exists) so consumers can still resolve old records.
 *
 * NOTE: changing any field invalidates an existing HMAC signature. Verify
 * first, then normalize — or normalize server-side and re-sign with
 * `signPassportPayload`.
 */
export function normalizePassportHandles(payload: PassportPayload): NormalizedPassportResult {
  const changes: string[] = [];
  const handleHints: SurfaceHandleHints = { ...payload.handleHints };

  const surfaces: PassportSurfaceProfile[] = payload.surfaces.map((profile) => {
    const canonical = canonicalSlug(profile.handle);
    if (!canonical || canonical === profile.handle) {
      return profile;
    }

    changes.push(`surfaces.${profile.surface}.handle: "${profile.handle}" -> "${canonical}"`);
    if (handleHints[profile.surface] === undefined) {
      handleHints[profile.surface] = profile.handle;
      changes.push(`handleHints.${profile.surface}: preserved legacy handle "${profile.handle}"`);
    }
    return { ...profile, handle: canonical };
  });

  let identity = payload.identity;
  const globalCanonical = canonicalSlug(identity.globalHandle);
  if (globalCanonical && globalCanonical !== identity.globalHandle) {
    changes.push(`identity.globalHandle: "${identity.globalHandle}" -> "${globalCanonical}"`);
    identity = { ...identity, globalHandle: globalCanonical };
  }

  let collectiveAgent = payload.collectiveAgent;
  const agentCanonical = canonicalSlug(collectiveAgent.handle);
  if (agentCanonical && agentCanonical !== collectiveAgent.handle) {
    changes.push(`collectiveAgent.handle: "${collectiveAgent.handle}" -> "${agentCanonical}"`);
    collectiveAgent = { ...collectiveAgent, handle: agentCanonical };
  }

  if (changes.length === 0) {
    return { payload, changed: false, changes };
  }

  return {
    payload: { ...payload, identity, surfaces, handleHints, collectiveAgent },
    changed: true,
    changes,
  };
}

export interface PassportUpgradeResult {
  payload: PassportPayload;
  /** The payloadVersion the input claimed (0 when absent). */
  upgradedFrom: number;
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Upgrades a v0/v1 payload to the current v2 shape by filling fields that
 * older issuers omitted (handleHints, avatarDataUrl, qrDataUrl, bio,
 * collectiveAgent defaults). Missing timestamps default to '' which reads as
 * expired — the safe failure mode. Throws TypeError when the input is not an
 * object with an identity record; everything else is filled conservatively.
 */
export function upgradePassportPayload(input: unknown): PassportUpgradeResult {
  if (!isRecord(input) || !isRecord(input.identity)) {
    throw new TypeError('upgradePassportPayload() requires an object with an identity record.');
  }

  const rawIdentity = input.identity;
  const displayName = asString(rawIdentity.displayName);
  const identity: PassportIdentity = {
    id: asString(rawIdentity.id),
    globalHandle: asString(rawIdentity.globalHandle) || canonicalSlug(displayName),
    email: asString(rawIdentity.email),
    displayName,
    bio: typeof rawIdentity.bio === 'string' ? rawIdentity.bio : null,
  };

  const rawAgent = isRecord(input.collectiveAgent) ? input.collectiveAgent : {};
  const upgradedFrom = typeof input.payloadVersion === 'number' ? input.payloadVersion : 0;

  const payload: PassportPayload = {
    payloadVersion: PASSPORT_PAYLOAD_VERSION,
    identity,
    surfaces: Array.isArray(input.surfaces) ? (input.surfaces as PassportSurfaceProfile[]) : [],
    handleHints: isRecord(input.handleHints) ? (input.handleHints as SurfaceHandleHints) : {},
    avatarDataUrl: asString(input.avatarDataUrl),
    qrDataUrl: asString(input.qrDataUrl),
    collectiveAgent: {
      id: asString(rawAgent.id),
      handle: asString(rawAgent.handle) || identity.globalHandle,
      keyId: asString(rawAgent.keyId),
      surfaceScope: Array.isArray(rawAgent.surfaceScope) ? (rawAgent.surfaceScope as Surface[]) : [],
    },
    issuedAt: asString(input.issuedAt),
    expiresAt: asString(input.expiresAt),
  };

  return {
    payload,
    upgradedFrom,
    changed: upgradedFrom !== PASSPORT_PAYLOAD_VERSION,
  };
}
