import 'dart:async';

import 'package:flutter/material.dart';

import 'speed_dating_api.dart';

const List<String> _weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/// Speed Dating: a scheduled weekly event that anonymously pairs the user
/// with a stranger for a single timed voice round, after which both sides
/// decide whether to match - see SpeedDatingApi's doc comment for why this
/// screen manages the round lifecycle rather than the live audio itself.
class SpeedDatingScreen extends StatefulWidget {
  const SpeedDatingScreen({super.key, required this.speedDatingApi});

  final SpeedDatingApi speedDatingApi;

  @override
  State<SpeedDatingScreen> createState() => _SpeedDatingScreenState();
}

class _SpeedDatingScreenState extends State<SpeedDatingScreen> {
  SpeedDatingSchedule? _schedule;
  SpeedDatingStatus? _status;
  bool _isLoading = true;
  String? _errorText;
  Timer? _poller;
  Timer? _countdownTimer;
  int _secondsRemaining = 0;

  @override
  void initState() {
    super.initState();
    _load();
    _poller = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }

  @override
  void dispose() {
    _poller?.cancel();
    _countdownTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final results = await Future.wait([
        widget.speedDatingApi.fetchSchedule(),
        widget.speedDatingApi.fetchStatus(),
      ]);
      _applyStatus(results[1] as SpeedDatingStatus);
      setState(() => _schedule = results[0] as SpeedDatingSchedule);
    } on SpeedDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _poll() async {
    if (!mounted) {
      return;
    }
    try {
      final status = await widget.speedDatingApi.fetchStatus();
      if (!mounted) {
        return;
      }
      _applyStatus(status);
    } catch (_) {
      // Non-critical: a missed poll just tries again on the next tick.
    }
  }

  void _applyStatus(SpeedDatingStatus status) {
    setState(() => _status = status);
    _countdownTimer?.cancel();
    if (status.isInRound && status.endsAt != null) {
      _tickCountdown();
      _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => _tickCountdown());
    }
  }

  void _tickCountdown() {
    final endsAt = _status?.endsAt;
    if (endsAt == null || !mounted) {
      return;
    }
    final remaining = endsAt.difference(DateTime.now()).inSeconds;
    setState(() => _secondsRemaining = remaining > 0 ? remaining : 0);
  }

  Future<void> _joinQueue() async {
    setState(() => _errorText = null);
    try {
      final status = await widget.speedDatingApi.joinQueue();
      _applyStatus(status);
    } on SpeedDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _leaveQueue() async {
    setState(() => _errorText = null);
    try {
      await widget.speedDatingApi.leaveQueue();
      await _load();
    } on SpeedDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _decide(bool wantsMatch) async {
    final roundId = _status?.roundId;
    if (roundId == null) {
      return;
    }
    setState(() => _errorText = null);
    try {
      final status = await widget.speedDatingApi.decideRound(roundId: roundId, wantsMatch: wantsMatch);
      _applyStatus(status);
    } on SpeedDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Speed Dating')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                Expanded(child: Center(child: _buildBody())),
              ],
            ),
    );
  }

  Widget _buildBody() {
    final status = _status;

    if (status == null || status.status == 'NONE' || status.isEnded) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (status?.isEnded ?? false)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                status!.matched ? "You matched! 🎉" : 'No match this time.',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          Text(_scheduleLabel()),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: (_schedule?.live ?? false) ? _joinQueue : null,
            child: const Text('Join Speed Dating'),
          ),
        ],
      );
    }

    if (status.isWaiting) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          const Text('Waiting for a partner…'),
          const SizedBox(height: 16),
          TextButton(onPressed: _leaveQueue, child: const Text('Cancel')),
        ],
      );
    }

    // IN_ROUND
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('🎙️ Anonymous voice room', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text('$_secondsRemaining s remaining'),
        const SizedBox(height: 16),
        if (status.myDecision != null)
          const Text('Waiting for the other person to decide…')
        else
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextButton(onPressed: () => _decide(false), child: const Text('Pass')),
              const SizedBox(width: 16),
              ElevatedButton(onPressed: () => _decide(true), child: const Text('Match')),
            ],
          ),
      ],
    );
  }

  String _scheduleLabel() {
    final schedule = _schedule;
    if (schedule == null) {
      return '';
    }
    if (schedule.live) {
      return "Speed Dating is live right now!";
    }
    final dayName = schedule.dayOfWeek >= 0 && schedule.dayOfWeek <= 6
        ? _weekdayNames[(schedule.dayOfWeek + 6) % 7]
        : '';
    return 'Next window: $dayName ${schedule.startHourUtc}:00-${schedule.endHourUtc}:00 UTC';
  }
}
