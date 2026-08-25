import { IsIn } from 'class-validator';
import { DISTANCE_UNITS, DistanceUnit } from '../location.constants';

export class SetDistanceUnitDto {
  @IsIn(DISTANCE_UNITS)
  unit!: DistanceUnit;
}
