import 'package:flutter/material.dart';

import 'jwt_utils.dart';

/// Overlays a subtle, tiled watermark of the *viewer's own* id on top of
/// [child]. If someone screenshots or screen-records the profile anyway
/// (Android is blocked outright via FLAG_SECURE - see ScreenSecurityChannel
/// - but this is a second line of defense and a mitigation for iOS, which
/// can only detect a capture after the fact), the leaked image carries a
/// trace back to whoever captured it, deterring unauthorized sharing.
class WatermarkOverlay extends StatelessWidget {
  const WatermarkOverlay({super.key, required this.child, required this.accessToken});

  final Widget child;
  final String accessToken;

  @override
  Widget build(BuildContext context) {
    final viewerId = extractUserIdFromToken(accessToken);
    if (viewerId == null || viewerId.isEmpty) {
      return child;
    }

    final code = viewerId.length > 8 ? viewerId.substring(0, 8) : viewerId;

    return Stack(
      fit: StackFit.passthrough,
      children: [
        child,
        Positioned.fill(
          child: IgnorePointer(
            child: ClipRect(
              child: Opacity(
                opacity: 0.08,
                child: Transform.rotate(
                  angle: -0.5,
                  child: GridView.builder(
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisExtent: 60,
                    ),
                    itemCount: 12,
                    itemBuilder: (context, index) => Center(
                      child: Text(
                        code,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
