import { IsString, Length } from 'class-validator';

export class SelectAvatarStyleDto {
  @IsString()
  @Length(1, 100)
  avatarStyleId!: string;
}
