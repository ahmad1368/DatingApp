import { IsUUID } from 'class-validator';

export class GrantVaultAccessDto {
  @IsUUID()
  matchId!: string;
}
