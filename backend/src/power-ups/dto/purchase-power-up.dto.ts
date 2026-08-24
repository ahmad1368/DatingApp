import { IsOptional, IsString, IsUUID } from 'class-validator';

export class PurchasePowerUpDto {
  @IsString()
  powerUpId!: string;

  /** Required only for the "extend-match-timer" power-up. */
  @IsOptional()
  @IsUUID()
  matchId?: string;
}
