import { env } from './env';
import type { PassportPayload, SignedPassportPayload, Surface } from './types';

export const PASSPORT_PAYLOAD_VERSION = 2;
export const PASSPORT_TTL_SECONDS = 5 * 60;
export const ATTESTATION_MAX_AGE_SECONDS = 5 * 60;

export interface AttestationBody {
  identityId: string;
  surface: Surface;
  surfaceHandle: string;
  status: 'claimed' | 'pending';
  issuedAt: string;
}

const SHA256_INITIAL_STATE = new Uint32Array([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function rightRotate(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function toUtf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function sha256(message: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message, 0);
  padded[message.length] = 0x80;

  const bitLength = message.length * 8;
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  padded[padded.length - 8] = (high >>> 24) & 0xff;
  padded[padded.length - 7] = (high >>> 16) & 0xff;
  padded[padded.length - 6] = (high >>> 8) & 0xff;
  padded[padded.length - 5] = high & 0xff;
  padded[padded.length - 4] = (low >>> 24) & 0xff;
  padded[padded.length - 3] = (low >>> 16) & 0xff;
  padded[padded.length - 2] = (low >>> 8) & 0xff;
  padded[padded.length - 1] = low & 0xff;

  const state = new Uint32Array(SHA256_INITIAL_STATE);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      const byte0 = padded[base]!;
      const byte1 = padded[base + 1]!;
      const byte2 = padded[base + 2]!;
      const byte3 = padded[base + 3]!;
      schedule[index] =
        (byte0 << 24) |
        (byte1 << 16) |
        (byte2 << 8) |
        byte3;
    }

    for (let index = 16; index < 64; index += 1) {
      const word15 = schedule[index - 15]!;
      const word2 = schedule[index - 2]!;
      const word16 = schedule[index - 16]!;
      const word7 = schedule[index - 7]!;
      const s0 =
        rightRotate(word15, 7) ^
        rightRotate(word15, 18) ^
        (word15 >>> 3);
      const s1 =
        rightRotate(word2, 17) ^
        rightRotate(word2, 19) ^
        (word2 >>> 10);
      schedule[index] = (word16 + s0 + word7 + s1) >>> 0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + ch + SHA256_K[index]! + schedule[index]!) >>> 0;
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < state.length; index += 1) {
    const word = state[index]!;
    output[index * 4] = (word >>> 24) & 0xff;
    output[index * 4 + 1] = (word >>> 16) & 0xff;
    output[index * 4 + 2] = (word >>> 8) & 0xff;
    output[index * 4 + 3] = word & 0xff;
  }

  return output;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hmacSha256(secret: string, message: string): string {
  const blockSize = 64;
  let key = toUtf8Bytes(secret);
  if (key.length > blockSize) {
    key = sha256(key);
  }

  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(key, 0);

  const innerPad = new Uint8Array(blockSize);
  const outerPad = new Uint8Array(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    const keyByte = paddedKey[index]!;
    innerPad[index] = keyByte ^ 0x36;
    outerPad[index] = keyByte ^ 0x5c;
  }

  const innerHash = sha256(concatBytes(innerPad, toUtf8Bytes(message)));
  return toHex(sha256(concatBytes(outerPad, innerHash)));
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length || left.length % 2 !== 0) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 2) {
    const leftByte = Number.parseInt(left.slice(index, index + 2), 16);
    const rightByte = Number.parseInt(right.slice(index, index + 2), 16);
    if (Number.isNaN(leftByte) || Number.isNaN(rightByte)) {
      return false;
    }
    mismatch |= leftByte ^ rightByte;
  }

  return mismatch === 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const record = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        const normalized = canonicalize(record[key]);
        if (normalized !== undefined) {
          sorted[key] = normalized;
        }
      }
      return sorted;
    }
  }

  return value;
}

function normalizeNow(now: Date | number | string): number {
  if (typeof now === 'number') {
    return now;
  }

  return now instanceof Date ? now.getTime() : new Date(now).getTime();
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sanitizeForFederation(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32);

  return cleaned.length >= 3 ? cleaned : '';
}

export function signPassportPayload(
  payload: PassportPayload,
  secret = env.passportSigningSecret
): SignedPassportPayload {
  if (!secret) {
    return { ...payload, signature: null, signatureAlg: null };
  }

  const signature = hmacSha256(secret, canonicalJson(payload));
  return { ...payload, signature, signatureAlg: 'hmac-sha256' };
}

export function verifyPassportSignature(
  signed: SignedPassportPayload,
  secret = env.passportSigningSecret
): boolean {
  if (!secret || !signed.signature || signed.signatureAlg !== 'hmac-sha256') {
    return false;
  }

  const { signature, signatureAlg: _signatureAlg, ...payload } = signed;
  const expected = hmacSha256(secret, canonicalJson(payload));
  return safeEqualHex(signature, expected);
}

export function isPassportExpired(
  payload: Pick<PassportPayload, 'expiresAt'>,
  now: Date | number | string = Date.now()
): boolean {
  const expiresAt = new Date(payload.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= normalizeNow(now);
}

export function attestationCanonical(body: AttestationBody): string {
  return canonicalJson(body);
}

export function signAttestation(body: AttestationBody, secret = env.passportSigningSecret): string {
  return secret ? hmacSha256(secret, attestationCanonical(body)) : '';
}

export function verifyAttestation(
  body: AttestationBody,
  signatureHex: string,
  secret = env.passportSigningSecret
): boolean {
  if (!secret || !signatureHex) {
    return false;
  }

  const expected = signAttestation(body, secret);
  return safeEqualHex(signatureHex, expected);
}

export function isAttestationFresh(
  body: Pick<AttestationBody, 'issuedAt'>,
  now: Date | number | string = Date.now(),
  maxAgeSeconds = ATTESTATION_MAX_AGE_SECONDS
): boolean {
  const issuedAt = new Date(body.issuedAt).getTime();
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const ageMs = normalizeNow(now) - issuedAt;
  return ageMs >= 0 && ageMs <= maxAgeSeconds * 1000;
}
