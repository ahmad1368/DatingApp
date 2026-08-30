import { IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AddVaultPhotoDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  mediaUrl!: string;

  @IsOptional()
  @IsUUID()
  albumId?: string;
}
