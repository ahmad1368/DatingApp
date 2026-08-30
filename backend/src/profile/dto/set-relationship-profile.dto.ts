import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import {
  BOUNDARY_TAGS,
  KINK_TAGS,
  MAX_BOUNDARY_TAG_SELECTIONS,
  MAX_COMMUNICATION_BOUNDARIES_LENGTH,
  MAX_CUSTOM_RELATIONSHIP_INTENT_LENGTH,
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

  @IsOptional()
  @IsString()
  @Length(1, MAX_CUSTOM_RELATIONSHIP_INTENT_LENGTH)
  customRelationshipIntent?: string;

  @IsBoolean()
  showCustomRelationshipIntentOnProfile!: boolean;

  @IsOptional()
  @IsString()
  @Length(1, MAX_COMMUNICATION_BOUNDARIES_LENGTH)
  communicationBoundaries?: string;

  @IsBoolean()
  showCommunicationBoundariesOnProfile!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_BOUNDARY_TAG_SELECTIONS)
  @IsIn(BOUNDARY_TAGS, { each: true })
  boundaryTags!: string[];

  @IsBoolean()
  showBoundaryTagsOnProfile!: boolean;
}
