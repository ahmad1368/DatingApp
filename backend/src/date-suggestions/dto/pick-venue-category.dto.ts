import { IsIn } from 'class-validator';
import { VENUE_CATEGORY_IDS } from '../date-suggestions.constants';

export class PickVenueCategoryDto {
  @IsIn(VENUE_CATEGORY_IDS)
  categoryId!: string;
}
