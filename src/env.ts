export interface VybraRuntimeEnv {
  VYBRA_PASSPORT_URL?: string;
  VYBRA_PASSPORT_SIGNING_SECRET?: string;
  VYBRA_SITE_URL?: string;
  PASSPORT_SIGNING_SECRET?: string;
  PUBLIC_SITE_URL?: string;
}

export interface VybraEnvSnapshot {
  passportUrl: string;
  passportSigningSecret: string;
  siteUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function normalize(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readProcessEnv(): VybraRuntimeEnv {
  const maybeProcess = (globalThis as Record<string, unknown>).process;
  if (!isRecord(maybeProcess)) {
    return {};
  }

  const maybeEnv = maybeProcess.env;
  if (!isRecord(maybeEnv)) {
    return {};
  }

  return maybeEnv as VybraRuntimeEnv;
}

function readInjectedEnv(): VybraRuntimeEnv {
  const injected = (globalThis as Record<string, unknown>).__VYBRA_ENV__;
  return isRecord(injected) ? (injected as VybraRuntimeEnv) : {};
}

function readLocationOrigin(): string | undefined {
  const maybeLocation = (globalThis as Record<string, unknown>).location;
  if (!isRecord(maybeLocation)) {
    return undefined;
  }

  const origin = maybeLocation.origin;
  return isString(origin) ? normalize(origin) : undefined;
}

function pickFirst(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = normalize(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export function getOptionalEnv(name: keyof VybraRuntimeEnv | string, fallback = ''): string {
  const processEnv = readProcessEnv();
  const injectedEnv = readInjectedEnv();
  return pickFirst(processEnv[name as keyof VybraRuntimeEnv], injectedEnv[name as keyof VybraRuntimeEnv], fallback);
}

export function getRequiredEnv(name: keyof VybraRuntimeEnv | string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }

  return value;
}

export const env = {
  get passportUrl(): string {
    return pickFirst(getOptionalEnv('VYBRA_PASSPORT_URL'), getOptionalEnv('PASSPORT_URL'));
  },
  get passportSigningSecret(): string {
    return pickFirst(
      getOptionalEnv('VYBRA_PASSPORT_SIGNING_SECRET'),
      getOptionalEnv('PASSPORT_SIGNING_SECRET')
    );
  },
  get siteUrl(): string {
    return pickFirst(getOptionalEnv('VYBRA_SITE_URL'), getOptionalEnv('PUBLIC_SITE_URL'), readLocationOrigin());
  },
};

export function getVybraEnvSnapshot(): VybraEnvSnapshot {
  return {
    passportUrl: env.passportUrl,
    passportSigningSecret: env.passportSigningSecret,
    siteUrl: env.siteUrl,
  };
}
