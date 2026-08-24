import { IsBoolean } from 'class-validator';

export class SetJointBrowsingModeDto {
  @IsBoolean()
  enabled!: boolean;
}
