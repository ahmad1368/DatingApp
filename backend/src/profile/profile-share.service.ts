import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { calculateAge } from '../discovery/utils/age';

export interface ProfileShareLinkResult {
  shareToken: string;
}

export interface SharedProfileView {
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  interests: string[];
}

@Injectable()
export class ProfileShareService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Direct Profile Link & QR Code Sharing": mints (or reuses) an opaque
   * share token for this user's profile card, so it can be shared outside
   * the app as a link or QR code - see [getSharedProfile]'s public view.
   */
  async getOrCreateShareLink(userId: string): Promise<ProfileShareLinkResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (user.profileShareToken) {
      return { shareToken: user.profileShareToken };
    }

    const shareToken = randomUUID();
    await this.prisma.user.update({ where: { id: userId }, data: { profileShareToken: shareToken } });

    return { shareToken };
  }

  /**
   * Public read for a shared profile link - see getOrCreateShareLink. No
   * auth: this is meant to be opened by whoever the link/QR code was shared
   * with, who may not have an account at all.
   */
  async getSharedProfile(shareToken: string): Promise<SharedProfileView> {
    const user = await this.prisma.user.findUnique({ where: { profileShareToken: shareToken } });
    if (!user) {
      throw new NotFoundException('Shared profile not found.');
    }

    return {
      name: user.name,
      age: user.dateOfBirth ? calculateAge(user.dateOfBirth, new Date()) : null,
      profilePhotoUrl: user.profilePhotoUrl,
      interests: user.interests,
    };
  }
}
