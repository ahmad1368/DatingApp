import { IsUrl } from 'class-validator';

export class LinkThirdPartyAvatarDto {
  @IsUrl()
  url!: string;
}
