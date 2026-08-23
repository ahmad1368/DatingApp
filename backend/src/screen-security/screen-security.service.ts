import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FREEZE_DURATION_HOURS,
  ScreenSecurityContext,
  VIOLATION_FREEZE_THRESHOLD,
} from './screen-security.constants';

export interface ScreenSecurityStatus {
  frozen: boolean;
  frozenUntil: string | null;
  violationCount: number;
}

export interface ReportViolationResult extends ScreenSecurityStatus {
  warning: string;
}

interface FreezeState {
  screenCaptureViolationCount: number;
  screenCaptureFrozenUntil: Date | null;
}

@Injectable()
export class ScreenSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a screenshot/recording attempt on a protected screen. Escalates
   * to a temporary account freeze once violations cross the threshold, then
   * resets the counter so the next freeze requires a fresh run of violations.
   */
  async reportViolation(
    userId: string,
    context: ScreenSecurityContext,
  ): Promise<ReportViolationResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const nextCount = user.screenCaptureViolationCount + 1;
    const shouldFreeze = nextCount >= VIOLATION_FREEZE_THRESHOLD;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        screenCaptureViolationCount: shouldFreeze ? 0 : nextCount,
        screenCaptureFrozenUntil: shouldFreeze
          ? new Date(Date.now() + FREEZE_DURATION_HOURS * 60 * 60 * 1000)
          : user.screenCaptureFrozenUntil,
      },
    });

    const contextLabel = context === 'CHAT' ? 'a private chat' : 'a profile';
    const warning = shouldFreeze
      ? `Screen capture detected in ${contextLabel}. Your account has been temporarily frozen for repeated violations.`
      : `Screen capture detected in ${contextLabel}. Please respect other members' privacy.`;

    return { warning, ...this.toStatus(updated) };
  }

  async getStatus(userId: string): Promise<ScreenSecurityStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return this.toStatus(user);
  }

  private toStatus(user: FreezeState): ScreenSecurityStatus {
    const frozenUntil = user.screenCaptureFrozenUntil;
    return {
      frozen: frozenUntil != null && frozenUntil.getTime() > Date.now(),
      frozenUntil: frozenUntil?.toISOString() ?? null,
      violationCount: user.screenCaptureViolationCount,
    };
  }
}
