import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../auth/interfaces/sms-provider.interface';
import { SAFETY_RESOURCES, SafetyResource, isCheckInOverdue } from './safety.constants';

export interface UserReportView {
  id: string;
  reportedUserId: string;
  reason: string;
  details: string | null;
  createdAt: string;
}

export type CheckInStatus = 'SCHEDULED' | 'CONFIRMED' | 'OVERDUE';

export interface CheckInView {
  id: string;
  matchId: string | null;
  location: string | null;
  scheduledAt: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  confirmedAt: string | null;
  status: CheckInStatus;
  alertSent: boolean;
}

export interface EmergencyContactView {
  id: string;
  name: string;
  phone: string;
}

export interface SosAlertResult {
  id: string;
  notifiedContactIds: string[];
  createdAt: string;
}

export interface DateLocationShareResult {
  id: string;
  notifiedContactIds: string[];
  createdAt: string;
}

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  getResources(): SafetyResource[] {
    return SAFETY_RESOURCES;
  }

  async reportUser(
    reporterId: string,
    reportedUserId: string,
    reason: string,
    details?: string,
  ): Promise<UserReportView> {
    if (reportedUserId === reporterId) {
      throw new BadRequestException('You cannot report yourself.');
    }

    const reportedUser = await this.prisma.user.findUnique({ where: { id: reportedUserId } });
    if (!reportedUser) {
      throw new NotFoundException('User not found.');
    }

    const report = await this.prisma.userReport.create({
      data: { reporterId, reportedUserId, reason, details },
    });

    return this.toReportView(report);
  }

  async createCheckIn(
    userId: string,
    input: {
      scheduledAt: string;
      matchId?: string;
      location?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      notes?: string;
    },
  ): Promise<CheckInView> {
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Check-in time must be in the future.');
    }

    const checkIn = await this.prisma.dateCheckIn.create({
      data: {
        userId,
        matchId: input.matchId,
        location: input.location,
        scheduledAt,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        notes: input.notes,
      },
    });

    return this.toCheckInView(checkIn);
  }

  /**
   * There's no background job in this codebase to eagerly detect a missed
   * check-in, so - like the lazy match/boost expiry elsewhere - the alert
   * to the emergency contact is sent (once, via [alertSentAt]) the next
   * time this list is read after the check-in goes overdue.
   */
  async listCheckIns(userId: string): Promise<CheckInView[]> {
    const checkIns = await this.prisma.dateCheckIn.findMany({
      where: { userId },
      orderBy: { scheduledAt: 'desc' },
    });

    const withAlertsSent = await Promise.all(
      checkIns.map((checkIn) => this.sendOverdueAlertIfNeeded(checkIn)),
    );

    return withAlertsSent.map((checkIn) => this.toCheckInView(checkIn));
  }

  async confirmCheckIn(userId: string, checkInId: string): Promise<CheckInView> {
    const checkIn = await this.prisma.dateCheckIn.findUnique({ where: { id: checkInId } });
    if (!checkIn || checkIn.userId !== userId) {
      throw new NotFoundException('Check-in not found.');
    }

    const updated = await this.prisma.dateCheckIn.update({
      where: { id: checkInId },
      data: { confirmedAt: new Date() },
    });

    return this.toCheckInView(updated);
  }

  async addEmergencyContact(userId: string, name: string, phone: string): Promise<EmergencyContactView> {
    const contact = await this.prisma.emergencyContact.create({ data: { userId, name, phone } });
    return this.toContactView(contact);
  }

  async listEmergencyContacts(userId: string): Promise<EmergencyContactView[]> {
    const contacts = await this.prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return contacts.map((contact) => this.toContactView(contact));
  }

  async deleteEmergencyContact(userId: string, contactId: string): Promise<{ deleted: boolean }> {
    const contact = await this.prisma.emergencyContact.findUnique({ where: { id: contactId } });
    if (!contact || contact.userId !== userId) {
      throw new NotFoundException('Emergency contact not found.');
    }

    await this.prisma.emergencyContact.delete({ where: { id: contactId } });
    return { deleted: true };
  }

  /**
   * Immediate "help now" trigger during a live date: texts the caller's
   * current coordinates to the selected (or, if none chosen, all) emergency
   * contacts right away - unlike DateCheckIn's lazy missed-check-in alert,
   * this fires the moment the user taps SOS, not on a delay.
   */
  async triggerSos(
    userId: string,
    latitude: number,
    longitude: number,
    matchId?: string,
    contactIds?: string[],
  ): Promise<SosAlertResult> {
    const [user, allContacts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      this.prisma.emergencyContact.findMany({ where: { userId } }),
    ]);

    const targets = contactIds
      ? allContacts.filter((contact) => contactIds.includes(contact.id))
      : allContacts;

    if (contactIds && targets.length !== contactIds.length) {
      throw new NotFoundException('One or more emergency contacts were not found.');
    }
    if (targets.length === 0) {
      throw new BadRequestException('Add at least one emergency contact before triggering SOS.');
    }

    const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const senderName = user?.name ?? 'Someone you know';
    const message = `URGENT: ${senderName} triggered an SOS alert during a date and may need help. Live location: ${mapsLink}`;

    await Promise.all(targets.map((contact) => this.smsProvider.sendMessage(contact.phone, message)));

    const alert = await this.prisma.sosAlert.create({
      data: {
        userId,
        matchId: matchId ?? null,
        latitude,
        longitude,
        contactIds: targets.map((contact) => contact.id),
      },
    });

    return {
      id: alert.id,
      notifiedContactIds: alert.contactIds,
      createdAt: alert.createdAt.toISOString(),
    };
  }

  /**
   * Proactive safety share for the start of a date: unlike [triggerSos]'s
   * urgent "help now" alert, this is sent by the user themselves before
   * anything has gone wrong - the destination address plus a live-location
   * link, texted to their chosen trusted contacts so someone knows where
   * they are.
   */
  async shareDateLocation(
    userId: string,
    latitude: number,
    longitude: number,
    matchId?: string,
    destinationAddress?: string,
    contactIds?: string[],
  ): Promise<DateLocationShareResult> {
    const [user, allContacts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      this.prisma.emergencyContact.findMany({ where: { userId } }),
    ]);

    const targets = contactIds
      ? allContacts.filter((contact) => contactIds.includes(contact.id))
      : allContacts;

    if (contactIds && targets.length !== contactIds.length) {
      throw new NotFoundException('One or more emergency contacts were not found.');
    }
    if (targets.length === 0) {
      throw new BadRequestException('Add at least one emergency contact before sharing your location.');
    }

    const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const senderName = user?.name ?? 'Someone you know';
    const destinationLine = destinationAddress ? ` Heading to: ${destinationAddress}.` : '';
    const message = `${senderName} is on a date and shared their live location with you.${destinationLine} Live location: ${mapsLink}`;

    await Promise.all(targets.map((contact) => this.smsProvider.sendMessage(contact.phone, message)));

    const share = await this.prisma.dateLocationShare.create({
      data: {
        userId,
        matchId: matchId ?? null,
        destinationAddress: destinationAddress ?? null,
        latitude,
        longitude,
        contactIds: targets.map((contact) => contact.id),
      },
    });

    return {
      id: share.id,
      notifiedContactIds: share.contactIds,
      createdAt: share.createdAt.toISOString(),
    };
  }

  private toContactView(contact: { id: string; name: string; phone: string }): EmergencyContactView {
    return { id: contact.id, name: contact.name, phone: contact.phone };
  }

  private toReportView(report: {
    id: string;
    reportedUserId: string;
    reason: string;
    details: string | null;
    createdAt: Date;
  }): UserReportView {
    return {
      id: report.id,
      reportedUserId: report.reportedUserId,
      reason: report.reason,
      details: report.details,
      createdAt: report.createdAt.toISOString(),
    };
  }

  private async sendOverdueAlertIfNeeded<
    T extends {
      id: string;
      location: string | null;
      scheduledAt: Date;
      emergencyContactPhone: string | null;
      confirmedAt: Date | null;
      alertSentAt: Date | null;
    },
  >(checkIn: T): Promise<T> {
    const now = new Date();
    const overdue = isCheckInOverdue(checkIn.scheduledAt, checkIn.confirmedAt, now);

    if (!overdue || !checkIn.emergencyContactPhone || checkIn.alertSentAt != null) {
      return checkIn;
    }

    const message = checkIn.location
      ? `Safety alert: a date check-in scheduled for ${checkIn.scheduledAt.toLocaleString()} at ${checkIn.location} was missed. Please check on them.`
      : `Safety alert: a date check-in scheduled for ${checkIn.scheduledAt.toLocaleString()} was missed. Please check on them.`;

    await this.smsProvider.sendMessage(checkIn.emergencyContactPhone, message);
    await this.prisma.dateCheckIn.update({
      where: { id: checkIn.id },
      data: { alertSentAt: now },
    });

    return { ...checkIn, alertSentAt: now };
  }

  private toCheckInView(checkIn: {
    id: string;
    matchId: string | null;
    location: string | null;
    scheduledAt: Date;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    notes: string | null;
    confirmedAt: Date | null;
    alertSentAt: Date | null;
  }): CheckInView {
    const now = new Date();
    const status: CheckInStatus =
      checkIn.confirmedAt != null
        ? 'CONFIRMED'
        : isCheckInOverdue(checkIn.scheduledAt, checkIn.confirmedAt, now)
          ? 'OVERDUE'
          : 'SCHEDULED';

    return {
      id: checkIn.id,
      matchId: checkIn.matchId,
      location: checkIn.location,
      scheduledAt: checkIn.scheduledAt.toISOString(),
      emergencyContactName: checkIn.emergencyContactName,
      emergencyContactPhone: checkIn.emergencyContactPhone,
      notes: checkIn.notes,
      confirmedAt: checkIn.confirmedAt ? checkIn.confirmedAt.toISOString() : null,
      status,
      alertSent: checkIn.alertSentAt != null,
    };
  }
}
