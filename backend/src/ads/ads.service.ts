import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AD_CREATIVES, AdCreative } from './ads.constants';

/**
 * Ad-free browsing is the whole point of this service: an active paid-tier
 * subscriber (User.isPremium - kept in sync by SubscriptionsService) never
 * gets a creative back, across every surface (Web, iOS, Android) that calls
 * [getNextAd] before rendering a native/display/sponsored slot.
 */
@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async isAdFree(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isPremium: true } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user.isPremium;
  }

  async getEligibility(userId: string): Promise<{ adFree: boolean }> {
    return { adFree: await this.isAdFree(userId) };
  }

  /**
   * The next ad creative for a given slot (e.g. a position in the discovery
   * deck or a screen's ad banner), or null if the caller is ad-free.
   * Rotation is deterministic by slotIndex rather than random, so the same
   * slot always renders predictably and this stays easy to test.
   */
  async getNextAd(userId: string, slotIndex = 0): Promise<AdCreative | null> {
    if (await this.isAdFree(userId)) {
      return null;
    }
    return AD_CREATIVES[slotIndex % AD_CREATIVES.length];
  }
}
