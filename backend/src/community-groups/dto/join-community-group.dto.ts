import { IsString } from 'class-validator';

export class JoinCommunityGroupDto {
  @IsString()
  groupId!: string;
}
