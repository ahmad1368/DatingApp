import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScreenSecurityService } from './screen-security.service';

const USER_ID = 'user-1';

describe('ScreenSecurityService', () => {
  let service: ScreenSecurityService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new ScreenSecurityService(prisma as unknown as PrismaService);
  });

  describe('reportViolation', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.reportViolation(USER_ID, 'PROFILE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('increments the violation count without freezing below the threshold', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        screenCaptureViolationCount: 1,
        screenCaptureFrozenUntil: null,
      });
      prisma.user.update.mockResolvedValue({
        screenCaptureViolationCount: 2,
        screenCaptureFrozenUntil: null,
      });

      const result = await service.reportViolation(USER_ID, 'CHAT');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { screenCaptureViolationCount: 2, screenCaptureFrozenUntil: null },
      });
      expect(result.frozen).toBe(false);
      expect(result.violationCount).toBe(2);
      expect(result.warning).toContain('private chat');
    });

    it('reports a violation during a call with a call-specific warning', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        screenCaptureViolationCount: 0,
        screenCaptureFrozenUntil: null,
      });
      prisma.user.update.mockResolvedValue({
        screenCaptureViolationCount: 1,
        screenCaptureFrozenUntil: null,
      });

      const result = await service.reportViolation(USER_ID, 'CALL');

      expect(result.warning).toContain('a call');
    });

    it('freezes the account once violations cross the threshold and resets the counter', async () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        screenCaptureViolationCount: 2,
        screenCaptureFrozenUntil: null,
      });
      const frozenUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      prisma.user.update.mockResolvedValue({
        screenCaptureViolationCount: 0,
        screenCaptureFrozenUntil: frozenUntil,
      });

      const result = await service.reportViolation(USER_ID, 'PROFILE');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { screenCaptureViolationCount: 0, screenCaptureFrozenUntil: frozenUntil },
      });
      expect(result.frozen).toBe(true);
      expect(result.frozenUntil).toBe(frozenUntil.toISOString());
      expect(result.warning).toContain('temporarily frozen');

      jest.useRealTimers();
    });
  });

  describe('getStatus', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports frozen as false once the freeze window has passed', async () => {
      prisma.user.findUnique.mockResolvedValue({
        screenCaptureViolationCount: 0,
        screenCaptureFrozenUntil: new Date('2020-01-01T00:00:00.000Z'),
      });

      const status = await service.getStatus(USER_ID);

      expect(status.frozen).toBe(false);
    });

    it('reports frozen as true while the freeze window is still active', async () => {
      prisma.user.findUnique.mockResolvedValue({
        screenCaptureViolationCount: 0,
        screenCaptureFrozenUntil: new Date(Date.now() + 60 * 60 * 1000),
      });

      const status = await service.getStatus(USER_ID);

      expect(status.frozen).toBe(true);
    });
  });
});
