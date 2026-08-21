export interface VenueCategory {
  id: string;
  label: string;
  searchQuery: string;
  description: string;
}

// Curated meetup-spot categories, not real named venues - there's no
// Places/geocoding API integration in this codebase, so instead of faking
// venue data we suggest a category plus a map deep link (see
// [buildMapsSearchUrl]) centered on the pair's midpoint.
export const VENUE_CATEGORIES: VenueCategory[] = [
  {
    id: 'cafe',
    label: 'Coffee Shop',
    searchQuery: 'coffee shop',
    description: 'Low-pressure and easy to leave whenever - a classic first-date pick.',
  },
  {
    id: 'bar',
    label: 'Bar',
    searchQuery: 'bar',
    description: 'A relaxed evening option with a drink menu to talk over.',
  },
  {
    id: 'park',
    label: 'Park',
    searchQuery: 'park',
    description: 'Outdoor, casual, and free - good for a walk-and-talk date.',
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    searchQuery: 'restaurant',
    description: 'A more traditional sit-down date if you already feel comfortable.',
  },
  {
    id: 'bookstore',
    label: 'Bookstore',
    searchQuery: 'bookstore',
    description: 'Quiet and low-key, with plenty of built-in conversation starters.',
  },
  {
    id: 'museum',
    label: 'Museum or Gallery',
    searchQuery: 'museum',
    description: 'Something to look at together besides each other.',
  },
];
