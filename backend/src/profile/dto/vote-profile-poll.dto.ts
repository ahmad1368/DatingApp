import { IsInt, IsUUID, Min } from 'class-validator';

export class VoteProfilePollDto {
  @IsUUID()
  targetUserId!: string;

  @IsInt()
  @Min(0)
  optionIndex!: number;
}
