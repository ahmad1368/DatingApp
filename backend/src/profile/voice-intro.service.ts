import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface VoiceIntroResult {
  url: string | null;
  durationSeconds: number | null;
}

@Injectable()
export class VoiceIntroService {
  constructor(private readonly prisma: PrismaService) {}

  async getVoiceIntro(userId: string): Promise<VoiceIntroResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { voiceIntroUrl: true, voiceIntroDurationSeconds: true },
    });

    return {
      url: user?.voiceIntroUrl ?? null,
      durationSeconds: user?.voiceIntroDurationSeconds ?? null,
    };
  }

  async setVoiceIntro(userId: string, url: string, durationSeconds: number): Promise<VoiceIntroResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { voiceIntroUrl: url, voiceIntroDurationSeconds: durationSeconds },
    });

    return { url: user.voiceIntroUrl, durationSeconds: user.voiceIntroDurationSeconds };
  }

  async clearVoiceIntro(userId: string): Promise<VoiceIntroResult> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { voiceIntroUrl: null, voiceIntroDurationSeconds: null },
    });

    return { url: null, durationSeconds: null };
  }
}
