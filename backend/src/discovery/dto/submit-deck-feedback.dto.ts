import { IsIn } from 'class-validator';
import { DECK_FEEDBACK_RATINGS, DeckFeedbackRating } from '../discovery.constants';

export class SubmitDeckFeedbackDto {
  @IsIn(DECK_FEEDBACK_RATINGS)
  rating!: DeckFeedbackRating;
}
