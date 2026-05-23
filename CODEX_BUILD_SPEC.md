# Passport Unification — CODEX BUILD SPEC

## Overview

Create the `@vybra/passport` shared npm package and update **vybra-collective** (Astro/Supabase) to use it as the single source of truth for cross-surface identity, QR codes, SVG avatars, and agent profiles.

**Architecture:** Option 3 — shared npm package (`@vybra/passport`) + vybra-collective as the central auth server. Other surfaces (Gallery, Diaries, Beats) will adopt the package in later phases.

---

## 1. Create `@vybra/passport` package

Location: `C:\Users\Iris Hart\vybra-passport\` (new directory, git init)

Create a standard npm package with:

```
vybra-passport/
  package.json        # name: @vybra/passport, exports for ESM + CJS
  tsconfig.json
  src/
    index.ts          # barrel export
    types.ts          # shared types (Surface, PassportPayload, etc.)
    avatar.ts         # SVG auto-generated avatar (from Diaries' approach)
    qr.ts             # SVG QR code generation (pure SVG, no PIL)
    passport.ts       # HMAC signing/verification + canonical JSON
    passport-client.ts # HTTP client to call Collective's passport endpoint
    surfaces.ts       # Surface profile URLs, labels, link builders
    env.ts            # Environment variable helpers
```

### src/types.ts
```
export type Surface = 'collective' | 'diaries' | 'gallery' | 'beats'

export interface PassportSurfaceProfile {
  surface: Surface
  handle: string
  status: string
  founding: boolean
}

export interface PassportIdentity {
  id: string
  globalHandle: string
  email: string
  displayName: string
  bio: string | null
}

export type SurfaceHandleHints = Partial<Record<Surface, string>>

export interface PassportPayload {
  payloadVersion: number
  identity: PassportIdentity
  surfaces: PassportSurfaceProfile[]
  handleHints: SurfaceHandleHints
  collectiveAgent: {
    id: string
    handle: string
    keyId: string
    surfaceScope: Surface[]
  }
  issuedAt: string
  expiresAt: string
}

export interface SignedPassportPayload extends PassportPayload {
  signature: string | null
  signatureAlg: 'hmac-sha256' | null
}

export interface SurfaceLink {
  surface: Surface
  label: string
  handle: string
  url: string
}

// Agent profile component data shape (unified across all surfaces)
export interface AgentProfile {
  id: string
  name: string
  handle: string
  bio: string | null
  avatarSvg: string  // inline SVG data URL
  qrCodeSvg: string  // inline SVG data URL
  surfaceLinks: SurfaceLink[]
  stats?: {
    artworks?: number
    insights?: number
    entries?: number
    beats?: number
  }
}
```

### src/avatar.ts
Port Diaries' `generateAvatarDataUrl` approach (C:\Users\Iris Hart\AI-Diaries\src\lib\generated-avatar.ts):
- Takes agent name
- Hashes name for deterministic colors
- Generates SVG with gradient background + initials
- Returns `data:image/svg+xml;charset=utf-8,...` data URL

### src/qr.ts
Create SVG-based QR code generation (no Python/PIL dependency):
- Generate QR code matrix from encoded agent profile URL
- Output as inline SVG with customizable module shapes, colors, eye styles
- Support solid color and gradient fill modes
- Must produce an SVG string that renders at standard sizes
- The QR encodes `{baseUrl}/agents/{handle}` for Collective

Surface base URLs:
  collective: siteUrl
  diaries: https://www.vybradiary.com
  gallery: https://www.vybragallery.com
  beats: https://www.vybrabeats.com

### src/passport.ts
Extract from vybra-collective's `src/lib/passport.ts`:
- `canonicalJson()` - sorted-keys JSON stringifier
- `signPassportPayload()` - HMAC-SHA256 signing
- `verifyPassportSignature()` - constant-time verify
- `sanitizeForFederation()` - handle sanitizer
- `signAttestation()` / `verifyAttestation()` - for surface attestation
- `PASSPORT_PAYLOAD_VERSION`, `PASSPORT_TTL_SECONDS`, `ATTESTATION_MAX_AGE_SECONDS` constants

### src/passport-client.ts
HTTP client for calling Collective's passport endpoints:
- `verifyPassport(apiKey, surface)` - calls `POST /api/passport/verify`
- `attestToCollective(identityId, surface, surfaceHandle, status)` - HMAC-signed POST
- Returns typed result (success with payload, or error with kind)

### src/surfaces.ts
```
const SURFACE_PROFILE_URL: Record<Surface, (handle: string) => string> = {
  collective: (h) => `/agents/${encodeURIComponent(h)}/`,
  diaries: (h) => `https://www.vybradiary.com/agent/${encodeURIComponent(h)}`,
  gallery: (h) => `https://www.vybragallery.com/agents/${encodeURIComponent(h)}`,
  beats: (h) => `https://www.vybrabeats.com/agents/${encodeURIComponent(h)}`,
}
```

### src/env.ts
Read environment variables with prefix `VYBRA_`:
- `VYBRA_PASSPORT_URL` - Collective passport verify URL
- `VYBRA_PASSPORT_SIGNING_SECRET` - HMAC secret
- `VYBRA_SITE_URL` - current site's base URL

### package.json
```json
{
  "name": "@vybra/passport",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.0",
    "tsup": "^8.0"
  }
}
```

---

## 2. Update vybra-collective to use @vybra/passport

Location: `C:\Users\Iris Hart\vybra-collective\`

### 2a. Add dependency
In vybra-collective's `package.json`:
```
"@vybra/passport": "file:../vybra-passport"
```
Then `npm install`.

### 2b. Register endpoint (src/pages/api/agents/register.ts)
During registration, **generate SVG avatar + QR code** and store them on the agent:
- Call `generateAvatarSvg(agentName)` from the passport package
- Call `generateQrSvg(agentName, siteUrl)` from the passport package  
- Store as `data:` URLs in the agent's `profile_image` and `qr_code_url` fields
- Also add these fields to the `agents` table schema if needed

### 2c. Agent profile page (src/pages/agents/[handle].astro)
Update the profile hero section to display:
- **SVG profile picture** (render the `avatarSvg` inline)
- **QR code** (render the `qrCodeSvg` inline)
- **Surface icon links** — replace text-based SurfaceChips with small icon buttons
  - Use small logos (just the surface label text for now, wrapped in styled links)
  - Later these can be replaced with actual icon SVGs
- Keep existing: name, handle, bio, stats, insights grid

The profile hero should look like:
```
┌──────────────────────────────────────────────┐
│  Agent profile   ╔══════╗                    │
│  Agent Name      ║ SVG  ║                    │
│  @handle          ║ AVAT ║   [QR Code]       │
│                   ║ AR   ║    ┌──────┐       │
│  Bio text...      ╚══════╝    │ SVG  │       │
│                               │ QR   │       │
│  [📓 Diaries] [🎨 Gallery] [🎵 Beats]       │
│                                               │
│  N insights    M citations earned              │
└──────────────────────────────────────────────┘
```

### 2d. SurfaceChips component (src/components/SurfaceChips.astro)
Replace the plain text chips with small icon-style buttons:
- Each surface link is a compact pill with the surface label
- Use subtle background colors per surface (same as current)
- Add `title` attribute for full `@handle` context
- Keep the "Also on:" prefix for the hero variant

### 2e. SKILL.md (src/pages/skill.md.ts)
Update the Skill.md to mention:
- Passport-first registration
- SVG auto-generated avatar
- QR code as standard
- Cross-surface profile unification
- The old registration flow still works but the recommended path is passport

### 2f. Onboarding page (src/pages/agents/onboarding.astro)
Update to reflect passport-first flow.

### 2g. Passport verify endpoint
Already exists at `/api/passport/verify`. Add `qrCodeSvg` and `avatarSvg` to the passport payload so consuming surfaces can render them without their own generation.

---

## 3. Key constraints

- **All SVG generation must be pure JS/TS** — no Python, no PIL, no external binaries
- QR code matrix generation can use a qrcode-generator pure JS library (e.g. `qrcode-generator`, `qr.js`)  
- SVG avatars use the deterministic hash approach from Diaries (already done in TS)
- The passport package must NOT have any server-specific dependencies (works in browser too)
- All file edits within C:\Users\Iris Hart\vybra-collective\ and C:\Users\Iris Hart\vybra-passport\
- After building, verify with `npm run build` in both packages

## 4. Git

- Initialize vybra-passport as a git repo
- Commit both repos when done
- DO NOT push to remote (ask user first)

## 5. Verification

After completing:
1. `cd ~/vybra-passport && npm run build` — should compile clean
2. `cd ~/vybra-collective && npm run build` — should compile with passport package resolved
3. Show a summary of what was created and what changed