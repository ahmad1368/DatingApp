import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'discovery_api.dart';

const double _swipeThreshold = 100.0;
const double _maxRotationRadians = 0.4;

/// A single draggable profile card: drag right to like, left to pass.
/// Flings off-screen and calls [onSwiped] with 'LIKE' or 'PASS' once past
/// the threshold; otherwise springs back to center.
class SwipeCard extends StatefulWidget {
  const SwipeCard({super.key, required this.card, required this.onSwiped, this.onTap});

  final DeckCard card;
  final ValueChanged<String> onSwiped;
  final VoidCallback? onTap;

  @override
  State<SwipeCard> createState() => _SwipeCardState();
}

class _SwipeCardState extends State<SwipeCard> with SingleTickerProviderStateMixin {
  Offset _dragOffset = Offset.zero;
  late final AnimationController _animController;
  Animation<Offset>? _animation;
  bool _hapticFired = false;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(vsync: this, duration: const Duration(milliseconds: 300))
      ..addListener(() {
        final animation = _animation;
        if (animation != null) {
          setState(() => _dragOffset = animation.value);
        }
      });
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _onPanUpdate(DragUpdateDetails details) {
    setState(() => _dragOffset += details.delta);
    final pastThreshold = _dragOffset.dx.abs() > _swipeThreshold;
    if (pastThreshold && !_hapticFired) {
      _hapticFired = true;
      HapticFeedback.mediumImpact();
    } else if (!pastThreshold && _hapticFired) {
      _hapticFired = false;
    }
  }

  void _onPanEnd(DragEndDetails details) {
    if (_dragOffset.dx.abs() > _swipeThreshold) {
      _flingAway(_dragOffset.dx > 0 ? 'LIKE' : 'PASS');
    } else {
      _animateBackToCenter();
    }
  }

  void _flingAway(String action) {
    final screenWidth = MediaQuery.of(context).size.width;
    final endX = action == 'LIKE' ? screenWidth * 1.5 : -screenWidth * 1.5;
    _animation = Tween<Offset>(begin: _dragOffset, end: Offset(endX, _dragOffset.dy)).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );
    _animController.forward(from: 0).whenComplete(() => widget.onSwiped(action));
  }

  void _animateBackToCenter() {
    _hapticFired = false;
    _animation = Tween<Offset>(begin: _dragOffset, end: Offset.zero).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeOut),
    );
    _animController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final angle = (_dragOffset.dx / 300).clamp(-1.0, 1.0) * _maxRotationRadians;
    final likeOpacity = (_dragOffset.dx / _swipeThreshold).clamp(0.0, 1.0);
    final passOpacity = (-_dragOffset.dx / _swipeThreshold).clamp(0.0, 1.0);

    return GestureDetector(
      onTap: widget.onTap,
      onPanUpdate: _onPanUpdate,
      onPanEnd: _onPanEnd,
      child: Transform.translate(
        offset: _dragOffset,
        child: Transform.rotate(
          angle: angle,
          child: Stack(
            children: [
              _CardContent(card: widget.card),
              Positioned(
                top: 24,
                left: 24,
                child: Opacity(opacity: likeOpacity, child: const _SwipeStamp(text: 'LIKE', color: Colors.green)),
              ),
              Positioned(
                top: 24,
                right: 24,
                child: Opacity(opacity: passOpacity, child: const _SwipeStamp(text: 'PASS', color: Colors.red)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SwipeStamp extends StatelessWidget {
  const _SwipeStamp({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: color, width: 3),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 24)),
    );
  }
}

class _CardContent extends StatelessWidget {
  const _CardContent({required this.card});

  final DeckCard card;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 320,
      height: 480,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(16),
      child: Stack(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(
                [card.name ?? 'Someone', if (card.age != null) card.age.toString()].join(', '),
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              if (card.distanceKm != null)
                Text('${card.distanceKm!.toStringAsFixed(1)} km away'),
              if (card.relationshipIntentBadges.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final badge in card.relationshipIntentBadges)
                      Chip(
                        label: Text(badge),
                        backgroundColor: Colors.pink.shade100,
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ],
              if (card.lifestyleBadges.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final badge in card.lifestyleBadges)
                      Chip(
                        label: Text(badge),
                        backgroundColor: Colors.teal.shade100,
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ],
              if (card.zodiacSign != null) ...[
                const SizedBox(height: 8),
                Chip(
                  avatar: const Icon(Icons.auto_awesome, size: 16),
                  label: Text(card.zodiacSign!),
                  backgroundColor: Colors.deepPurple.shade100,
                  visualDensity: VisualDensity.compact,
                ),
              ],
              if (card.loveStyleBadges.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final badge in card.loveStyleBadges)
                      Chip(
                        label: Text(badge),
                        backgroundColor: Colors.red.shade100,
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ],
              if (card.interests.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [for (final interest in card.interests) Chip(label: Text(interest))],
                ),
              ],
            ],
          ),
          if (card.isSuperLike)
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.star, color: Colors.white, size: 16),
                    SizedBox(width: 4),
                    Text(
                      'Super Liked You',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          if (card.isPriorityLike)
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.purple,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.favorite, color: Colors.white, size: 16),
                    SizedBox(width: 4),
                    Text(
                      'Liked You',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          if (card.isBoosted)
            Positioned(
              top: 0,
              left: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.deepOrange,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.rocket_launch, color: Colors.white, size: 16),
                    SizedBox(width: 4),
                    Text(
                      'Boosted',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          if (card.videoSnippetUrl != null)
            const Positioned(
              bottom: 8,
              right: 8,
              child: Icon(Icons.play_circle_fill, color: Colors.white, size: 32),
            ),
        ],
      ),
    );
  }
}
