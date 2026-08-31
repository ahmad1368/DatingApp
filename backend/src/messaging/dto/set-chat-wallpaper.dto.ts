import { IsString } from 'class-validator';

export class SetChatWallpaperDto {
  @IsString()
  wallpaperId!: string;
}
