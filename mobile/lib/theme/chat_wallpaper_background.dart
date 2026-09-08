import 'package:flutter/material.dart';

/// Default background shown behind a chat thread when the user hasn't
/// picked one of the curated wallpapers (see
/// MatchChatScreen._openWallpaperPicker / MessagingApi.setChatWallpaper).
/// Mirrors WhatsApp's iconic doodle-pattern wallpaper in spirit - a subtle
/// repeating pattern behind the bubbles - but tiles icons themed to dating
/// instead of WhatsApp's. Deliberately purely-decorative icons (no overlap
/// with any icon used as a real button elsewhere in the app) so widget
/// tests can still target those buttons with `find.byIcon` unambiguously.
class ChatWallpaperBackground extends StatelessWidget {
  const ChatWallpaperBackground({super.key});

  static const _doodleIcons = [
    Icons.local_florist,
    Icons.wine_bar,
    Icons.nightlife,
    Icons.cake,
    Icons.beach_access,
    Icons.park,
  ];

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      color: colorScheme.surfaceContainerLowest,
      child: GridView.builder(
        padding: const EdgeInsets.all(12),
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5,
          mainAxisSpacing: 26,
          crossAxisSpacing: 26,
        ),
        itemCount: 60,
        itemBuilder: (context, index) => Icon(
          _doodleIcons[index % _doodleIcons.length],
          size: 18,
          color: colorScheme.primary.withValues(alpha: 0.08),
        ),
      ),
    );
  }
}
