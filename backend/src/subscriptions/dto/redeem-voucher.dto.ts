import { IsString } from 'class-validator';

export class RedeemVoucherDto {
  @IsString()
  code!: string;
}
