import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/theme/app_theme.dart';
import 'package:mobile/theme/chat_wallpaper_background.dart';

void main() {
  test('AppTheme.light is seeded from the warm coral color, not the old default purple', () {
    final theme = AppTheme.light;
    expect(theme.colorScheme.primary, isNot(Colors.deepPurple));
    // ColorScheme.fromSeed derives primary from the seed hue; sanity-check
    // the seed itself is warm (red/orange) rather than cool.
    final hsl = HSLColor.fromColor(AppTheme.seed);
    expect(hsl.hue, lessThan(40));
  });

  test('AppTheme.light gives inputs and app bars an icon-friendly, rounded look', () {
    final theme = AppTheme.light;
    expect(theme.inputDecorationTheme.filled, isTrue);
    expect(theme.appBarTheme.backgroundColor, theme.colorScheme.primary);
  });

  testWidgets('ChatWallpaperBackground renders a tiled icon pattern', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const Scaffold(body: ChatWallpaperBackground()),
      ),
    );

    expect(find.byType(ChatWallpaperBackground), findsOneWidget);
    expect(find.byIcon(Icons.local_florist), findsWidgets);
  });
}
