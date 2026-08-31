import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '../messaging/messaging.constants';

export interface ProfilePollView {
  question: string | null;
  options: string[];
  myOptionIndex: number | null;
  voteCounts: number[];
  totalVotes: number;
}

@Injectable()
export class ProfilePollService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Replacing the question/options invalidates any existing votes - their
   * optionIndex would no longer line up with the new choices, same
   * "editing resets responses" shape as a chat poll's options are
   * immutable once sent (this profile poll just allows re-authoring it,
   * at the cost of the old tally).
   */
  async setPoll(ownerId: string, question: string, options: string[]): Promise<ProfilePollView> {
    if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) {
      throw new BadRequestException(`A poll needs between ${MIN_POLL_OPTIONS} and ${MAX_POLL_OPTIONS} options.`);
    }

    await this.prisma.$transaction([
      this.prisma.profilePollVote.deleteMany({ where: { pollOwnerId: ownerId } }),
      this.prisma.user.update({
        where: { id: ownerId },
        data: { profilePollQuestion: question, profilePollOptions: options },
      }),
    ]);

    return { question, options, myOptionIndex: null, voteCounts: options.map(() => 0), totalVotes: 0 };
  }

  async clearPoll(ownerId: string): Promise<{ cleared: boolean }> {
    await this.prisma.$transaction([
      this.prisma.profilePollVote.deleteMany({ where: { pollOwnerId: ownerId } }),
      this.prisma.user.update({
        where: { id: ownerId },
        data: { profilePollQuestion: null, profilePollOptions: [] },
      }),
    ]);

    return { cleared: true };
  }

  async getPoll(viewerId: string, ownerId: string): Promise<ProfilePollView> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { profilePollQuestion: true, profilePollOptions: true },
    });
    if (!owner) {
      throw new NotFoundException('User not found.');
    }

    const votes = await this.prisma.profilePollVote.findMany({ where: { pollOwnerId: ownerId } });
    return this.toView(owner.profilePollQuestion, owner.profilePollOptions, viewerId, votes);
  }

  /** Casts (or changes) the caller's vote on someone's profile poll. */
  async vote(voterId: string, ownerId: string, optionIndex: number): Promise<ProfilePollView> {
    if (voterId === ownerId) {
      throw new BadRequestException('You cannot vote on your own poll.');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { profilePollQuestion: true, profilePollOptions: true },
    });
    if (!owner || !owner.profilePollQuestion || owner.profilePollOptions.length === 0) {
      throw new NotFoundException('This user has no active poll.');
    }
    if (optionIndex < 0 || optionIndex >= owner.profilePollOptions.length) {
      throw new BadRequestException('Invalid poll option.');
    }

    await this.prisma.profilePollVote.upsert({
      where: { pollOwnerId_voterId: { pollOwnerId: ownerId, voterId } },
      create: { pollOwnerId: ownerId, voterId, optionIndex },
      update: { optionIndex },
    });

    const votes = await this.prisma.profilePollVote.findMany({ where: { pollOwnerId: ownerId } });
    return this.toView(owner.profilePollQuestion, owner.profilePollOptions, voterId, votes);
  }

  private toView(
    question: string | null,
    options: string[],
    viewerId: string,
    votes: { voterId: string; optionIndex: number }[],
  ): ProfilePollView {
    const voteCounts = options.map((_, index) => votes.filter((vote) => vote.optionIndex === index).length);
    const myVote = votes.find((vote) => vote.voterId === viewerId);

    return {
      question,
      options,
      myOptionIndex: myVote?.optionIndex ?? null,
      voteCounts,
      totalVotes: votes.length,
    };
  }
}
