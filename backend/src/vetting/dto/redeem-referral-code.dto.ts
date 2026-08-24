import { IsString, Length } from 'class-validator';
import { REFERRAL_CODE_LENGTH } from '../vetting.constants';

export class RedeemReferralCodeDto {
  @IsString()
  @Length(REFERRAL_CODE_LENGTH, REFERRAL_CODE_LENGTH)
  code!: string;
}
