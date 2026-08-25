export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailProvider {
  sendVerificationCode(email: string, code: string): Promise<void>;
}
