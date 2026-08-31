import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';

export class SendLocationPinDto {
  @IsString()
  @Length(1, 200)
  label!: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  address?: string;
}
