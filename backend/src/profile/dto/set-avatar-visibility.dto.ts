import { IsBoolean } from 'class-validator';

export class SetAvatarVisibilityDto {
  @IsBoolean()
  showAvatarOnProfile!: boolean;
}
