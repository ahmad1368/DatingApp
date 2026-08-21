import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';

export interface RecordVisitResult {
  recorded: boolean;
}

export interface ProfileVisitorView {
  visitorId: string;
  visitorName: string | null;
  visitorPhotoUrl: string | null;
  visitedAt: string;
}

@Injectable()
export class ProfileVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records that `visitorId` opened `visitedUserId`'s profile. Anonymous
   * browsing (premium-only) simply skips the write - there's nothing to
   * later "hide", so there's no footprint to leak.
   */
  async recordVisit(
    visitorId: string,
    visitedUserId: string,
    anonymous: boolean,
  ): Promise<RecordVisitResult> {
    if (visitorId === visitedUserId) {
      throw new BadRequestException('You cannot visit your own profile.');
    }

    if (anonymous) {
      const visitor = await this.prisma.user.findUnique({ where: { id: visitorId } });
      if (!visitor?.isPremium) {
        throw new ForbiddenException('Browsing anonymously is a premium feature.');
      }
      return { recorded: false };
    }

    const visited = await this.prisma.user.findUnique({ where: { id: visitedUserId } });
    if (!visited) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.profileVisit.create({ data: { visitorId, visitedUserId } });
    return { recorded: true };
  }

  /** Premium "profile visitors": everyone who viewed you, most recent first, one entry per visitor. */
  async listVisitors(userId: string): Promise<ProfileVisitorView[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (!user.isPremium) {
      throw new ForbiddenException('Seeing your profile visitors is a premium feature.');
    }

    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const visits = await this.prisma.profileVisit.findMany({
      where: { visitedUserId: userId, visitorId: { notIn: blockedIds } },
      orderBy: { createdAt: 'desc' },
    });

    const seenVisitorIds = new Set<string>();
    const latestVisitByVisitor = visits.filter((visit) => {
      if (seenVisitorIds.has(visit.visitorId)) {
        return false;
      }
      seenVisitorIds.add(visit.visitorId);
      return true;
    });

    if (latestVisitByVisitor.length === 0) {
      return [];
    }

    const visitors = await this.prisma.user.findMany({
      where: { id: { in: [...seenVisitorIds] } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const visitorById = new Map(visitors.map((visitor) => [visitor.id, visitor]));

    return latestVisitByVisitor.map((visit) => {
      const visitor = visitorById.get(visit.visitorId);
      return {
        visitorId: visit.visitorId,
        visitorName: visitor?.name ?? null,
        visitorPhotoUrl: visitor?.profilePhotoUrl ?? null,
        visitedAt: visit.createdAt.toISOString(),
      };
    });
  }
}
