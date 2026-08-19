import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  KINK_TAGS,
  MAX_KINK_TAG_SELECTIONS,
  MAX_RELATIONSHIP_DESIRE_SELECTIONS,
  RELATIONSHIP_DESIRES,
  RELATIONSHIP_STRUCTURES,
} from '../relationship-profile.constants';

export class SetRelationshipProfileDto {
  @IsOptional()
  @IsIn(RELATIONSHIP_STRUCTURES)
  relationshipStructure?: string;

  @IsBoolean()
  showRelationshipStructureOnProfile!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_KINK_TAG_SELECTIONS)
  @IsIn(KINK_TAGS, { each: true })
  kinkTags!: string[];

  @IsBoolean()
  showKinkTagsOnProfile!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_RELATIONSHIP_DESIRE_SELECTIONS)
  @IsIn(RELATIONSHIP_DESIRES, { each: true })
  relationshipDesires!: string[];

  @IsBoolean()
  showRelationshipDesiresOnProfile!: boolean;
}
