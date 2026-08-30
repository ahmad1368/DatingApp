import { CIVIC_ACTIVITY_LEVELS, POLITICAL_ORIENTATIONS } from '../profile/lifestyle-filters.constants';

// Orientations outside the linear spectrum (no meaningful "distance" to
// compute) fall back to this neutral score instead of being excluded.
const NEUTRAL_ORIENTATION_SCORE = 60;

const SPECTRUM_ORIENTATIONS: readonly string[] = [
  'Progressive',
  'Liberal',
  'Moderate',
  'Conservative',
  'Libertarian',
];

/**
 * A simple ideological-distance heuristic: orientations on the spectrum
 * (see SPECTRUM_ORIENTATIONS, ordered by POLITICAL_ORIENTATIONS) score 100
 * when identical, scaling down to 0 the further apart they are. Apolitical/
 * Prefer Not to Say/unrecognized values sit outside the spectrum and score
 * a flat neutral value regardless of the other side's orientation.
 */
function orientationAlignment(mine: string, theirs: string): number {
  const mineIndex = SPECTRUM_ORIENTATIONS.indexOf(mine);
  const theirsIndex = SPECTRUM_ORIENTATIONS.indexOf(theirs);
  if (mineIndex === -1 || theirsIndex === -1) {
    return NEUTRAL_ORIENTATION_SCORE;
  }

  const maxDistance = SPECTRUM_ORIENTATIONS.length - 1;
  const distance = Math.abs(mineIndex - theirsIndex);
  return Math.round(100 - (distance / maxDistance) * 100);
}

function civicActivityAlignment(mine: string, theirs: string): number | null {
  const mineIndex = CIVIC_ACTIVITY_LEVELS.indexOf(mine as (typeof CIVIC_ACTIVITY_LEVELS)[number]);
  const theirsIndex = CIVIC_ACTIVITY_LEVELS.indexOf(theirs as (typeof CIVIC_ACTIVITY_LEVELS)[number]);
  if (mineIndex === -1 || theirsIndex === -1) {
    return null;
  }

  const maxDistance = CIVIC_ACTIVITY_LEVELS.length - 1;
  const distance = Math.abs(mineIndex - theirsIndex);
  return Math.round(100 - (distance / maxDistance) * 100);
}

/**
 * Blended 0-100 alignment score used to adjust the compatibility view shown
 * for a pair: ideological orientation carries most of the weight, with how
 * closely their civic engagement levels match folded in as a smaller
 * secondary signal when both sides have set one. Returns null when either
 * side hasn't declared a political orientation.
 */
export function computePoliticalAlignmentScore(
  myOrientation: string | null,
  theirOrientation: string | null,
  myCivicActivityLevel: string | null,
  theirCivicActivityLevel: string | null,
): number | null {
  if (!myOrientation || !theirOrientation) {
    return null;
  }
  if (!POLITICAL_ORIENTATIONS.includes(myOrientation as (typeof POLITICAL_ORIENTATIONS)[number])) {
    return null;
  }
  if (!POLITICAL_ORIENTATIONS.includes(theirOrientation as (typeof POLITICAL_ORIENTATIONS)[number])) {
    return null;
  }

  const orientationScore = orientationAlignment(myOrientation, theirOrientation);
  const civicScore =
    myCivicActivityLevel && theirCivicActivityLevel
      ? civicActivityAlignment(myCivicActivityLevel, theirCivicActivityLevel)
      : null;

  if (civicScore === null) {
    return orientationScore;
  }
  return Math.round(orientationScore * 0.7 + civicScore * 0.3);
}
