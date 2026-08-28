import { IsIn, IsString, Length } from 'class-validator';
import { RESERVATION_PROVIDERS } from '../messaging.constants';

export class SendReservationDto {
  @IsIn(RESERVATION_PROVIDERS)
  provider!: string;

  @IsString()
  @Length(1, 200)
  query!: string;
}
