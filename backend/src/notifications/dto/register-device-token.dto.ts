import { IsIn, IsNotEmpty, IsString, Length } from 'class-validator';
import { DEVICE_PLATFORMS } from '../notifications.constants';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  token!: string;

  @IsIn(DEVICE_PLATFORMS)
  platform!: string;
}
