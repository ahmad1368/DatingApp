import { IsPhoneNumber, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, {
    message: 'phoneNumber must be a valid phone number in international format (e.g. +14155552671)',
  })
  phoneNumber!: string;

  @Length(4, 8, { message: 'code must be between 4 and 8 digits' })
  code!: string;
}
