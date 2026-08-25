import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import { calculateAge } from '../discovery/utils/age';
import {
  COMMUNITY_GROUPS,
  COMMUNITY_GROUP_MEMBER_LIMIT,
  CommunityGroup,
  findCommunityGroup,
  MAX_COMMUNITY_GROUP_MEMBERSHIPS,
} from './community-groups.constants';

export interface CommunityGroupMemberView {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
}

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

  /**
   * Browses other members of one community group (e.g. everyone in
   * "Outdoor Adventurers"), so users can find people active within a
   * specific niche rather than only their broader swipe deck - excludes
   * blocked users, incomplete profiles, and snoozed members the same way
   * DiscoveryService.getDeck does.
   */
  async getGroupMembers(userId: string, groupId: string): Promise<CommunityGroupMemberView[]> {
    if (!findCommunityGroup(groupId)) {
      throw new BadRequestException(`Unknown community group: ${groupId}`);
    }

    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const now = new Date();
    const members = await this.prisma.user.findMany({
      where: {
        id: { notIn: [userId, ...blockedIds] },
        communityGroupIds: { has: groupId },
        onboardingCompletedAt: { not: null },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      take: COMMUNITY_GROUP_MEMBER_LIMIT,
    });

    return members.map((member) => ({
      id: member.id,
      name: member.name,
      age: member.dateOfBirth ? calculateAge(member.dateOfBirth, now) : null,
      profilePhotoUrl: member.profilePhotoUrl,
    }));
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
