import { IsIn, IsUUID } from 'class-validator';
import { SWIPE_ACTIONS } from '../discovery.constants';

export class RecordSwipeDto {
  @IsUUID()
  targetUserId!: string;

  @IsIn(SWIPE_ACTIONS)
  action!: string;
}
