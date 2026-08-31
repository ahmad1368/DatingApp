import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { GAME_TYPES, GameType, TWO_TRUTHS_STATEMENT_COUNT } from '../messaging.constants';

export class SendGameCardDto {
  @IsIn(GAME_TYPES)
  gameType!: GameType;

  // Required for TRIVIA and TWENTY_ONE_QUESTIONS - the curated card to send.
  @ValidateIf((dto: SendGameCardDto) => dto.gameType !== 'TWO_TRUTHS_AND_A_LIE')
  @IsString()
  promptId?: string;

  // Required for TWO_TRUTHS_AND_A_LIE - the sender's own 3 statements.
  @ValidateIf((dto: SendGameCardDto) => dto.gameType === 'TWO_TRUTHS_AND_A_LIE')
  @ArrayMinSize(TWO_TRUTHS_STATEMENT_COUNT)
  @ArrayMaxSize(TWO_TRUTHS_STATEMENT_COUNT)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  statements?: string[];

  // Required for TWO_TRUTHS_AND_A_LIE - which of `statements` is the lie.
  @ValidateIf((dto: SendGameCardDto) => dto.gameType === 'TWO_TRUTHS_AND_A_LIE')
  @IsInt()
  @Min(0)
  @Max(TWO_TRUTHS_STATEMENT_COUNT - 1)
  lieIndex?: number;
}
