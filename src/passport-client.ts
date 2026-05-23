import { env } from './env';
import {
  canonicalJson,
  isPassportExpired,
  signAttestation,
  verifyPassportSignature,
  type AttestationBody,
} from './passport';
import type { SignedPassportPayload, Surface } from './types';

export type Result<TValue, TError> =
  | { ok: true; value: TValue }
  | { ok: false; error: TError };

export type PassportError =
  | { kind: 'invalid_key'; status: 401 }
  | { kind: 'out_of_scope'; status: 403; detail?: unknown }
  | { kind: 'not_attached'; status: 409 }
  | { kind: 'rate_limited'; status: 429 }
  | { kind: 'bad_request'; status: 400; detail?: unknown }
  | { kind: 'upstream'; status: number; detail?: unknown }
  | { kind: 'signature_mismatch'; status: 502 }
  | { kind: 'expired'; status: 502 }
  | { kind: 'misconfigured'; status: 500; detail?: unknown };

export interface PassportSuccess {
  payload: SignedPassportPayload;
  signatureVerified: boolean;
  status: number;
}

export type AttestationError =
  | { kind: 'misconfigured'; status: 500; detail?: unknown }
  | { kind: 'bad_request'; status: 400; detail?: unknown }
  | { kind: 'rate_limited'; status: 429 }
  | { kind: 'upstream'; status: number; detail?: unknown };

export interface AttestationSuccess {
  body: AttestationBody;
  status: number;
}

export interface VerifyPassportOptions {
  url?: string;
  signingSecret?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface AttestToCollectiveOptions {
  url?: string;
  signingSecret?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  issuedAt?: string;
  signal?: AbortSignal;
}

function resolveFetch(override?: typeof fetch): typeof fetch | null {
  if (override) {
    return override;
  }

  const candidate = (globalThis as { fetch?: typeof fetch }).fetch;
  return typeof candidate === 'function' ? candidate.bind(globalThis) : null;
}

function deriveAttestUrl(verifyUrl: string): string | null {
  if (!/\/verify\/?$/i.test(verifyUrl)) {
    return null;
  }

  return verifyUrl.replace(/\/verify\/?$/i, '/attest');
}

function jsonHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  if (!merged.has('content-type')) {
    merged.set('content-type', 'application/json');
  }
  return merged;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function verifyPassport(
  apiKey: string,
  surface: Surface,
  options: VerifyPassportOptions = {}
): Promise<Result<PassportSuccess, PassportError>> {
  const url = options.url ?? env.passportUrl;
  if (!url) {
    return {
      ok: false,
      error: {
        kind: 'misconfigured',
        status: 500,
        detail: 'Set VYBRA_PASSPORT_URL before calling verifyPassport().',
      },
    };
  }

  const fetchImpl = resolveFetch(options.fetch);
  if (!fetchImpl) {
    return {
      ok: false,
      error: {
        kind: 'misconfigured',
        status: 500,
        detail: 'No fetch implementation is available.',
      },
    };
  }

  let response: Response;
  try {
    const headers = jsonHeaders(options.headers);
    headers.set('authorization', `Bearer ${apiKey}`);
    const requestInit: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify({ surface }),
      cache: 'no-store',
    };
    if (options.signal) {
      requestInit.signal = options.signal;
    }
    response = await fetchImpl(url, requestInit);
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'upstream',
        status: 502,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const parsed = (await parseJson(response)) as
    | { success: true; passport: SignedPassportPayload }
    | { success: false; error: string; details?: unknown }
    | null;

  if (!response.ok || !parsed?.success) {
    switch (response.status) {
      case 400:
        return { ok: false, error: { kind: 'bad_request', status: 400, detail: parsed } };
      case 401:
        return { ok: false, error: { kind: 'invalid_key', status: 401 } };
      case 403:
        return { ok: false, error: { kind: 'out_of_scope', status: 403, detail: parsed } };
      case 409:
        return { ok: false, error: { kind: 'not_attached', status: 409 } };
      case 429:
        return { ok: false, error: { kind: 'rate_limited', status: 429 } };
      default:
        return {
          ok: false,
          error: { kind: 'upstream', status: response.status, detail: parsed },
        };
    }
  }

  const passport = parsed.passport;
  if (isPassportExpired(passport)) {
    return { ok: false, error: { kind: 'expired', status: 502 } };
  }

  const signingSecret = options.signingSecret ?? env.passportSigningSecret;
  let signatureVerified = false;
  if (signingSecret) {
    if (
      !passport.signature ||
      passport.signatureAlg !== 'hmac-sha256' ||
      !verifyPassportSignature(passport, signingSecret)
    ) {
      return { ok: false, error: { kind: 'signature_mismatch', status: 502 } };
    }
    signatureVerified = true;
  }

  return {
    ok: true,
    value: {
      payload: passport,
      signatureVerified,
      status: response.status,
    },
  };
}

export async function attestToCollective(
  identityId: string,
  surface: Surface,
  surfaceHandle: string,
  status: AttestationBody['status'],
  options: AttestToCollectiveOptions = {}
): Promise<Result<AttestationSuccess, AttestationError>> {
  const verifyUrl = options.url ?? env.passportUrl;
  if (!verifyUrl) {
    return {
      ok: false,
      error: {
        kind: 'misconfigured',
        status: 500,
        detail: 'Set VYBRA_PASSPORT_URL before calling attestToCollective().',
      },
    };
  }

  const attestUrl = deriveAttestUrl(verifyUrl);
  if (!attestUrl) {
    return {
      ok: false,
      error: {
        kind: 'misconfigured',
        status: 500,
        detail: 'VYBRA_PASSPORT_URL must end in /verify to derive /attest.',
      },
    };
  }

  const signingSecret = options.signingSecret ?? env.passportSigningSecret;
  if (!signingSecret) {
    return {
      ok: false,
      error: {
        kind: 'misconfigured',
        status: 500,
        detail: 'Set VYBRA_PASSPORT_SIGNING_SECRET before calling attestToCollective().',
      },
    };
  }

  const fetchImpl = resolveFetch(options.fetch);
  if (!fetchImpl) {
    return {
      ok: false,
      error: {
        kind: 'misconfigured',
        status: 500,
        detail: 'No fetch implementation is available.',
      },
    };
  }

  const body: AttestationBody = {
    identityId,
    surface,
    surfaceHandle,
    status,
    issuedAt: options.issuedAt ?? new Date().toISOString(),
  };

  let response: Response;
  try {
    const headers = jsonHeaders(options.headers);
    headers.set('x-vybra-attestation-sig', signAttestation(body, signingSecret));
    const requestInit: RequestInit = {
      method: 'POST',
      headers,
      body: canonicalJson(body),
      cache: 'no-store',
    };
    if (options.signal) {
      requestInit.signal = options.signal;
    }
    response = await fetchImpl(attestUrl, requestInit);
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'upstream',
        status: 502,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (!response.ok) {
    const detail = await parseJson(response);
    switch (response.status) {
      case 400:
        return { ok: false, error: { kind: 'bad_request', status: 400, detail } };
      case 429:
        return { ok: false, error: { kind: 'rate_limited', status: 429 } };
      default:
        return { ok: false, error: { kind: 'upstream', status: response.status, detail } };
    }
  }

  return {
    ok: true,
    value: {
      body,
      status: response.status,
    },
  };
}
