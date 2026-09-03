import { IsBoolean } from 'class-validator';

export class SetActiveStatusVisibilityDto {
  @IsBoolean()
  enabled!: boolean;
}
