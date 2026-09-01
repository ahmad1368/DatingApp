import 'dart:math' as math;

import 'package:flutter/material.dart';

/// A lightweight decorative waveform for a voice note bubble, tappable to
/// play it. Bar heights are derived deterministically from [seed] (the
/// message id) rather than real audio amplitude analysis - no audio
/// processing pipeline exists in this codebase (mirrors
/// CompatibilityRadarChart's "no charting package, small custom-painted
/// widget" approach). VoicePlayerController also doesn't expose playback
/// position, so this shows a stable per-message shape rather than a
/// progress scrubber.
class VoiceWaveform extends StatelessWidget {
  const VoiceWaveform({
    super.key,
    required this.seed,
    required this.onTap,
    this.barCount = 24,
    this.height = 28,
    this.color = Colors.indigo,
  });

  final String seed;
  final VoidCallback onTap;
  final int barCount;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final random = math.Random(seed.hashCode);
    final barHeights = List.generate(barCount, (_) => 0.25 + random.nextDouble() * 0.75);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        height: height,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final barHeight in barHeights)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 1),
                child: Container(
                  width: 3,
                  height: height * barHeight,
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
