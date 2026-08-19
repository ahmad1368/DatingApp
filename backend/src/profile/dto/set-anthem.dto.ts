import { IsString, MinLength } from 'class-validator';

export class SetAnthemDto {
  @IsString()
  @MinLength(1)
  trackId!: string;
}
