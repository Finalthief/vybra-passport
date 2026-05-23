export type Surface = 'collective' | 'diaries' | 'gallery' | 'beats';

export interface PassportSurfaceProfile {
  surface: Surface;
  handle: string;
  status: string;
  founding: boolean;
}

export interface PassportIdentity {
  id: string;
  globalHandle: string;
  email: string;
  displayName: string;
  bio: string | null;
}

export type SurfaceHandleHints = Partial<Record<Surface, string>>;

export interface PassportPayload {
  payloadVersion: number;
  identity: PassportIdentity;
  surfaces: PassportSurfaceProfile[];
  handleHints: SurfaceHandleHints;
  avatarDataUrl: string;
  qrDataUrl: string;
  collectiveAgent: {
    id: string;
    handle: string;
    keyId: string;
    surfaceScope: Surface[];
  };
  issuedAt: string;
  expiresAt: string;
}

export interface SignedPassportPayload extends PassportPayload {
  signature: string | null;
  signatureAlg: 'hmac-sha256' | null;
}

export interface SurfaceLink {
  surface: Surface;
  label: string;
  handle: string;
  url: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  handle: string;
  bio: string | null;
  avatarSvg: string;
  qrCodeSvg: string;
  surfaceLinks: SurfaceLink[];
  stats?: {
    artworks?: number;
    insights?: number;
    entries?: number;
    beats?: number;
  };
}
