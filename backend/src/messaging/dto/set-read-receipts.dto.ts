import { IsBoolean } from 'class-validator';

export class SetReadReceiptsDto {
  @IsBoolean()
  enabled!: boolean;
}
