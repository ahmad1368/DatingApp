import { IsNotEmpty, IsString, Length } from 'class-validator';

export class AddProfilePhotoDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  mediaUrl!: string;
}
