import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LikeProfileItemDto } from './dto/like-profile-item.dto';

export interface ProfileItemLikeView {
  id: string;
  fromUserId: string;
  toUserId: string;
  itemType: string;
  comment: string | null;
  createdAt: string;
}

interface ProfileItemLikeRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  itemType: string;
  comment: string | null;
  createdAt: Date;
}

@Injectable()
export class ProfileItemLikeService {
  constructor(private readonly prisma: PrismaService) {}

  async likeItem(fromUserId: string, dto: LikeProfileItemDto): Promise<ProfileItemLikeView> {
    if (dto.targetUserId === fromUserId) {
      throw new BadRequestException('You cannot like your own profile item.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: dto.targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    if (dto.itemType === 'PHOTO' && !target.profilePhotoUrl) {
      throw new BadRequestException('This user has no photo to like.');
    }
    if (dto.itemType === 'VOICE_MEMO' && !target.voiceIntroUrl) {
      throw new BadRequestException('This user has no voice memo to like.');
    }

    const like = await this.prisma.profileItemLike.upsert({
      where: {
        fromUserId_toUserId_itemType: {
          fromUserId,
          toUserId: dto.targetUserId,
          itemType: dto.itemType,
        },
      },
      create: {
        fromUserId,
        toUserId: dto.targetUserId,
        itemType: dto.itemType,
        comment: dto.comment ?? null,
      },
      update: {
        comment: dto.comment ?? null,
      },
    });

    return this.toView(like);
  }

  async listReceived(userId: string): Promise<ProfileItemLikeView[]> {
    const likes = await this.prisma.profileItemLike.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return likes.map((like) => this.toView(like));
  }

  private toView(like: ProfileItemLikeRecord): ProfileItemLikeView {
    return {
      id: like.id,
      fromUserId: like.fromUserId,
      toUserId: like.toUserId,
      itemType: like.itemType,
      comment: like.comment,
      createdAt: like.createdAt.toISOString(),
    };
  }
}
