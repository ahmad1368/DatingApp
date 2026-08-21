import { IsIn, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { EVENT_CATEGORIES } from '../events.constants';

export class CreateEventDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsString()
  @Length(1, 200)
  location!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsIn(EVENT_CATEGORIES)
  category!: string;

  @IsISO8601()
  startsAt!: string;
}
