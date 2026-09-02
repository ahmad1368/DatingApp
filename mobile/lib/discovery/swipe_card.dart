import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../profile/profile_poll_api.dart';
import '../profile/voice_intro_player.dart';
import '../safety/watermark_overlay.dart';
import 'discovery_api.dart';

const double _swipeThreshold = 100.0;
const double _maxRotationRadians = 0.4;

const Map<String, String> _relationshipGoalLabels = {
  'LONG_TERM': 'Long-term relationship',
  'CASUAL': 'Something casual',
  'FRIENDSHIP': 'New friends',
  'NOT_SURE': 'Still figuring it out',
};

/// A single draggable profile card: drag right to like, left to pass.
/// Flings off-screen and calls [onSwiped] with 'LIKE' or 'PASS' once past
/// the threshold; otherwise springs back to center.
class SwipeCard extends StatefulWidget {
  const SwipeCard({
    super.key,
    required this.card,
    required this.onSwiped,
    this.onTap,
    this.viewerAccessToken,
    this.profilePollApi,
  });

  final DeckCard card;
  final ValueChanged<String> onSwiped;
  final VoidCallback? onTap;

  /// The current viewer's access token, used only to derive the traceable
  /// watermark overlaid on the card (see [WatermarkOverlay]). Omitted in
  /// contexts (like most tests) that don't need the watermark.
  final String? viewerAccessToken;

  /// When supplied, fetches and renders this candidate's profile poll
  /// (see ProfilePollApi) - a prospective match can vote with a single
  /// tap, before ever matching. Omitted in contexts that don't need it.
  final ProfilePollApi? profilePollApi;

  @override
  State<SwipeCard> createState() => _SwipeCardState();
}

class _SwipeCardState extends State<SwipeCard> with SingleTickerProviderStateMixin {
  Offset _dragOffset = Offset.zero;
  late final AnimationController _animController;
  Animation<Offset>? _animation;
  bool _hapticFired = false;
  ProfilePoll? _poll;
  bool _isVoting = false;

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
    _loadPoll();
  }

  @override
  void didUpdateWidget(SwipeCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.card.id != widget.card.id) {
      setState(() => _poll = null);
      _loadPoll();
    }
  }

  Future<void> _loadPoll() async {
    final profilePollApi = widget.profilePollApi;
    if (profilePollApi == null) {
      return;
    }
    try {
      final poll = await profilePollApi.fetchPoll(widget.card.id);
      if (mounted) {
        setState(() => _poll = poll);
      }
    } on ProfilePollApiException {
      // Non-critical: the card is still fully usable without its poll.
    }
  }

  Future<void> _vote(int optionIndex) async {
    final profilePollApi = widget.profilePollApi;
    if (profilePollApi == null || _isVoting) {
      return;
    }
    setState(() => _isVoting = true);
    try {
      final poll = await profilePollApi.vote(targetUserId: widget.card.id, optionIndex: optionIndex);
      if (mounted) {
        setState(() => _poll = poll);
      }
    } on ProfilePollApiException {
      // Non-critical: leave the poll showing its unvoted state on failure.
    } finally {
      if (mounted) {
        setState(() => _isVoting = false);
      }
    }
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
    final accessToken = widget.viewerAccessToken;
    final content = _CardContent(card: widget.card, poll: _poll, onVote: _isVoting ? null : _vote);
    final cardContent = accessToken != null
        ? WatermarkOverlay(accessToken: accessToken, child: content)
        : content;

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
              cardContent,
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
  const _CardContent({required this.card, this.poll, this.onVote});

  final DeckCard card;
  final ProfilePoll? poll;
  final ValueChanged<int>? onVote;

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
        alignment: Alignment.topCenter,
        children: [
          if (card.profilePhotoUrl != null)
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: _buildProfilePhoto(),
              ),
            ),
          if (card.voiceIntroUrl != null)
            Positioned(
              top: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: IconTheme(
                  data: const IconThemeData(color: Colors.white),
                  child: DefaultTextStyle(
                    style: const TextStyle(color: Colors.white),
                    child: VoiceIntroPlayer(
                      url: card.voiceIntroUrl!,
                      durationSeconds: card.voiceIntroDurationSeconds,
                    ),
                  ),
                ),
              ),
            ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(
                [card.name ?? 'Someone', if (card.age != null) card.age.toString()].join(', '),
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              if (card.relationshipGoal != null) ...[
                const SizedBox(height: 4),
                Chip(
                  avatar: const Icon(Icons.flag, size: 16),
                  label: Text(_relationshipGoalLabels[card.relationshipGoal] ?? card.relationshipGoal!),
                  backgroundColor: Colors.indigo.shade100,
                  visualDensity: VisualDensity.compact,
                ),
              ],
              if (card.distanceKm != null)
                Text('${card.distanceKm!.toStringAsFixed(1)} km away'),
              if (card.mutualConnectionCount > 0)
                Row(
                  children: [
                    const Icon(Icons.people_alt, size: 16),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        card.mutualConnectionCount == 1
                            ? '1 mutual connection'
                            : '${card.mutualConnectionCount} mutual connections',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              if (card.sharedSchool != null)
                Row(
                  children: [
                    const Icon(Icons.school, size: 16),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        'You both went to ${card.sharedSchool}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
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
              if (card.communicationBoundaries != null) ...[
                const SizedBox(height: 8),
                Text(
                  card.communicationBoundaries!,
                  style: const TextStyle(fontStyle: FontStyle.italic),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (card.relationshipStructure != null) ...[
                const SizedBox(height: 8),
                Chip(
                  avatar: const Icon(Icons.diversity_3, size: 16),
                  label: Text(card.relationshipStructure!),
                  backgroundColor: Colors.orange.shade100,
                  visualDensity: VisualDensity.compact,
                ),
              ],
              if (card.kinkTagBadges.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final badge in card.kinkTagBadges)
                      Chip(
                        label: Text(badge),
                        backgroundColor: Colors.purple.shade100,
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
              if (card.sharedCommunityGroups.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final group in card.sharedCommunityGroups)
                      Chip(
                        avatar: const Icon(Icons.groups, size: 16),
                        label: Text(group),
                        backgroundColor: Colors.orange.shade100,
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ],
              if (card.linkedPartners.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final partner in card.linkedPartners)
                      Chip(
                        avatar: const Icon(Icons.favorite, size: 16),
                        label: Text('Linked with ${partner.partnerName ?? 'a partner'}'),
                        backgroundColor: Colors.pink.shade100,
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
                  children: [
                    for (final interest in card.interests)
                      Chip(
                        label: Text(interest),
                        backgroundColor: card.sharedInterests.contains(interest)
                            ? Colors.amber.shade200
                            : null,
                        avatar: card.sharedInterests.contains(interest)
                            ? const Icon(Icons.favorite, size: 14)
                            : null,
                      ),
                  ],
                ),
              ],
              if (poll != null && poll!.hasPoll) ...[
                const SizedBox(height: 8),
                _PollBlock(poll: poll!, onVote: onVote),
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

  Widget _buildProfilePhoto() {
    final image = Image.network(
      card.profilePhotoUrl!,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
    );
    if (!card.profilePhotoBlurred) {
      return image;
    }
    // Incognito photo blur: hidden from anyone browsing the deck until they
    // match - see DeckCard.profilePhotoBlurred.
    return ImageFiltered(imageFilter: ImageFilter.blur(sigmaX: 25, sigmaY: 25), child: image);
  }
}

/// The poll embedded on a candidate's card - a question with tappable
/// options before the viewer has voted, or a result breakdown (with their
/// own pick highlighted) once they have. See ProfilePollApi.
class _PollBlock extends StatelessWidget {
  const _PollBlock({required this.poll, this.onVote});

  final ProfilePoll poll;
  final ValueChanged<int>? onVote;

  @override
  Widget build(BuildContext context) {
    final hasVoted = poll.myOptionIndex != null;

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            poll.question!,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          for (var i = 0; i < poll.options.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: hasVoted ? _buildResultRow(i) : _buildOptionButton(i),
            ),
        ],
      ),
    );
  }

  Widget _buildOptionButton(int index) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: Colors.white),
          padding: const EdgeInsets.symmetric(vertical: 4),
        ),
        onPressed: onVote == null ? null : () => onVote!(index),
        child: Text(poll.options[index]),
      ),
    );
  }

  Widget _buildResultRow(int index) {
    final isMine = poll.myOptionIndex == index;
    final percentage = poll.totalVotes > 0 ? (poll.voteCounts[index] / poll.totalVotes * 100).round() : 0;

    return Row(
      children: [
        Icon(
          isMine ? Icons.check_circle : Icons.circle_outlined,
          color: Colors.white,
          size: 16,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            '${poll.options[index]} - $percentage%',
            style: TextStyle(
              color: Colors.white,
              fontWeight: isMine ? FontWeight.bold : FontWeight.normal,
            ),
          ),
        ),
      ],
    );
  }
}
