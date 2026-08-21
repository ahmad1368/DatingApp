import { IsUUID } from 'class-validator';

export class UnpairDto {
  @IsUUID()
  partnerUserId!: string;
}
