import { IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @IsPhoneNumber(undefined, {
    message: 'phoneNumber must be a valid phone number in international format (e.g. +14155552671)',
  })
  phoneNumber!: string;
}
