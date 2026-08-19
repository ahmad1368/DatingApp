import { IsUUID } from 'class-validator';

export class InviteCouplePairingDto {
  @IsUUID()
  partnerUserId!: string;
}
