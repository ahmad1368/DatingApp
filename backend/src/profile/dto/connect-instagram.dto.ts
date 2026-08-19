import { IsString, MinLength } from 'class-validator';

export class ConnectInstagramDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
