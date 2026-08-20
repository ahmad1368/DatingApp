import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findVirtualGift, VIRTUAL_GIFTS, VirtualGift } from './gifting.constants';

export interface GiftBalance {
  tokenBalance: number;
}

export interface SendGiftResult {
  tokenBalance: number;
  transaction: GiftTransactionView;
}

export interface GiftTransactionView {
  id: string;
  gift: VirtualGift;
  message: string | null;
  createdAt: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
}

@Injectable()
export class GiftingService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): VirtualGift[] {
    return VIRTUAL_GIFTS;
  }

  async getBalance(userId: string): Promise<GiftBalance> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { giftTokenBalance: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return { tokenBalance: user.giftTokenBalance };
  }

  /**
   * Sends a virtual gift directly to another user's profile - no match
   * required, matching the issue's "send directly to other profiles"
   * framing. Deducts the gift's token cost from the sender's balance and
   * records the transaction atomically.
   */
  async sendGift(
    senderId: string,
    recipientId: string,
    giftId: string,
    message?: string,
  ): Promise<SendGiftResult> {
    if (recipientId === senderId) {
      throw new BadRequestException('You cannot send a gift to yourself.');
    }

    const gift = findVirtualGift(giftId);
    if (!gift) {
      throw new BadRequestException('Unknown gift.');
    }

    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: senderId } }),
      this.prisma.user.findUnique({ where: { id: recipientId } }),
    ]);
    if (!sender) {
      throw new NotFoundException('User not found.');
    }
    if (!recipient) {
      throw new NotFoundException('Recipient not found.');
    }
    if (sender.giftTokenBalance < gift.tokenCost) {
      throw new BadRequestException('Not enough gift tokens for this gift.');
    }

    const [updatedSender, transaction] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: senderId },
        data: { giftTokenBalance: { decrement: gift.tokenCost } },
      }),
      this.prisma.giftTransaction.create({
        data: { senderId, recipientId, giftId: gift.id, tokenCost: gift.tokenCost, message },
      }),
    ]);

    return {
      tokenBalance: updatedSender.giftTokenBalance,
      transaction: {
        id: transaction.id,
        gift,
        message: transaction.message,
        createdAt: transaction.createdAt.toISOString(),
        otherUserId: recipient.id,
        otherUserName: recipient.name,
        otherUserPhotoUrl: recipient.profilePhotoUrl,
      },
    };
  }

  async listReceivedGifts(userId: string): Promise<GiftTransactionView[]> {
    const transactions = await this.prisma.giftTransaction.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrate(transactions, (t) => t.senderId);
  }

  async listSentGifts(userId: string): Promise<GiftTransactionView[]> {
    const transactions = await this.prisma.giftTransaction.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrate(transactions, (t) => t.recipientId);
  }

  private async hydrate(
    transactions: {
      id: string;
      giftId: string;
      message: string | null;
      createdAt: Date;
      senderId: string;
      recipientId: string;
    }[],
    otherUserIdOf: (t: { senderId: string; recipientId: string }) => string,
  ): Promise<GiftTransactionView[]> {
    if (transactions.length === 0) {
      return [];
    }

    const otherUserIds = [...new Set(transactions.map((t) => otherUserIdOf(t)))];
    const otherUsers = await this.prisma.user.findMany({
      where: { id: { in: otherUserIds } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const otherUserById = new Map(otherUsers.map((user) => [user.id, user]));

    const views: GiftTransactionView[] = [];
    for (const transaction of transactions) {
      const gift = findVirtualGift(transaction.giftId);
      if (!gift) {
        continue;
      }
      const otherUserId = otherUserIdOf(transaction);
      const otherUser = otherUserById.get(otherUserId);
      views.push({
        id: transaction.id,
        gift,
        message: transaction.message,
        createdAt: transaction.createdAt.toISOString(),
        otherUserId,
        otherUserName: otherUser?.name ?? null,
        otherUserPhotoUrl: otherUser?.profilePhotoUrl ?? null,
      });
    }
    return views;
  }
}
