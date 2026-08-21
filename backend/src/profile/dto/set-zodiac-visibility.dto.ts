import { IsBoolean } from 'class-validator';

export class SetZodiacVisibilityDto {
  @IsBoolean()
  showZodiacOnProfile!: boolean;
}
