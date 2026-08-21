import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getZodiacSign } from '../matching/zodiac.utils';

export interface ZodiacResult {
  sign: string | null;
  showZodiacOnProfile: boolean;
}

@Injectable()
export class ZodiacService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The zodiac sign is never stored - it's always derived from the
   * already-collected `dateOfBirth`, so there's nothing to keep in sync.
   */
  async getZodiac(userId: string): Promise<ZodiacResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true, showZodiacOnProfile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      sign: user.dateOfBirth ? getZodiacSign(user.dateOfBirth) : null,
      showZodiacOnProfile: user.showZodiacOnProfile,
    };
  }

  async setShowZodiacOnProfile(userId: string, show: boolean): Promise<ZodiacResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { showZodiacOnProfile: show },
      select: { dateOfBirth: true, showZodiacOnProfile: true },
    });

    return {
      sign: user.dateOfBirth ? getZodiacSign(user.dateOfBirth) : null,
      showZodiacOnProfile: user.showZodiacOnProfile,
    };
  }
}
