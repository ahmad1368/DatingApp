import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_GRANT_EXPIRY_HOURS, MIN_GRANT_EXPIRY_HOURS } from '../vault.constants';

export class GrantVaultAccessDto {
  @IsUUID()
  matchId!: string;

  /** Omit for a permanent grant; otherwise the key expires after this many hours. */
  @IsOptional()
  @IsInt()
  @Min(MIN_GRANT_EXPIRY_HOURS)
  @Max(MAX_GRANT_EXPIRY_HOURS)
  expiresInHours?: number;
}
