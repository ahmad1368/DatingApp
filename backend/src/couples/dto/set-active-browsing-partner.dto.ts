import { IsOptional, IsUUID } from 'class-validator';

export class SetActiveBrowsingPartnerDto {
  /** Omit (or send null) to switch back to solo browsing. */
  @IsOptional()
  @IsUUID()
  partnerId?: string;
}
