export const APPLE_TOKEN_VERIFIER = Symbol('APPLE_TOKEN_VERIFIER');

export interface AppleProfile {
  appleUserId: string;
  email: string | null;
  isPrivateEmail: boolean;
}

export interface AppleTokenVerifier {
  verify(identityToken: string): Promise<AppleProfile>;
}
