import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeBoostExpiresAt } from '../discovery/discovery.constants';
import { COMPLETION_CHECKS, MIN_INTERESTS_FOR_CREDIT, MIN_PHOTOS_FOR_CREDIT } from './profile-completion.constants';

export interface CompletionChecklistItem {
  id: string;
  label: string;
  weight: number;
  completed: boolean;
}

export interface ProfileCompletionSummary {
  percentage: number;
  checklist: CompletionChecklistItem[];
  rewardGranted: boolean;
}

/**
 * Gamified profile completion meter: a weighted checklist over the fields
 * that make a profile more attractive in the discovery deck. Reaching 100%
 * awards a one-time visibility Boost (see PowerUpsService.purchaseBoost for
 * the same reward mechanic) - tracked via
 * User.profileCompletionRewardGrantedAt so it only ever fires once.
 */
@Injectable()
export class ProfileCompletionService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompletion(userId: string): Promise<ProfileCompletionSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const photoCount = await this.prisma.profilePhoto.count({ where: { ownerId: userId } });
    const [voicePromptAnswerCount, textPromptAnswerCount] = await Promise.all([
      this.prisma.profilePromptVoiceAnswer.count({ where: { userId } }),
      this.prisma.profilePromptTextAnswer.count({ where: { userId } }),
    ]);

    const completedIds = new Set<string>();
    if (user.name) completedIds.add('name');
    if (user.dateOfBirth) completedIds.add('dateOfBirth');
    if (user.genderIdentities.length > 0) completedIds.add('genderIdentity');
    if (user.relationshipGoal) completedIds.add('relationshipGoal');
    if (user.interests.length >= MIN_INTERESTS_FOR_CREDIT) completedIds.add('interests');
    if (photoCount >= MIN_PHOTOS_FOR_CREDIT) completedIds.add('photos');
    if (user.voiceIntroUrl) completedIds.add('voiceIntro');
    if (voicePromptAnswerCount > 0 || textPromptAnswerCount > 0) completedIds.add('promptAnswer');
    if (user.instagramUserId || user.spotifyUserId) completedIds.add('linkedAccount');

    const checklist: CompletionChecklistItem[] = COMPLETION_CHECKS.map((check) => ({
      ...check,
      completed: completedIds.has(check.id),
    }));
    const percentage = checklist.reduce((total, item) => total + (item.completed ? item.weight : 0), 0);

    let rewardGranted = false;
    if (percentage >= 100 && !user.profileCompletionRewardGrantedAt) {
      await this.prisma.$transaction([
        this.prisma.boost.create({ data: { userId, expiresAt: computeBoostExpiresAt(new Date()) } }),
        this.prisma.user.update({ where: { id: userId }, data: { profileCompletionRewardGrantedAt: new Date() } }),
      ]);
      rewardGranted = true;
    }

    return { percentage, checklist, rewardGranted };
  }
}
