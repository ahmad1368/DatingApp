import 'package:flutter/material.dart';

import 'safety_api.dart';

const _reportReasons = [
  'HARASSMENT',
  'FAKE_PROFILE',
  'INAPPROPRIATE_CONTENT',
  'IN_PERSON_SAFETY_CONCERN',
  'SCAM_OR_SOLICITATION',
  'OTHER',
];

/// A dedicated safety hub: educational resources, date check-in scheduling
/// with emergency-contact details, and a direct user-reporting channel.
class SafetyCenterScreen extends StatefulWidget {
  const SafetyCenterScreen({super.key, required this.safetyApi});

  final SafetyApi safetyApi;

  @override
  State<SafetyCenterScreen> createState() => _SafetyCenterScreenState();
}

class _SafetyCenterScreenState extends State<SafetyCenterScreen> {
  List<SafetyResource> _resources = [];
  List<CheckIn> _checkIns = [];
  bool _isLoading = true;
  String? _errorText;
  String? _statusText;

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
      final results = await Future.wait([
        widget.safetyApi.fetchResources(),
        widget.safetyApi.fetchCheckIns(),
      ]);
      setState(() {
        _resources = results[0] as List<SafetyResource>;
        _checkIns = results[1] as List<CheckIn>;
      });
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _scheduleCheckIn(int minutesFromNow, String? location) async {
    setState(() => _errorText = null);
    try {
      await widget.safetyApi.createCheckIn(
        scheduledAt: DateTime.now().add(Duration(minutes: minutesFromNow)),
        location: location,
      );
      setState(() => _statusText = 'Check-in scheduled.');
      await _load();
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _confirmCheckIn(CheckIn checkIn) async {
    setState(() => _errorText = null);
    try {
      final updated = await widget.safetyApi.confirmCheckIn(checkIn.id);
      setState(() {
        _checkIns = _checkIns.map((c) => c.id == updated.id ? updated : c).toList();
        _statusText = "You're marked safe.";
      });
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _reportUser(String reportedUserId, String reason, String? details) async {
    setState(() => _errorText = null);
    try {
      await widget.safetyApi.reportUser(reportedUserId: reportedUserId, reason: reason, details: details);
      setState(() => _statusText = 'Report submitted. Our team will review it.');
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _openScheduleCheckInDialog() async {
    final locationController = TextEditingController();
    var minutes = 120;

    final scheduled = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Schedule a check-in'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: locationController,
                decoration: const InputDecoration(labelText: 'Location (optional)'),
              ),
              const SizedBox(height: 12),
              DropdownButton<int>(
                value: minutes,
                items: const [
                  DropdownMenuItem(value: 60, child: Text('In 1 hour')),
                  DropdownMenuItem(value: 120, child: Text('In 2 hours')),
                  DropdownMenuItem(value: 240, child: Text('In 4 hours')),
                ],
                onChanged: (value) => setDialogState(() => minutes = value ?? minutes),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Schedule')),
          ],
        ),
      ),
    );

    if (scheduled == true) {
      await _scheduleCheckIn(
        minutes,
        locationController.text.trim().isEmpty ? null : locationController.text.trim(),
      );
    }
  }

  Future<void> _openReportUserDialog() async {
    final userIdController = TextEditingController();
    final detailsController = TextEditingController();
    var reason = _reportReasons.first;

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Report a user'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: userIdController,
                decoration: const InputDecoration(labelText: 'User ID'),
              ),
              const SizedBox(height: 12),
              DropdownButton<String>(
                value: reason,
                items: _reportReasons
                    .map((r) => DropdownMenuItem(value: r, child: Text(r)))
                    .toList(),
                onChanged: (value) => setDialogState(() => reason = value ?? reason),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: detailsController,
                decoration: const InputDecoration(labelText: 'Details (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Submit')),
          ],
        ),
      ),
    );

    if (submitted == true && userIdController.text.trim().isNotEmpty) {
      await _reportUser(
        userIdController.text.trim(),
        reason,
        detailsController.text.trim().isEmpty ? null : detailsController.text.trim(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Safety Center'),
        actions: [
          IconButton(
            icon: const Icon(Icons.report_outlined),
            tooltip: 'Report a user',
            onPressed: _openReportUserDialog,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_statusText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_statusText!, style: const TextStyle(fontWeight: FontWeight.bold)),
                  ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Date Check-Ins', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    TextButton.icon(
                      onPressed: _openScheduleCheckInDialog,
                      icon: const Icon(Icons.add_alarm),
                      label: const Text('Schedule'),
                    ),
                  ],
                ),
                if (_checkIns.isEmpty) const Text('No check-ins scheduled.'),
                for (final checkIn in _checkIns) _CheckInTile(checkIn: checkIn, onConfirm: () => _confirmCheckIn(checkIn)),
                const SizedBox(height: 24),
                const Text('Safety Resources', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                for (final resource in _resources)
                  ListTile(
                    title: Text(resource.title),
                    subtitle: Text(resource.summary),
                  ),
              ],
            ),
    );
  }
}

class _CheckInTile extends StatelessWidget {
  const _CheckInTile({required this.checkIn, required this.onConfirm});

  final CheckIn checkIn;
  final VoidCallback onConfirm;

  Color? get _statusColor {
    if (checkIn.isOverdue) {
      return Colors.red;
    }
    if (checkIn.isConfirmed) {
      return Colors.green;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(checkIn.location ?? 'Date check-in'),
      subtitle: Text(
        '${checkIn.scheduledAt.toLocal()} · ${checkIn.status}',
        style: TextStyle(color: _statusColor),
      ),
      trailing: checkIn.isConfirmed
          ? const Icon(Icons.check_circle, color: Colors.green)
          : TextButton(onPressed: onConfirm, child: const Text("I'm safe")),
    );
  }
}
