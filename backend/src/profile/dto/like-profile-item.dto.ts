import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { MAX_ITEM_COMMENT_LENGTH, PROFILE_ITEM_TYPES } from '../profile-item-like.constants';

export class LikeProfileItemDto {
  @IsUUID()
  targetUserId!: string;

  @IsIn(PROFILE_ITEM_TYPES)
  itemType!: string;

  @IsOptional()
  @IsString()
  @Length(1, MAX_ITEM_COMMENT_LENGTH)
  comment?: string;
}
