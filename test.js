import {
  generateAvatarSvg,
  generateAvatarDataUrl,
  generateQrSvg,
  generateQrDataUrl,
  signPassportPayload,
  verifyPassportSignature,
  signAttestation,
  verifyAttestation,
  attestationCanonical,
  isPassportExpired,
  isAttestationFresh,
  buildSurfaceLinks,
  buildCollectiveAgentUrl,
  // identity hardening (v1.1.0)
  canonicalSlug,
  isCanonicalSlug,
  isLegacyHandle,
  normalizeDisplayName,
  displayNameSeed,
  handlesMatch,
  migrateLegacyHandle,
  legacyHandleCandidates,
  planHandleMigration,
  identityFingerprint,
  avatarSeed,
  generatePassportAvatarSvg,
  generatePassportAvatarDataUrl,
  passportQrValue,
  generatePassportQrSvg,
  checkPassportConsistency,
  normalizePassportHandles,
  upgradePassportPayload,
  sha256Hex,
  MIN_SUPPORTED_PASSPORT_VERSION,
} from './dist/index.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function header(title) {
  console.log(`\n=== ${title} ===`);
}

// --- Avatar tests ---
header('Avatar Generation');

const svg = generateAvatarSvg('Iris Hart');
assert(svg.startsWith('<svg'), 'returns valid SVG');
assert(svg.includes('Iris Hart'), 'includes agent name in label');
assert(svg.includes('linearGradient'), 'includes gradient');
assert(svg.includes('IR'), 'initials are IR (from Iris)');

const dataUrl = generateAvatarDataUrl('Iris Hart');
assert(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,'), 'data URL is valid');

// Deterministic: same name = same SVG
const svg2 = generateAvatarSvg('Iris Hart');
assert(svg === svg2, 'same name produces identical SVG');

// Different name = different SVG
const svg3 = generateAvatarSvg('Bert');
assert(svg !== svg3, 'different names produce different SVG');

// --- QR tests ---
header('QR Code Generation');

const qrSvg = generateQrSvg('https://vybra.org/agents/iris-hart');
assert(qrSvg.startsWith('<svg'), 'returns valid SVG');
assert(qrSvg.includes('viewBox'), 'includes viewBox');
assert(qrSvg.length > 500, 'QR SVG has substantial content');

const qrDataUrl = generateQrDataUrl('https://vybra.org/agents/iris-hart');
assert(qrDataUrl.startsWith('data:image/svg+xml;charset=utf-8,'), 'QR data URL is valid');

// QR with custom options
const qrStyled = generateQrSvg('https://vybra.org', {
  fill: { type: 'linear-gradient', from: '#ff0000', to: '#0000ff' },
  backgroundColor: '#000000',
  moduleShape: 'rounded',
  eyeStyle: 'circle',
});
assert(qrStyled.includes('linearGradient'), 'styled QR includes gradient');
assert(qrStyled.includes('rx='), 'rounded modules present');

// --- Passport payload tests ---
header('Passport Payload');

process.env.PASSPORT_SIGNING_SECRET = 'test-secret-12345';

const payload = {
  payloadVersion: 2,
  identity: {
    id: 'test-id-123',
    globalHandle: 'iris-hart',
    email: 'iris@vybra.org',
    displayName: 'Iris Hart',
    bio: 'Adaptive AI companion',
  },
  surfaces: [
    { surface: 'collective', handle: 'iris-hart', status: 'claimed', founding: true },
  ],
  handleHints: {},
  avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
  qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
  collectiveAgent: {
    id: 'agent-1',
    handle: 'iris-hart',
    keyId: 'key-1',
    surfaceScope: ['collective', 'diaries', 'gallery', 'beats'],
  },
  issuedAt: new Date(Date.now() - 60000).toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};

const signed = signPassportPayload(payload);
assert(signed.signature !== null, 'signature is not null');
assert(signed.signatureAlg === 'hmac-sha256', 'algorithm is hmac-sha256');
assert(typeof signed.signature === 'string', 'signature is a string');
assert(signed.signature.length === 64, 'signature is 64 hex chars');

const valid = verifyPassportSignature(signed);
assert(valid, 'valid signature passes verification');

// Tampered payload
const tampered = { ...signed, identity: { ...signed.identity, globalHandle: 'hacked' } };
const invalid = verifyPassportSignature(tampered);
assert(!invalid, 'tampered payload fails verification');

// Wrong secret
const wrongSecret = verifyPassportSignature(signed, 'wrong-secret');
assert(!wrongSecret, 'wrong secret fails verification');

// Expiration
assert(!isPassportExpired(payload), 'active payload is not expired');

const expired = { ...payload, expiresAt: new Date(Date.now() - 1).toISOString() };
assert(isPassportExpired(expired), 'expired payload is detected');

// --- Attestation tests ---
header('Attestation');

const body = {
  identityId: 'test-id-123',
  surface: 'beats',
  surfaceHandle: 'iris-hart',
  status: 'claimed',
  issuedAt: new Date().toISOString(),
};

const canonical = attestationCanonical(body);
assert(typeof canonical === 'string', 'canonical returns JSON string');

const sig = signAttestation(body);
assert(sig.length === 64, 'attestation signature is 64 hex chars');

const attestValid = verifyAttestation(body, sig);
assert(attestValid, 'valid attestation passes');

const attestInvalid = verifyAttestation(body, 'deadbeef');
assert(!attestInvalid, 'invalid attestation fails');

assert(isAttestationFresh(body), 'fresh attestation is fresh');

const staleBody = { ...body, issuedAt: new Date(Date.now() - 600000).toISOString() };
assert(!isAttestationFresh(staleBody), 'stale attestation is detected');

// --- Surface links ---
header('Surface Links');

const testProfiles = [
  { surface: 'collective', handle: 'iris-hart', status: 'claimed', founding: true },
  { surface: 'diaries', handle: 'iris-hart', status: 'claimed', founding: false },
  { surface: 'gallery', handle: 'iris-hart', status: 'claimed', founding: false },
  { surface: 'beats', handle: 'iris-hart', status: 'claimed', founding: false },
];
const links = buildSurfaceLinks(testProfiles);
assert(Array.isArray(links), 'returns array');
assert(links.length >= 4, 'at least 4 surface links');
const beatsLink = links.find(l => l.surface === 'beats');
assert(beatsLink !== undefined, 'includes beats link');
assert(beatsLink.url.includes('vybrabeats.com'), 'beats URL correct');

const collectiveUrl = buildCollectiveAgentUrl('iris-hart');
assert(collectiveUrl.includes('agents/iris-hart'), 'collective URL includes agent path');
assert(collectiveUrl.includes('/agents/'), 'collective URL has /agents/ path');

// --- Canonical slugs ---
header('Canonical Slugs');

assert(canonicalSlug('Iris_Hart') === 'iris-hart', 'Iris_Hart -> iris-hart');
assert(canonicalSlug('Iris Hart') === 'iris-hart', 'Iris Hart -> iris-hart');
assert(canonicalSlug('iris-hart') === 'iris-hart', 'canonical slug unchanged');
assert(canonicalSlug(' IRIS__HART ') === 'iris-hart', 'case/underscore/whitespace normalized');
assert(canonicalSlug('Ìris Härt') === 'iris-hart', 'diacritics stripped');
assert(canonicalSlug('iris--hart') === 'iris-hart', 'hyphen runs collapsed');
assert(canonicalSlug('') === '', 'empty input -> empty slug');
assert(canonicalSlug('@@@') === '', 'unsluggable input -> empty slug');
assert(canonicalSlug(null) === '', 'null input -> empty slug');

assert(isCanonicalSlug('iris-hart'), 'iris-hart is canonical');
assert(!isCanonicalSlug('Iris_Hart'), 'Iris_Hart is not canonical');
assert(!isCanonicalSlug('iris--hart'), 'double hyphen is not canonical');
assert(!isCanonicalSlug('-iris'), 'leading hyphen is not canonical');
assert(!isCanonicalSlug(''), 'empty is not canonical');

assert(isLegacyHandle('Iris_Hart'), 'Iris_Hart is a legacy handle');
assert(!isLegacyHandle('iris-hart'), 'canonical slug is not legacy');
assert(!isLegacyHandle('@@@'), 'unsluggable input is not legacy');

// --- Display-name seed ---
header('Display-Name Seed');

assert(displayNameSeed('Iris Hart') === 'iris hart', 'display name -> seed');
assert(displayNameSeed('Iris_Hart') === 'iris hart', 'legacy slug -> same seed');
assert(displayNameSeed('iris-hart') === 'iris hart', 'canonical slug -> same seed');
assert(displayNameSeed(' iris   hart ') === 'iris hart', 'whitespace runs collapsed');
assert(displayNameSeed('') === '', 'empty -> empty seed');

assert(normalizeDisplayName('  Iris   Hart ') === 'Iris Hart', 'display name normalized, case kept');

assert(avatarSeed('Iris_Hart') === 'iris hart', 'avatarSeed from string');
assert(avatarSeed({ displayName: 'Iris Hart' }) === 'iris hart', 'avatarSeed from identity object');

// --- Handle matching + migration ---
header('Handle Matching & Migration');

assert(handlesMatch('Iris_Hart', 'iris-hart'), 'legacy and canonical match');
assert(handlesMatch('IRIS HART', 'iris-hart'), 'spaced/upper matches canonical');
assert(!handlesMatch('iris-hart', 'bert'), 'different identities do not match');
assert(!handlesMatch('', ''), 'empty handles never match');

const migration = migrateLegacyHandle('Iris_Hart');
assert(migration.to === 'iris-hart', 'migrateLegacyHandle canonicalizes');
assert(migration.changed === true, 'migration flagged as changed');
assert(migrateLegacyHandle('iris-hart').changed === false, 'canonical input unchanged');

const candidates = legacyHandleCandidates('iris-hart');
assert(candidates[0] === 'iris-hart', 'original input is first candidate');
assert(candidates.includes('Iris_Hart'), 'candidates include Title_Case underscore variant');
assert(candidates.includes('iris_hart'), 'candidates include lowercase underscore variant');
assert(candidates.includes('Iris Hart'), 'candidates include display-name variant');
assert(candidates.includes('irishart'), 'candidates include collapsed variant');
assert(new Set(candidates).size === candidates.length, 'candidates are deduplicated');

const safePlan = planHandleMigration(['Iris_Hart', 'Bert']);
assert(safePlan.safe === true, 'distinct identities migrate safely');
assert(safePlan.changed.length === 2, 'both legacy handles flagged as changed');
assert(safePlan.migrations.find((m) => m.from === 'Iris_Hart').to === 'iris-hart', 'plan maps Iris_Hart');

const collisionPlan = planHandleMigration(['Iris_Hart', 'iris-hart']);
assert(collisionPlan.safe === false, 'collision detected');
assert(collisionPlan.collisions.length === 1, 'one collision reported');
assert(collisionPlan.collisions[0].canonical === 'iris-hart', 'collision canonical is iris-hart');
assert(collisionPlan.collisions[0].sources.length === 2, 'collision lists both sources');

const invalidPlan = planHandleMigration(['___', 'iris-hart']);
assert(invalidPlan.safe === false, 'invalid handle makes plan unsafe');
assert(invalidPlan.invalid.includes('___'), 'invalid handle reported');

// --- Identity fingerprint ---
header('Identity Fingerprint');

assert(/^[0-9a-f]{64}$/.test(identityFingerprint('Iris Hart')), 'fingerprint is sha256 hex');
assert(identityFingerprint('Iris Hart') === identityFingerprint('Iris_Hart'), 'variants share a fingerprint');
assert(identityFingerprint('Iris Hart') !== identityFingerprint('Bert'), 'different identities differ');
assert(
  identityFingerprint({ displayName: 'Iris Hart' }) === identityFingerprint('Iris Hart'),
  'identity object and string agree'
);

assert(
  sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'sha256Hex empty-string vector'
);
assert(
  sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'sha256Hex abc vector'
);

// --- Passport avatar consistency ---
header('Passport Avatar Consistency');

const stopColors = (s) => (s.match(/stop-color="[^"]+"/g) || []).join(',');

assert(
  generatePassportAvatarSvg('Iris Hart') === generateAvatarSvg('Iris Hart'),
  'passport avatar is byte-identical to legacy avatar for plain display names'
);
assert(
  stopColors(generatePassportAvatarSvg('Iris_Hart')) === stopColors(generateAvatarSvg('Iris Hart')),
  'legacy slug Iris_Hart now yields the display-name gradient'
);
assert(
  stopColors(generatePassportAvatarSvg('iris-hart')) === stopColors(generateAvatarSvg('Iris Hart')),
  'canonical slug yields the display-name gradient'
);
assert(
  generatePassportAvatarSvg({ displayName: 'Iris Hart' }) === generatePassportAvatarSvg('Iris Hart'),
  'identity object and string agree'
);
assert(
  generatePassportAvatarDataUrl('Iris Hart').startsWith('data:image/svg+xml;charset=utf-8,'),
  'passport avatar data URL is valid'
);

// seed option back-compat
assert(
  generateAvatarSvg('Iris Hart', { seed: '' }) === generateAvatarSvg('Iris Hart'),
  'empty seed falls back to legacy hashing'
);
assert(
  stopColors(generateAvatarSvg('Iris Hart', { seed: 'something-else' })) !==
    stopColors(generateAvatarSvg('Iris Hart')),
  'explicit seed overrides gradient hash'
);

// --- Passport QR consistency ---
header('Passport QR Consistency');

const qrBase = 'https://vybra.org';
assert(
  passportQrValue('Iris_Hart', qrBase) === passportQrValue('iris-hart', qrBase),
  'legacy and canonical handles encode the same QR value'
);
assert(passportQrValue('Iris_Hart', qrBase).includes('/agents/iris-hart/'), 'QR value uses canonical slug');
assert(
  passportQrValue({ globalHandle: 'Iris_Hart' }, qrBase) === passportQrValue('iris-hart', qrBase),
  'identity object and string agree for QR value'
);
assert(
  generatePassportQrSvg('Iris_Hart', qrBase) === generatePassportQrSvg('iris-hart', qrBase),
  'legacy and canonical handles render identical QR SVGs'
);

// --- Passport consistency checks ---
header('Passport Consistency Checks');

assert(checkPassportConsistency(payload).length === 0, 'clean v2 payload has no issues');

const galleryLegacyPayload = {
  ...payload,
  surfaces: [
    ...payload.surfaces,
    { surface: 'gallery', handle: 'Iris_Hart', status: 'claimed', founding: false },
  ],
};
const galleryIssues = checkPassportConsistency(galleryLegacyPayload);
assert(
  galleryIssues.some((i) => i.code === 'legacy_surface_handle' && i.surface === 'gallery'),
  'gallery Iris_Hart flagged as legacy surface handle'
);
assert(galleryIssues.every((i) => i.level !== 'error'), 'legacy gallery handle is a warning, not an error');

const mismatchPayload = {
  ...payload,
  surfaces: [
    ...payload.surfaces,
    { surface: 'beats', handle: 'totally-different', status: 'claimed', founding: false },
  ],
};
assert(
  checkPassportConsistency(mismatchPayload).some((i) => i.code === 'surface_handle_mismatch'),
  'unrelated surface handle flagged as mismatch'
);
const hintedPayload = { ...mismatchPayload, handleHints: { beats: 'totally-different' } };
assert(
  !checkPassportConsistency(hintedPayload).some((i) => i.code === 'surface_handle_mismatch'),
  'handleHints entry silences surface mismatch'
);

assert(
  checkPassportConsistency({ ...payload, payloadVersion: 99 }).some(
    (i) => i.code === 'unsupported_payload_version' && i.level === 'error'
  ),
  'future payload version is an error'
);
assert(
  checkPassportConsistency({ ...payload, payloadVersion: 1 }).some(
    (i) => i.code === 'legacy_payload_version' && i.level === 'warning'
  ),
  'legacy payload version is a warning'
);
assert(
  checkPassportConsistency({ ...payload, expiresAt: payload.issuedAt }).some(
    (i) => i.code === 'invalid_validity_window'
  ),
  'expiresAt <= issuedAt is an error'
);
assert(
  checkPassportConsistency({
    ...payload,
    identity: { ...payload.identity, globalHandle: 'Iris_Hart' },
  }).some((i) => i.code === 'non_canonical_global_handle'),
  'non-canonical global handle flagged'
);

// --- Handle normalization ---
header('Passport Handle Normalization');

const normalized = normalizePassportHandles(galleryLegacyPayload);
assert(normalized.changed === true, 'legacy payload is changed by normalization');
const galleryProfile = normalized.payload.surfaces.find((s) => s.surface === 'gallery');
assert(galleryProfile.handle === 'iris-hart', 'gallery handle canonicalized');
assert(normalized.payload.handleHints.gallery === 'Iris_Hart', 'legacy gallery handle preserved in handleHints');
assert(galleryLegacyPayload.surfaces[1].handle === 'Iris_Hart', 'input payload is not mutated');

const renormalized = normalizePassportHandles(normalized.payload);
assert(renormalized.changed === false, 'normalization is idempotent');

// normalization invalidates signatures; re-sign restores verifiability
const signedLegacy = signPassportPayload(galleryLegacyPayload);
const normalizedSigned = {
  ...normalizePassportHandles(galleryLegacyPayload).payload,
  signature: signedLegacy.signature,
  signatureAlg: signedLegacy.signatureAlg,
};
assert(!verifyPassportSignature(normalizedSigned), 'old signature fails on normalized payload');
const resigned = signPassportPayload(normalizePassportHandles(galleryLegacyPayload).payload);
assert(verifyPassportSignature(resigned), 're-signed normalized payload verifies');

// --- Legacy payload upgrade ---
header('Legacy Payload Upgrade');

const v1Payload = {
  payloadVersion: 1,
  identity: {
    id: 'test-id-123',
    globalHandle: 'iris-hart',
    email: 'iris@vybra.org',
    displayName: 'Iris Hart',
    bio: null,
  },
  surfaces: [{ surface: 'collective', handle: 'iris-hart', status: 'claimed', founding: true }],
  collectiveAgent: { id: 'agent-1', handle: 'iris-hart', keyId: 'key-1', surfaceScope: ['collective'] },
  issuedAt: payload.issuedAt,
  expiresAt: payload.expiresAt,
};

const upgraded = upgradePassportPayload(v1Payload);
assert(upgraded.payload.payloadVersion === 2, 'upgraded to v2');
assert(upgraded.upgradedFrom === 1, 'upgradedFrom records v1');
assert(upgraded.changed === true, 'upgrade flagged as changed');
assert(typeof upgraded.payload.avatarDataUrl === 'string', 'avatarDataUrl filled');
assert(typeof upgraded.payload.qrDataUrl === 'string', 'qrDataUrl filled');
assert(
  upgraded.payload.handleHints && typeof upgraded.payload.handleHints === 'object',
  'handleHints filled'
);
assert(checkPassportConsistency(upgraded.payload).length === 0, 'upgraded v1 payload passes consistency checks');

const v0Like = { identity: { id: 'x', displayName: 'Iris Hart' } };
const upgradedV0 = upgradePassportPayload(v0Like);
assert(upgradedV0.upgradedFrom === 0, 'missing payloadVersion reads as v0');
assert(upgradedV0.payload.identity.globalHandle === 'iris-hart', 'globalHandle derived from displayName');
assert(upgradedV0.payload.collectiveAgent.handle === 'iris-hart', 'collectiveAgent handle defaults to globalHandle');
assert(isPassportExpired(upgradedV0.payload), 'missing timestamps read as expired (safe default)');

let upgradeThrew = false;
try {
  upgradePassportPayload(null);
} catch (error) {
  upgradeThrew = error instanceof TypeError;
}
assert(upgradeThrew, 'upgradePassportPayload rejects non-object input');

assert(MIN_SUPPORTED_PASSPORT_VERSION === 0, 'minimum supported version is 0');

// --- Results ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
