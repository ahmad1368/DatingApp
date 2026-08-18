export const GOOGLE_TOKEN_VERIFIER = Symbol('GOOGLE_TOKEN_VERIFIER');

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}
