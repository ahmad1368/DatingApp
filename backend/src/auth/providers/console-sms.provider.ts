import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from '../interfaces/sms-provider.interface';

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phoneNumber}: ${code}`);
  }
}
