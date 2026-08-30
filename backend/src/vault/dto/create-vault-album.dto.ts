import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateVaultAlbumDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;
}
