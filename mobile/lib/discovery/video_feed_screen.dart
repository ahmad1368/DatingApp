import 'package:flutter/material.dart';

import 'discovery_api.dart';

/// A vertical, TikTok-style feed of candidates who have video content (a
/// profile video snippet, or a video answer to a profile prompt) - swiping
/// here always acts directly on that video, via the same [DiscoveryApi.
/// recordSwipe] the main deck uses. There is no video-playback library in
/// this codebase (see swipe_card.dart's static play-icon badge for the
/// same limitation), so each card shows a placeholder instead of inline
/// playback.
class VideoFeedScreen extends StatefulWidget {
  const VideoFeedScreen({super.key, required this.discoveryApi});

  final DiscoveryApi discoveryApi;

  @override
  State<VideoFeedScreen> createState() => _VideoFeedScreenState();
}

class _VideoFeedScreenState extends State<VideoFeedScreen> {
  List<VideoFeedCard> _cards = [];
  bool _isLoading = true;
  String? _errorText;
  String? _matchText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final cards = await widget.discoveryApi.fetchVideoFeed();
      setState(() => _cards = cards);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _swipe(VideoFeedCard card, String action) async {
    setState(() {
      _cards = _cards.where((c) => c.id != card.id).toList();
      _matchText = null;
    });
    try {
      final result = await widget.discoveryApi.recordSwipe(targetUserId: card.id, action: action);
      if (result.matched) {
        setState(() => _matchText = "It's a match with ${card.name ?? 'someone new'}!");
      }
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(title: const Text('Video Feed')),
      body: Column(
        children: [
          if (_matchText != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _matchText!,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorText != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                        ),
                      )
                    : _cards.isEmpty
                        ? const Center(
                            child: Text(
                              'No video profiles nearby right now.',
                              style: TextStyle(color: Colors.white),
                            ),
                          )
                        : Column(
                            children: [
                              Expanded(child: _buildCard(_cards.first)),
                              Padding(
                                padding: const EdgeInsets.all(24),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                                  children: [
                                    FloatingActionButton(
                                      heroTag: 'videoPass',
                                      backgroundColor: Colors.red,
                                      onPressed: () => _swipe(_cards.first, 'PASS'),
                                      child: const Icon(Icons.close),
                                    ),
                                    FloatingActionButton(
                                      heroTag: 'videoLike',
                                      backgroundColor: Colors.green,
                                      onPressed: () => _swipe(_cards.first, 'LIKE'),
                                      child: const Icon(Icons.favorite),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(VideoFeedCard card) {
    return Container(
      key: ValueKey(card.id),
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade900,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.play_circle_fill, color: Colors.white, size: 64),
          const SizedBox(height: 16),
          Text(
            '${card.name ?? 'Someone new'}${card.age != null ? ', ${card.age}' : ''}',
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          if (card.promptQuestion != null) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                card.promptQuestion!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
