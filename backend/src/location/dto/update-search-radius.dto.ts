import { IsInt, Max, Min } from 'class-validator';
import { MAX_SEARCH_RADIUS_KM, MIN_SEARCH_RADIUS_KM } from '../location.constants';

export class UpdateSearchRadiusDto {
  @IsInt()
  @Min(MIN_SEARCH_RADIUS_KM)
  @Max(MAX_SEARCH_RADIUS_KM)
  radiusKm!: number;
}
