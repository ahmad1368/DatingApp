export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  sendOtp(phoneNumber: string, code: string): Promise<void>;
}
