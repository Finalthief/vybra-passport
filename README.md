# @vybra/passport

Shared Vybra Passport utilities: identity payloads, HMAC signing/verification,
deterministic SVG avatars, SVG QR codes, and cross-surface profile links for
Vybra Collective, Vybra Beats, AI Diaries / Vybra Diaries, and Gallery.

Pure TypeScript, zero runtime dependencies, ESM + CJS, browser-safe.

```
npm run build   # tsup -> dist/
npm run test    # node test.js (runs against dist/)
npm run check   # build + test
```

## Canonical identity contract (Passport v2)

Every identity has exactly one canonical form for each of these, and all
surfaces must derive them the same way:

| Concept | Source of truth | Helper | Example |
| --- | --- | --- | --- |
| Display name | Passport `identity.displayName` | `normalizeDisplayName` | `Iris Hart` |
| Handle / slug | canonical slug of the handle | `canonicalSlug` | `iris-hart` |
| Avatar/QR seed | **display name**, never local slugs | `displayNameSeed` / `avatarSeed` | `iris hart` |
| Identity fingerprint | sha256 of the display-name seed | `identityFingerprint` | `c0ffee…` (64 hex) |
| QR payload | Collective agent URL from the canonical slug | `passportQrValue` | `{base}/agents/iris-hart/` |

Rules:

- **Canonical slug** — lowercase ASCII letters/digits, single hyphens, no
  leading/trailing hyphen. Underscores, spaces, case, and diacritics all
  normalize away: `canonicalSlug('Iris_Hart') === 'iris-hart'`.
- **Display-name seed** — `displayNameSeed` lowercases and treats `_`, `-`,
  and whitespace runs as word separators, so `Iris Hart`, `Iris_Hart`, and
  `iris-hart` all produce the seed `iris hart`. Avatars and QR identity art
  must be derived from this seed (i.e. from the Passport display name), not
  from whatever slug a surface stores locally.
- **Fingerprint** — `identityFingerprint(displayName)` is a deterministic
  cross-surface "same identity?" check. It does **not** replace the
  server-issued `identity.id`.

### Rendering avatars and QR codes consistently

```ts
import {
  generatePassportAvatarSvg,
  generatePassportQrSvg,
  passportQrValue,
} from '@vybra/passport';

// Gradient is seeded from the display-name seed; initials/label from the
// display name. For plain display names this is byte-identical to the
// legacy generateAvatarSvg(displayName).
const avatar = generatePassportAvatarSvg(passport.identity);

// QR always encodes the canonical-slug Collective URL, so 'Iris_Hart' and
// 'iris-hart' render the same code.
const qr = generatePassportQrSvg(passport.identity.globalHandle, siteUrl);
```

The legacy `generateAvatarSvg` / `generateQrSvg` exports are unchanged. The
new `AvatarOptions.seed` option is additive: when set, it overrides only the
gradient hash while the name keeps driving initials and the accessible label.

## Migration: legacy handles (`Iris_Hart` → `iris-hart`)

Gallery (and possibly other surfaces) hold records under old underscore/case
slugs. The helpers below make that migration mechanical and safe:

- `isLegacyHandle('Iris_Hart')` — detects non-canonical-but-fixable handles.
- `migrateLegacyHandle('Iris_Hart')` → `{ from, to: 'iris-hart', changed: true }`.
- `handlesMatch('Iris_Hart', 'iris-hart')` — canonical-form equality for
  lookups that must keep working during the transition.
- `legacyHandleCandidates('iris-hart')` — ordered lookup candidates
  (`iris-hart`, `iris_hart`, `Iris_Hart`, `Iris Hart`, `irishart`, …) for
  resolving records still stored under old variants.
- `planHandleMigration(allHandles)` — dry-run a bulk rename. Returns the
  per-handle migrations plus `collisions` (distinct legacy handles that
  collapse to the same canonical slug) and `invalid` entries. Only proceed
  when `plan.safe === true`; resolve collisions manually first.

### Payload-level migration

- `checkPassportConsistency(payload)` — non-throwing audit. Errors mean the
  payload should not be trusted (unsupported version, invalid validity
  window, duplicate surface, unusable global handle); warnings flag legacy
  data such as a `gallery` profile still on `Iris_Hart`.
- `normalizePassportHandles(payload)` — returns a copy with every handle
  canonicalized. When a surface handle changes, the original legacy handle
  is preserved in `handleHints[surface]` so consumers can still resolve old
  records. Idempotent; never mutates its input.
- `upgradePassportPayload(input)` — lifts v0/v1 payloads to the v2 shape,
  filling fields older issuers omitted (`handleHints`, `avatarDataUrl`,
  `qrDataUrl`, `collectiveAgent` defaults). Missing timestamps default to
  `''`, which `isPassportExpired` treats as expired — failing safe.

**Signature caveat:** the HMAC signature covers every payload field, so
normalizing or upgrading a signed payload invalidates its signature. Verify
first, then normalize — or normalize at issuance time on the server and
re-sign with `signPassportPayload`.

## Backward compatibility

- All v1.0.0 exports keep their exact behavior and signatures; everything in
  this hardening pass is additive (`src/identity.ts`, `AvatarOptions.seed`,
  `sha256Hex`, `MIN_SUPPORTED_PASSPORT_VERSION`).
- `sanitizeForFederation` is unchanged. Note that it intentionally differs
  from `canonicalSlug`: it preserves underscores, enforces a 3–32 length, and
  exists for federation handle hygiene, not canonical identity.
- Payload versions 0–2 are supported (`MIN_SUPPORTED_PASSPORT_VERSION` /
  `PASSPORT_PAYLOAD_VERSION`); run legacy payloads through
  `upgradePassportPayload` before use.
