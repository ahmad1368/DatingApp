import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CROSSING_DEDUPE_MINUTES,
  CROSSING_HISTORY_HOURS,
  CROSSING_RADIUS_KM,
  CROSSING_RECENCY_MINUTES,
  DEFAULT_SEARCH_RADIUS_KM,
  DistanceUnit,
  roundToZone,
} from './location.constants';
import { haversineDistanceKm } from './utils/haversine';

export interface UpdateLocationResult {
  latitude: number;
  longitude: number;
  locationUpdatedAt: string;
}

export interface UpdateSearchRadiusResult {
  searchRadiusKm: number;
}

export interface RadiusSettings {
  searchRadiusKm: number;
  autoExpandRadiusEnabled: boolean;
  distanceUnit: DistanceUnit;
}

export interface NearbyUser {
  id: string;
  name: string | null;
  distanceKm: number;
}

export interface PassportLocationResult {
  passportEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface CrossedPath {
  id: string;
  name: string | null;
  profilePhotoUrl: string | null;
  crossCount: number;
  closestDistanceKm: number;
  lastCrossedAt: string;
}

export interface CrossingZone {
  zoneId: string;
  latitude: number;
  longitude: number;
  crossingCount: number;
  uniqueUserCount: number;
  lastCrossedAt: string;
}

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  async updateLocation(userId: string, latitude: number, longitude: number): Promise<UpdateLocationResult> {
    const now = new Date();
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { latitude, longitude, locationUpdatedAt: now },
    });

    await this.recordCrossings(userId, latitude, longitude, now);

    return {
      latitude: user.latitude!,
      longitude: user.longitude!,
      locationUpdatedAt: user.locationUpdatedAt!.toISOString(),
    };
  }

  async updateSearchRadius(userId: string, radiusKm: number): Promise<UpdateSearchRadiusResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { searchRadiusKm: radiusKm },
    });

    return { searchRadiusKm: user.searchRadiusKm };
  }

  async getRadiusSettings(userId: string): Promise<RadiusSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { searchRadiusKm: true, autoExpandRadiusEnabled: true, distanceUnit: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.toRadiusSettings(user);
  }

  /**
   * When enabled (the default), DiscoveryService.getDeck widens the search
   * radius for a single fetch if too few candidates fall within it, rather
   * than returning a near-empty deck - see the note on
   * MIN_CANDIDATES_BEFORE_RADIUS_EXPANSION.
   */
  async setAutoExpandRadius(userId: string, enabled: boolean): Promise<RadiusSettings> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { autoExpandRadiusEnabled: enabled },
    });

    return this.toRadiusSettings(user);
  }

  /**
   * The stored search radius always stays in km (see updateSearchRadius) -
   * this only remembers which unit the client should render/accept it in.
   */
  async setDistanceUnit(userId: string, unit: DistanceUnit): Promise<RadiusSettings> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { distanceUnit: unit },
    });

    return this.toRadiusSettings(user);
  }

  private toRadiusSettings(user: {
    searchRadiusKm: number;
    autoExpandRadiusEnabled: boolean;
    distanceUnit: string;
  }): RadiusSettings {
    return {
      searchRadiusKm: user.searchRadiusKm,
      autoExpandRadiusEnabled: user.autoExpandRadiusEnabled,
      distanceUnit: user.distanceUnit as DistanceUnit,
    };
  }

  async findNearbyUsers(userId: string): Promise<NearbyUser[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const usingPassport =
      currentUser.passportEnabled &&
      currentUser.passportLatitude != null &&
      currentUser.passportLongitude != null;

    const originLatitude = usingPassport ? currentUser.passportLatitude : currentUser.latitude;
    const originLongitude = usingPassport ? currentUser.passportLongitude : currentUser.longitude;

    if (originLatitude == null || originLongitude == null) {
      throw new BadRequestException('Set your location before searching nearby users.');
    }

    const radiusKm = currentUser.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM;

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        latitude: { not: null },
        longitude: { not: null },
      },
    });

    return candidates
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        distanceKm: haversineDistanceKm(
          originLatitude,
          originLongitude,
          candidate.latitude!,
          candidate.longitude!,
        ),
      }))
      .filter((candidate) => candidate.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async setPassportLocation(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<PassportLocationResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.isPremium) {
      throw new ForbiddenException('Passport is a premium feature. Upgrade to use it.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passportLatitude: latitude, passportLongitude: longitude, passportEnabled: true },
    });

    return {
      passportEnabled: true,
      latitude: updated.passportLatitude,
      longitude: updated.passportLongitude,
    };
  }

  async clearPassportLocation(userId: string): Promise<PassportLocationResult> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passportEnabled: false },
    });

    return {
      passportEnabled: false,
      latitude: updated.passportLatitude,
      longitude: updated.passportLongitude,
    };
  }

  /**
   * "Crossed paths": everyone the current user has been physically close to
   * (see [recordCrossings]) in the last CROSSING_HISTORY_HOURS, most
   * recently crossed first.
   */
  async getCrossedPaths(userId: string): Promise<CrossedPath[]> {
    const windowStart = new Date(Date.now() - CROSSING_HISTORY_HOURS * 60 * 60 * 1000);

    const crossings = await this.prisma.pathCrossing.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        crossedAt: { gte: windowStart },
      },
      orderBy: { crossedAt: 'desc' },
    });

    if (crossings.length === 0) {
      return [];
    }

    type CrossingSummary = { crossCount: number; closestDistanceKm: number; lastCrossedAt: Date };
    const byOtherUserId = new Map<string, CrossingSummary>();

    for (const crossing of crossings) {
      const otherUserId = crossing.userAId === userId ? crossing.userBId : crossing.userAId;
      const existing = byOtherUserId.get(otherUserId);
      if (!existing) {
        byOtherUserId.set(otherUserId, {
          crossCount: 1,
          closestDistanceKm: crossing.distanceKm,
          lastCrossedAt: crossing.crossedAt,
        });
        continue;
      }
      existing.crossCount += 1;
      existing.closestDistanceKm = Math.min(existing.closestDistanceKm, crossing.distanceKm);
    }

    const otherUsers = await this.prisma.user.findMany({
      where: { id: { in: [...byOtherUserId.keys()] } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const otherUserById = new Map(otherUsers.map((user) => [user.id, user]));

    return [...byOtherUserId.entries()]
      .map(([otherUserId, summary]) => {
        const otherUser = otherUserById.get(otherUserId);
        return {
          id: otherUserId,
          name: otherUser?.name ?? null,
          profilePhotoUrl: otherUser?.profilePhotoUrl ?? null,
          crossCount: summary.crossCount,
          closestDistanceKm: summary.closestDistanceKm,
          lastCrossedAt: summary.lastCrossedAt.toISOString(),
        };
      })
      .sort((a, b) => b.lastCrossedAt.localeCompare(a.lastCrossedAt));
  }

  /**
   * The map-overlay counterpart to [getCrossedPaths]: the same
   * CROSSING_HISTORY_HOURS crossings, but grouped by an approximate
   * neighborhood/landmark-sized zone (see roundToZone) instead of by which
   * person was crossed - each zone reports how many crossings and distinct
   * potential matches were encountered there today, most recent first.
   */
  async getCrossingZones(userId: string): Promise<CrossingZone[]> {
    const windowStart = new Date(Date.now() - CROSSING_HISTORY_HOURS * 60 * 60 * 1000);

    const crossings = await this.prisma.pathCrossing.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        crossedAt: { gte: windowStart },
      },
      orderBy: { crossedAt: 'desc' },
    });

    type ZoneSummary = {
      latitude: number;
      longitude: number;
      crossingCount: number;
      otherUserIds: Set<string>;
      lastCrossedAt: Date;
    };
    const byZoneId = new Map<string, ZoneSummary>();

    for (const crossing of crossings) {
      const otherUserId = crossing.userAId === userId ? crossing.userBId : crossing.userAId;
      const latitude = roundToZone(crossing.latitude);
      const longitude = roundToZone(crossing.longitude);
      const zoneId = `${latitude},${longitude}`;

      const existing = byZoneId.get(zoneId);
      if (!existing) {
        byZoneId.set(zoneId, {
          latitude,
          longitude,
          crossingCount: 1,
          otherUserIds: new Set([otherUserId]),
          lastCrossedAt: crossing.crossedAt,
        });
        continue;
      }
      existing.crossingCount += 1;
      existing.otherUserIds.add(otherUserId);
    }

    return [...byZoneId.entries()]
      .map(([zoneId, summary]) => ({
        zoneId,
        latitude: summary.latitude,
        longitude: summary.longitude,
        crossingCount: summary.crossingCount,
        uniqueUserCount: summary.otherUserIds.size,
        lastCrossedAt: summary.lastCrossedAt.toISOString(),
      }))
      .sort((a, b) => b.lastCrossedAt.localeCompare(a.lastCrossedAt));
  }

  /**
   * Logs a "crossing" for every other user who is both within
   * CROSSING_RADIUS_KM of the given location and has pinged their own
   * location within CROSSING_RECENCY_MINUTES, so crossings reflect real or
   * near-real-time proximity rather than stale locations. Deduped per pair
   * within CROSSING_DEDUPE_MINUTES so lingering near someone doesn't spam
   * the log.
   */
  private async recordCrossings(
    userId: string,
    latitude: number,
    longitude: number,
    now: Date,
  ): Promise<void> {
    const recencyWindowStart = new Date(now.getTime() - CROSSING_RECENCY_MINUTES * 60 * 1000);

    const nearbyRecentUsers = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        latitude: { not: null },
        longitude: { not: null },
        locationUpdatedAt: { gte: recencyWindowStart },
      },
      select: { id: true, latitude: true, longitude: true },
    });

    const dedupeWindowStart = new Date(now.getTime() - CROSSING_DEDUPE_MINUTES * 60 * 1000);

    for (const other of nearbyRecentUsers) {
      const distanceKm = haversineDistanceKm(latitude, longitude, other.latitude!, other.longitude!);
      if (distanceKm > CROSSING_RADIUS_KM) {
        continue;
      }

      const [userAId, userBId] = [userId, other.id].sort();
      const recentCrossing = await this.prisma.pathCrossing.findFirst({
        where: { userAId, userBId, crossedAt: { gte: dedupeWindowStart } },
      });
      if (recentCrossing) {
        continue;
      }

      await this.prisma.pathCrossing.create({
        data: { userAId, userBId, latitude, longitude, distanceKm, crossedAt: now },
      });
    }
  }
}
