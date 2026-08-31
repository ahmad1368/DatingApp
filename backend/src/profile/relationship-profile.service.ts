import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetRelationshipProfileDto } from './dto/set-relationship-profile.dto';

export interface RelationshipProfileResult {
  relationshipStructure: string | null;
  showRelationshipStructureOnProfile: boolean;
  kinkTags: string[];
  showKinkTagsOnProfile: boolean;
  relationshipDesires: string[];
  showRelationshipDesiresOnProfile: boolean;
  customRelationshipIntent: string | null;
  showCustomRelationshipIntentOnProfile: boolean;
  communicationBoundaries: string | null;
  showCommunicationBoundariesOnProfile: boolean;
  boundaryTags: string[];
  showBoundaryTagsOnProfile: boolean;
}

@Injectable()
export class RelationshipProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getRelationshipProfile(userId: string): Promise<RelationshipProfileResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        relationshipStructure: true,
        showRelationshipStructureOnProfile: true,
        kinkTags: true,
        showKinkTagsOnProfile: true,
        relationshipDesires: true,
        showRelationshipDesiresOnProfile: true,
        customRelationshipIntent: true,
        showCustomRelationshipIntentOnProfile: true,
        communicationBoundaries: true,
        showCommunicationBoundariesOnProfile: true,
        boundaryTags: true,
        showBoundaryTagsOnProfile: true,
      },
    });

    return {
      relationshipStructure: user?.relationshipStructure ?? null,
      showRelationshipStructureOnProfile: user?.showRelationshipStructureOnProfile ?? true,
      kinkTags: user?.kinkTags ?? [],
      showKinkTagsOnProfile: user?.showKinkTagsOnProfile ?? true,
      relationshipDesires: user?.relationshipDesires ?? [],
      showRelationshipDesiresOnProfile: user?.showRelationshipDesiresOnProfile ?? true,
      customRelationshipIntent: user?.customRelationshipIntent ?? null,
      showCustomRelationshipIntentOnProfile: user?.showCustomRelationshipIntentOnProfile ?? true,
      communicationBoundaries: user?.communicationBoundaries ?? null,
      showCommunicationBoundariesOnProfile: user?.showCommunicationBoundariesOnProfile ?? true,
      boundaryTags: user?.boundaryTags ?? [],
      showBoundaryTagsOnProfile: user?.showBoundaryTagsOnProfile ?? true,
    };
  }

  async setRelationshipProfile(
    userId: string,
    dto: SetRelationshipProfileDto,
  ): Promise<RelationshipProfileResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        relationshipStructure: dto.relationshipStructure ?? null,
        showRelationshipStructureOnProfile: dto.showRelationshipStructureOnProfile,
        kinkTags: dto.kinkTags,
        showKinkTagsOnProfile: dto.showKinkTagsOnProfile,
        relationshipDesires: dto.relationshipDesires,
        showRelationshipDesiresOnProfile: dto.showRelationshipDesiresOnProfile,
        customRelationshipIntent: dto.customRelationshipIntent ?? null,
        showCustomRelationshipIntentOnProfile: dto.showCustomRelationshipIntentOnProfile,
        communicationBoundaries: dto.communicationBoundaries ?? null,
        showCommunicationBoundariesOnProfile: dto.showCommunicationBoundariesOnProfile,
        boundaryTags: dto.boundaryTags,
        showBoundaryTagsOnProfile: dto.showBoundaryTagsOnProfile,
      },
    });

    return {
      relationshipStructure: user.relationshipStructure,
      showRelationshipStructureOnProfile: user.showRelationshipStructureOnProfile,
      kinkTags: user.kinkTags,
      showKinkTagsOnProfile: user.showKinkTagsOnProfile,
      relationshipDesires: user.relationshipDesires,
      showRelationshipDesiresOnProfile: user.showRelationshipDesiresOnProfile,
      customRelationshipIntent: user.customRelationshipIntent,
      showCustomRelationshipIntentOnProfile: user.showCustomRelationshipIntentOnProfile,
      communicationBoundaries: user.communicationBoundaries,
      showCommunicationBoundariesOnProfile: user.showCommunicationBoundariesOnProfile,
      boundaryTags: user.boundaryTags,
      showBoundaryTagsOnProfile: user.showBoundaryTagsOnProfile,
    };
  }
}
