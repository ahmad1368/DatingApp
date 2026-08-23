import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMMUNITY_GROUPS,
  CommunityGroup,
  findCommunityGroup,
  MAX_COMMUNITY_GROUP_MEMBERSHIPS,
} from './community-groups.constants';

@Injectable()
export class CommunityGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  getGroups(): CommunityGroup[] {
    return COMMUNITY_GROUPS;
  }

  async getMyGroups(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communityGroupIds: true },
    });
    return user?.communityGroupIds ?? [];
  }

  async joinGroup(userId: string, groupId: string): Promise<string[]> {
    if (!findCommunityGroup(groupId)) {
      throw new BadRequestException(`Unknown community group: ${groupId}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communityGroupIds: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.communityGroupIds.includes(groupId)) {
      return user.communityGroupIds;
    }
    if (user.communityGroupIds.length >= MAX_COMMUNITY_GROUP_MEMBERSHIPS) {
      throw new BadRequestException(
        `You can only join up to ${MAX_COMMUNITY_GROUP_MEMBERSHIPS} community groups.`,
      );
    }

    const communityGroupIds = [...user.communityGroupIds, groupId];
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { communityGroupIds },
      select: { communityGroupIds: true },
    });
    return updated.communityGroupIds;
  }

  async leaveGroup(userId: string, groupId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communityGroupIds: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const communityGroupIds = user.communityGroupIds.filter((id) => id !== groupId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { communityGroupIds },
      select: { communityGroupIds: true },
    });
    return updated.communityGroupIds;
  }
}
