import { IsBoolean } from 'class-validator';

export class SetHideFromMutualConnectionsDto {
  @IsBoolean()
  enabled!: boolean;
}
