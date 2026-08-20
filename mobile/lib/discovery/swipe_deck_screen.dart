import 'package:flutter/material.dart';

import 'discovery_api.dart';
import 'swipe_card.dart';

class SwipeDeckScreen extends StatefulWidget {
  const SwipeDeckScreen({super.key, required this.discoveryApi});

  final DiscoveryApi discoveryApi;

  @override
  State<SwipeDeckScreen> createState() => _SwipeDeckScreenState();
}

class _SwipeDeckScreenState extends State<SwipeDeckScreen> {
  List<DeckCard> _deck = [];
  bool _isLoading = true;
  String? _errorText;
  String? _matchText;
  bool _incognitoEnabled = false;
  BoostStatus? _boostStatus;
  String _activeMode = 'DATING';

  @override
  void initState() {
    super.initState();
    _loadDeck();
    _loadBoostStatus();
  }

  Future<void> _loadBoostStatus() async {
    try {
      final status = await widget.discoveryApi.fetchBoostStatus();
      if (mounted) {
        setState(() => _boostStatus = status);
      }
    } catch (_) {
      // Non-critical: leave the boost banner hidden if this fails.
    }
  }

  Future<void> _loadDeck() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final deck = await widget.discoveryApi.fetchDeck();
      setState(() => _deck = deck);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleSwipe(DeckCard card, String action) async {
    setState(() {
      _deck = _deck.where((c) => c.id != card.id).toList();
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

  Future<void> _handleUndo() async {
    setState(() => _errorText = null);
    try {
      await widget.discoveryApi.undoLastSwipe();
      await _loadDeck();
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _toggleIncognito() async {
    setState(() => _errorText = null);
    try {
      final enabled = await widget.discoveryApi.setIncognitoMode(!_incognitoEnabled);
      setState(() => _incognitoEnabled = enabled);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _activateBoost() async {
    setState(() => _errorText = null);
    try {
      final status = await widget.discoveryApi.activateBoost();
      setState(() => _boostStatus = status);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _switchMode(String mode) async {
    if (mode == _activeMode) {
      return;
    }
    setState(() => _errorText = null);
    try {
      final newMode = await widget.discoveryApi.setActiveMode(mode);
      setState(() => _activeMode = newMode);
      await _loadDeck();
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  String _modeLabel(String mode) {
    switch (mode) {
      case 'BFF':
        return 'BFF';
      case 'BIZZ':
        return 'Bizz';
      case 'DATING':
      default:
        return 'Dating';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: PopupMenuButton<String>(
          tooltip: 'Switch mode',
          onSelected: _switchMode,
          itemBuilder: (context) => ['DATING', 'BFF', 'BIZZ']
              .map((mode) => PopupMenuItem<String>(value: mode, child: Text(_modeLabel(mode))))
              .toList(),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Discover · ${_modeLabel(_activeMode)}'),
              const Icon(Icons.arrow_drop_down),
            ],
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(_incognitoEnabled ? Icons.visibility_off : Icons.visibility),
            color: _incognitoEnabled ? Colors.purple : null,
            tooltip: _incognitoEnabled ? 'Incognito mode on' : 'Go incognito',
            onPressed: _isLoading ? null : _toggleIncognito,
          ),
          IconButton(
            icon: const Icon(Icons.undo),
            color: Colors.amber,
            tooltip: 'Rewind last swipe',
            onPressed: _isLoading ? null : _handleUndo,
          ),
          IconButton(
            icon: const Icon(Icons.rocket_launch),
            color: (_boostStatus?.active ?? false) ? Colors.deepOrange : null,
            tooltip: (_boostStatus?.active ?? false) ? 'Boost active' : 'Boost your profile',
            onPressed: (_boostStatus?.active ?? false) ? null : _activateBoost,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_errorText != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
            ),
          if (_boostStatus?.active ?? false)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Boosted! ${_boostStatus!.viewCount} extra views so far.',
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.deepOrange),
              ),
            ),
          if (_matchText != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_matchText!, style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _deck.isEmpty
                    ? const Center(child: Text('No more profiles nearby. Check back later!'))
                    : Center(child: _buildStack()),
          ),
          if (!_isLoading && _deck.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  FloatingActionButton(
                    heroTag: 'pass',
                    backgroundColor: Colors.red,
                    onPressed: () => _handleSwipe(_deck.first, 'PASS'),
                    child: const Icon(Icons.close),
                  ),
                  FloatingActionButton(
                    heroTag: 'superLike',
                    backgroundColor: Colors.blue,
                    onPressed: () => _handleSwipe(_deck.first, 'SUPER_LIKE'),
                    child: const Icon(Icons.star),
                  ),
                  FloatingActionButton(
                    heroTag: 'like',
                    backgroundColor: Colors.green,
                    onPressed: () => _handleSwipe(_deck.first, 'LIKE'),
                    child: const Icon(Icons.favorite),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStack() {
    final backCards = _deck.skip(1).take(2).toList().reversed.toList();

    return Stack(
      alignment: Alignment.center,
      children: [
        for (var i = 0; i < backCards.length; i++)
          Positioned(
            top: (backCards.length - i) * 6.0,
            child: Transform.scale(
              scale: 1 - (0.03 * (backCards.length - i)),
              child: IgnorePointer(child: _GhostCard(card: backCards[i])),
            ),
          ),
        SwipeCard(
          key: ValueKey(_deck.first.id),
          card: _deck.first,
          onSwiped: (action) => _handleSwipe(_deck.first, action),
        ),
      ],
    );
  }
}

class _GhostCard extends StatelessWidget {
  const _GhostCard({required this.card});

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
    );
  }
}
