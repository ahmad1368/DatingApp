import 'package:flutter/material.dart';

import '../messaging/messaging_api.dart';
import '../personality/topic_quiz_api.dart';
import '../profile/profile_poll_api.dart';
import '../safety/screen_security_api.dart';
import '../safety/screen_security_channel.dart';
import 'discovery_api.dart';
import 'liked_by_grid_screen.dart';
import 'profile_visitors_screen.dart';
import 'profile_visits_api.dart';
import 'swipe_card.dart';
import 'video_feed_screen.dart';

/// After this many continuous swipes, the deck prompts for a quick quality
/// rating (see _SwipeDeckScreenState._maybePromptDeckFeedback) - tracked
/// client side and reset once the rating is submitted or dismissed.
const int deckFeedbackSwipeInterval = 10;

class SwipeDeckScreen extends StatefulWidget {
  SwipeDeckScreen({
    super.key,
    required this.discoveryApi,
    ProfileVisitsApi? profileVisitsApi,
    ScreenSecurityChannel? screenSecurityChannel,
    ScreenSecurityApi? screenSecurityApi,
    MessagingApi? messagingApi,
    ProfilePollApi? profilePollApi,
    TopicQuizApi? topicQuizApi,
  })  : profileVisitsApi =
            profileVisitsApi ?? ProfileVisitsApi(accessToken: discoveryApi.accessToken),
        screenSecurityChannel = screenSecurityChannel ?? ScreenSecurityChannel(),
        screenSecurityApi =
            screenSecurityApi ?? ScreenSecurityApi(accessToken: discoveryApi.accessToken),
        messagingApi = messagingApi ?? MessagingApi(accessToken: discoveryApi.accessToken),
        profilePollApi = profilePollApi ?? ProfilePollApi(accessToken: discoveryApi.accessToken),
        topicQuizApi = topicQuizApi ?? TopicQuizApi(accessToken: discoveryApi.accessToken);

  final DiscoveryApi discoveryApi;
  final ProfileVisitsApi profileVisitsApi;
  final ScreenSecurityChannel screenSecurityChannel;
  final ScreenSecurityApi screenSecurityApi;
  final MessagingApi messagingApi;
  final ProfilePollApi profilePollApi;
  final TopicQuizApi topicQuizApi;

  @override
  State<SwipeDeckScreen> createState() => _SwipeDeckScreenState();
}

class _SwipeDeckScreenState extends State<SwipeDeckScreen> {
  List<DeckCard> _deck = [];
  bool _isLoading = true;
  String? _errorText;
  String? _matchText;
  bool _incognitoEnabled = false;
  bool _activeStatusVisible = true;
  bool _browseAnonymously = false;
  BoostStatus? _boostStatus;
  String _activeMode = 'DATING';
  DateTime? _snoozedUntil;
  String? _snoozeStatusMessage;
  int _swipesSinceFeedback = 0;

  @override
  void initState() {
    super.initState();
    widget.screenSecurityChannel.onScreenshotDetected = _handleScreenshotDetected;
    widget.screenSecurityChannel.setSecure(true);
    _loadDeck();
    _loadBoostStatus();
    _loadSnoozeStatus();
  }

  @override
  void dispose() {
    widget.screenSecurityChannel.setSecure(false);
    super.dispose();
  }

  /// Fires when the OS reports a screenshot was taken while browsing
  /// profiles (Android blocks captures outright via `FLAG_SECURE`, so this
  /// only fires on iOS).
  Future<void> _handleScreenshotDetected() async {
    try {
      final result = await widget.screenSecurityApi.reportViolation('PROFILE');
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.warning)));
    } on ScreenSecurityApiException {
      // Best-effort reporting; don't block browsing if this fails.
    }
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

  Future<void> _loadSnoozeStatus() async {
    try {
      final status = await widget.discoveryApi.fetchSnoozeStatus();
      if (mounted) {
        setState(() {
          _snoozedUntil = status.snoozedUntil;
          _snoozeStatusMessage = status.statusMessage;
        });
      }
    } catch (_) {
      // Non-critical: leave the snooze banner hidden if this fails.
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

  Future<void> _handleSwipe(
    DeckCard card,
    String action, {
    String? complimentText,
    String? complimentTarget,
    String? icebreakerPromptId,
    int? icebreakerOptionIndex,
    String? passReason,
  }) async {
    setState(() {
      _deck = _deck.where((c) => c.id != card.id).toList();
      _matchText = null;
    });
    try {
      final result = await widget.discoveryApi.recordSwipe(
        targetUserId: card.id,
        action: action,
        complimentText: complimentText,
        complimentTarget: complimentTarget,
        icebreakerPromptId: icebreakerPromptId,
        icebreakerOptionIndex: icebreakerOptionIndex,
        passReason: passReason,
      );
      if (result.matched) {
        setState(() => _matchText = "It's a match with ${card.name ?? 'someone new'}!");
      }
      _swipesSinceFeedback += 1;
      if (_swipesSinceFeedback >= deckFeedbackSwipeInterval) {
        _swipesSinceFeedback = 0;
        await _promptDeckFeedback();
      }
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// "Interactive Compatibility Quiz Cards": surfaces the next unanswered
  /// topic-quiz question (see TopicQuizApi.fetchNextQuestion), so a
  /// candidate's compatibility score (see TopicQuizApi.fetchAlignment) can
  /// keep refining during a discovery session without requiring a trip to a
  /// separate settings screen.
  Future<void> _openCompatibilityQuiz() async {
    TopicQuizQuestion? nextQuestion;
    try {
      nextQuestion = await widget.topicQuizApi.fetchNextQuestion();
    } on TopicQuizApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!mounted) {
      return;
    }
    if (nextQuestion == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You've answered every compatibility question!")),
      );
      return;
    }
    final question = nextQuestion;

    final stance = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Quick compatibility question'),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(question.statement),
          ),
          const SizedBox(height: 12),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('AGREE'),
            child: const Text('Agree'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('NEUTRAL'),
            child: const Text('Neutral'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('DISAGREE'),
            child: const Text('Disagree'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Skip'),
          ),
        ],
      ),
    );
    if (stance == null) {
      return;
    }
    try {
      await widget.topicQuizApi.answerQuestion(question.id, stance);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Answer saved!')));
      }
    } on TopicQuizApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  /// Algorithm-driven match quality feedback: asks how the last stretch of
  /// the deck felt and submits the rating so the backend can adjust this
  /// user's proximity weight (see DiscoveryApi.submitDeckFeedback). Silently
  /// dropped if the user dismisses the dialog or the request fails - this
  /// is a soft signal, not something worth blocking or erroring over.
  Future<void> _promptDeckFeedback() async {
    if (!mounted) {
      return;
    }
    final rating = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('How are these matches?'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('GOOD'),
            child: const Text('Great matches'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('OKAY'),
            child: const Text("They're okay"),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('BAD'),
            child: const Text('Not relevant to me'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Skip'),
          ),
        ],
      ),
    );
    if (rating == null) {
      return;
    }
    try {
      await widget.discoveryApi.submitDeckFeedback(rating);
    } on DiscoveryApiException {
      // Non-critical: a failed feedback submission shouldn't interrupt swiping.
    }
  }

  /// Passing via the explicit button (not the quick swipe gesture) offers an
  /// optional quick-pick reason to help refine future matches; skippable.
  Future<void> _handlePassWithReason(DeckCard card) async {
    List<String> reasons;
    try {
      reasons = await widget.discoveryApi.fetchPassReasons();
    } catch (_) {
      reasons = const [];
    }
    if (!mounted) {
      return;
    }

    final reason = reasons.isEmpty
        ? null
        : await showDialog<String>(
            context: context,
            builder: (context) => SimpleDialog(
              title: const Text('Why pass? (optional)'),
              children: [
                for (final reason in reasons)
                  SimpleDialogOption(
                    onPressed: () => Navigator.of(context).pop(reason),
                    child: Text(reason),
                  ),
                SimpleDialogOption(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Skip'),
                ),
              ],
            ),
          );

    await _handleSwipe(card, 'PASS', passReason: reason);
  }

  /// Composes a short pre-match compliment, then likes with it attached.
  Future<void> _handleComplimentLike(DeckCard card) async {
    final controller = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Send a compliment'),
        content: TextField(
          controller: controller,
          maxLength: 200,
          decoration: const InputDecoration(hintText: 'Say something nice…'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Send with like'),
          ),
        ],
      ),
    );

    if (text == null || text.isEmpty) {
      return;
    }
    await _handleSwipe(card, 'LIKE', complimentText: text);
  }

  /// A Super Like requires an attached note so it stands out prominently in
  /// the recipient's incoming likes queue (server-enforced - see
  /// DiscoveryService.recordSwipe). Cancelling the composer aborts the
  /// Super Like entirely rather than sending one with no note.
  Future<void> _handleSuperLike(DeckCard card) async {
    final controller = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Super Like'),
        content: TextField(
          controller: controller,
          maxLength: 200,
          decoration: const InputDecoration(hintText: 'Add a note (required)…'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Send Super Like'),
          ),
        ],
      ),
    );

    if (text == null || text.isEmpty) {
      return;
    }
    await _handleSwipe(card, 'SUPER_LIKE', complimentText: text);
  }

  /// Answers a dual-choice icebreaker while liking, so if it's a match the
  /// chat opens with both people's answers already compared.
  Future<void> _handleIcebreakerLike(DeckCard card) async {
    List<IcebreakerPrompt> prompts;
    try {
      prompts = await widget.messagingApi.fetchIcebreakerPrompts();
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }
    if (!mounted) {
      return;
    }

    final prompt = await showDialog<IcebreakerPrompt>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Pick an icebreaker'),
        children: [
          for (final prompt in prompts)
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(prompt),
              child: Text(prompt.question),
            ),
        ],
      ),
    );
    if (prompt == null || !mounted) {
      return;
    }

    final optionIndex = await showDialog<int>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text(prompt.question),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop(0),
            child: Text(prompt.optionA),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop(1),
            child: Text(prompt.optionB),
          ),
        ],
      ),
    );
    if (optionIndex == null) {
      return;
    }

    await _handleSwipe(
      card,
      'LIKE',
      icebreakerPromptId: prompt.id,
      icebreakerOptionIndex: optionIndex,
    );
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

  /// Records a profile view for the given card. Fire-and-forget: a failure
  /// here (e.g. a non-premium user requesting anonymous browsing) shouldn't
  /// block looking at the card, so it's silently ignored.
  Future<void> _recordVisit(DeckCard card) async {
    try {
      await widget.profileVisitsApi.recordVisit(card.id, anonymous: _browseAnonymously);
    } on ProfileVisitsApiException {
      // Non-critical: viewing the card should never fail because of this.
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

  Future<void> _toggleActiveStatusVisibility() async {
    setState(() => _errorText = null);
    try {
      final enabled = await widget.discoveryApi.setActiveStatusVisibility(!_activeStatusVisible);
      setState(() => _activeStatusVisible = enabled);
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

  Future<void> _activateSuperBoost() async {
    if (_boostStatus?.active ?? false) {
      return;
    }
    setState(() => _errorText = null);
    try {
      final status = await widget.discoveryApi.activateSuperBoost();
      setState(() => _boostStatus = status);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _toggleSnooze() async {
    final enabling = _snoozedUntil == null;
    String? statusMessage;
    if (enabling) {
      statusMessage = await _promptForSnoozeStatusMessage();
      if (statusMessage == null) {
        return;
      }
    }

    setState(() => _errorText = null);
    try {
      final status = await widget.discoveryApi.setSnoozeMode(
        enabling,
        statusMessage: (statusMessage != null && statusMessage.isNotEmpty) ? statusMessage : null,
      );
      setState(() {
        _snoozedUntil = status.snoozedUntil;
        _snoozeStatusMessage = status.statusMessage;
      });
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<String?> _promptForSnoozeStatusMessage() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Pause discovery'),
        content: TextField(
          controller: controller,
          maxLength: 100,
          decoration: const InputDecoration(
            labelText: 'Status message (optional)',
            hintText: 'On Vacation',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Snooze'),
          ),
        ],
      ),
    );
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
              Flexible(
                child: Text(
                  'Discover · ${_modeLabel(_activeMode)}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const Icon(Icons.arrow_drop_down),
            ],
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.quiz),
            tooltip: 'Compatibility quiz',
            onPressed: _openCompatibilityQuiz,
          ),
          IconButton(
            icon: const Icon(Icons.video_collection),
            tooltip: 'Video feed',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => VideoFeedScreen(discoveryApi: widget.discoveryApi),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.grid_view),
            tooltip: 'Who liked you',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => LikedByGridScreen(discoveryApi: widget.discoveryApi),
              ),
            ),
          ),
          IconButton(
            icon: Icon(_incognitoEnabled ? Icons.visibility_off : Icons.visibility),
            color: _incognitoEnabled ? Colors.purple : null,
            tooltip: _incognitoEnabled ? 'Incognito mode on' : 'Go incognito',
            onPressed: _isLoading ? null : _toggleIncognito,
          ),
          IconButton(
            icon: Icon(_activeStatusVisible ? Icons.circle : Icons.circle_outlined),
            color: _activeStatusVisible ? Colors.green : null,
            tooltip: _activeStatusVisible
                ? 'Active status visible - tap to hide'
                : 'Active status hidden - tap to show',
            onPressed: _toggleActiveStatusVisibility,
          ),
          IconButton(
            icon: Icon(_browseAnonymously ? Icons.person_off : Icons.person_off_outlined),
            color: _browseAnonymously ? Colors.purple : null,
            tooltip: _browseAnonymously
                ? "Browsing anonymously - your visits aren't recorded"
                : 'Browse anonymously (premium)',
            onPressed: () => setState(() => _browseAnonymously = !_browseAnonymously),
          ),
          IconButton(
            icon: const Icon(Icons.remove_red_eye_outlined),
            tooltip: 'Profile visitors',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => ProfileVisitorsScreen(profileVisitsApi: widget.profileVisitsApi),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.undo),
            color: Colors.amber,
            tooltip: 'Rewind last swipe',
            onPressed: _isLoading ? null : _handleUndo,
          ),
          // No `tooltip:` here deliberately: IconButton's built-in Tooltip
          // shows on long-press on mobile, which would swallow the gesture
          // meant for the GestureDetector below and Super Boost would never
          // fire.
          GestureDetector(
            onLongPress: (_boostStatus?.active ?? false) ? null : _activateSuperBoost,
            child: IconButton(
              icon: const Icon(Icons.rocket_launch),
              color: (_boostStatus?.active ?? false) ? Colors.deepOrange : null,
              onPressed: (_boostStatus?.active ?? false) ? null : _activateBoost,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.bedtime),
            color: _snoozedUntil != null ? Colors.indigo : null,
            tooltip: _snoozedUntil != null ? 'Snoozed - tap to resume' : 'Snooze / travel mode',
            onPressed: _toggleSnooze,
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
                _boostStatus!.tier == 'SUPER'
                    ? 'Super Boosted (${_boostStatus!.viewMultiplier}x views)! ${_boostStatus!.viewCount} extra views so far.'
                    : 'Boosted! ${_boostStatus!.viewCount} extra views so far.',
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.deepOrange),
              ),
            ),
          if (_snoozedUntil != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _snoozeStatusMessage != null
                    ? "You're snoozed until ${_snoozedUntil!.toLocal()} - $_snoozeStatusMessage"
                    : "You're snoozed until ${_snoozedUntil!.toLocal()}. Hidden from new matches.",
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.indigo),
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
                    onPressed: () => _handlePassWithReason(_deck.first),
                    child: const Icon(Icons.close),
                  ),
                  FloatingActionButton(
                    heroTag: 'superLike',
                    backgroundColor: Colors.blue,
                    tooltip: 'Super Like with a note',
                    onPressed: () => _handleSuperLike(_deck.first),
                    child: const Icon(Icons.star),
                  ),
                  FloatingActionButton(
                    heroTag: 'like',
                    backgroundColor: Colors.green,
                    onPressed: () => _handleSwipe(_deck.first, 'LIKE'),
                    child: const Icon(Icons.favorite),
                  ),
                  FloatingActionButton(
                    heroTag: 'complimentLike',
                    backgroundColor: Colors.purple,
                    tooltip: 'Like with a compliment',
                    onPressed: () => _handleComplimentLike(_deck.first),
                    child: const Icon(Icons.comment),
                  ),
                  FloatingActionButton(
                    heroTag: 'icebreakerLike',
                    backgroundColor: Colors.teal,
                    tooltip: 'Like with an icebreaker',
                    onPressed: () => _handleIcebreakerLike(_deck.first),
                    child: const Icon(Icons.quiz_outlined),
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
          onTap: () => _recordVisit(_deck.first),
          viewerAccessToken: widget.discoveryApi.accessToken,
          profilePollApi: widget.profilePollApi,
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
