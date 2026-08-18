import { IsLatitude, IsLongitude } from 'class-validator';

export class SetPassportLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}
