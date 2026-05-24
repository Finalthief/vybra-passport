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

// --- Results ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
