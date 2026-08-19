import { IsBoolean } from 'class-validator';

export class SetIncognitoModeDto {
  @IsBoolean()
  enabled!: boolean;
}
