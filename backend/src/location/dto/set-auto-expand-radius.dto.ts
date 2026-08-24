import { IsBoolean } from 'class-validator';

export class SetAutoExpandRadiusDto {
  @IsBoolean()
  enabled!: boolean;
}
