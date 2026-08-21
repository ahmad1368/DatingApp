import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetLoveStyleDto } from './dto/set-love-style.dto';

export interface LoveStyleResult {
  loveLanguages: string[];
  showLoveLanguagesOnProfile: boolean;
  attachmentStyle: string | null;
  showAttachmentStyleOnProfile: boolean;
}

@Injectable()
export class LoveStyleService {
  constructor(private readonly prisma: PrismaService) {}

  async getLoveStyle(userId: string): Promise<LoveStyleResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        loveLanguages: true,
        showLoveLanguagesOnProfile: true,
        attachmentStyle: true,
        showAttachmentStyleOnProfile: true,
      },
    });

    return {
      loveLanguages: user?.loveLanguages ?? [],
      showLoveLanguagesOnProfile: user?.showLoveLanguagesOnProfile ?? true,
      attachmentStyle: user?.attachmentStyle ?? null,
      showAttachmentStyleOnProfile: user?.showAttachmentStyleOnProfile ?? true,
    };
  }

  async setLoveStyle(userId: string, dto: SetLoveStyleDto): Promise<LoveStyleResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        loveLanguages: dto.loveLanguages,
        showLoveLanguagesOnProfile: dto.showLoveLanguagesOnProfile,
        attachmentStyle: dto.attachmentStyle ?? null,
        showAttachmentStyleOnProfile: dto.showAttachmentStyleOnProfile,
      },
    });

    return {
      loveLanguages: user.loveLanguages,
      showLoveLanguagesOnProfile: user.showLoveLanguagesOnProfile,
      attachmentStyle: user.attachmentStyle,
      showAttachmentStyleOnProfile: user.showAttachmentStyleOnProfile,
    };
  }
}
