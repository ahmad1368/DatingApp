import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AVATAR_STYLES, AvatarStyle, findAvatarStyle } from './avatar.constants';

export interface AvatarResult {
  avatarStyleId: string | null;
  thirdPartyAvatarUrl: string | null;
  showAvatarOnProfile: boolean;
}

const AVATAR_SELECT = { avatarStyleId: true, thirdPartyAvatarUrl: true, showAvatarOnProfile: true } as const;

/**
 * A profile header avatar: either a curated 3D style picked from
 * AVATAR_STYLES, or a linked third-party avatar image (e.g. Bitmoji) -
 * mutually exclusive, so selecting one always clears the other.
 */
@Injectable()
export class AvatarService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): AvatarStyle[] {
    return AVATAR_STYLES;
  }

  async getMyAvatar(userId: string): Promise<AvatarResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: AVATAR_SELECT });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  async selectAvatarStyle(userId: string, avatarStyleId: string): Promise<AvatarResult> {
    if (!findAvatarStyle(avatarStyleId)) {
      throw new BadRequestException('Unknown avatar style.');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarStyleId, thirdPartyAvatarUrl: null },
      select: AVATAR_SELECT,
    });
  }

  async linkThirdPartyAvatar(userId: string, thirdPartyAvatarUrl: string): Promise<AvatarResult> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { thirdPartyAvatarUrl, avatarStyleId: null },
      select: AVATAR_SELECT,
    });
  }

  async clearAvatar(userId: string): Promise<AvatarResult> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarStyleId: null, thirdPartyAvatarUrl: null },
      select: AVATAR_SELECT,
    });
  }

  async setShowAvatarOnProfile(userId: string, show: boolean): Promise<AvatarResult> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { showAvatarOnProfile: show },
      select: AVATAR_SELECT,
    });
  }
}
