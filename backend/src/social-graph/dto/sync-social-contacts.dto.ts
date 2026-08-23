import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SyncSocialContactsDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  contacts!: string[];
}
