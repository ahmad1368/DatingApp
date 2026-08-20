import 'package:flutter/material.dart';

import 'discovery_api.dart';

/// Premium "who liked you": a grid of everyone who has already swiped right
/// on the current user, letting them match instantly without waiting to see
/// that person come up in the main deck.
class LikedByGridScreen extends StatefulWidget {
  const LikedByGridScreen({super.key, required this.discoveryApi});

  final DiscoveryApi discoveryApi;

  @override
  State<LikedByGridScreen> createState() => _LikedByGridScreenState();
}

class _LikedByGridScreenState extends State<LikedByGridScreen> {
  List<DeckCard> _cards = [];
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
      final cards = await widget.discoveryApi.fetchLikedByGrid();
      setState(() => _cards = cards);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _respond(DeckCard card, String action) async {
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
      appBar: AppBar(title: const Text('Who Liked You')),
      body: Column(
        children: [
          if (_errorText != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
            ),
          if (_matchText != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_matchText!, style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _cards.isEmpty
                    ? const Center(child: Text('No likes yet. Keep swiping!'))
                    : GridView.builder(
                        padding: const EdgeInsets.all(12),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 0.85,
                        ),
                        itemCount: _cards.length,
                        itemBuilder: (context, index) => _LikedByTile(
                          card: _cards[index],
                          onLike: () => _respond(_cards[index], 'LIKE'),
                          onPass: () => _respond(_cards[index], 'PASS'),
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class _LikedByTile extends StatelessWidget {
  const _LikedByTile({required this.card, required this.onLike, required this.onPass});

  final DeckCard card;
  final VoidCallback onLike;
  final VoidCallback onPass;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                card.profilePhotoUrl != null
                    ? Image.network(
                        card.profilePhotoUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          color: Theme.of(context).colorScheme.surfaceContainerHighest,
                        ),
                      )
                    : Container(color: Theme.of(context).colorScheme.surfaceContainerHighest),
                if (card.isSuperLike)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(color: Colors.blue, shape: BoxShape.circle),
                      child: const Icon(Icons.star, color: Colors.white, size: 14),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Text(
              [card.name ?? 'Someone', if (card.age != null) card.age.toString()].join(', '),
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              IconButton(
                icon: const Icon(Icons.close, color: Colors.red),
                tooltip: 'Pass',
                onPressed: onPass,
              ),
              IconButton(
                icon: const Icon(Icons.favorite, color: Colors.green),
                tooltip: 'Like back',
                onPressed: onLike,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
