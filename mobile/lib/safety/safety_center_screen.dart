import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';

import '../messaging/messaging_api.dart';
import 'safety_api.dart';

const _reportReasons = [
  'HARASSMENT',
  'FAKE_PROFILE',
  'INAPPROPRIATE_CONTENT',
  'IN_PERSON_SAFETY_CONCERN',
  'SCAM_OR_SOLICITATION',
  'OTHER',
];

class Coordinates {
  const Coordinates({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

Future<Coordinates> _defaultCurrentPositionProvider() async {
  final serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    throw SafetyApiException('Location services are disabled. Please enable them to send SOS.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
    throw SafetyApiException('Location permission is required to send an SOS alert.');
  }

  final position = await Geolocator.getCurrentPosition();
  return Coordinates(latitude: position.latitude, longitude: position.longitude);
}

/// A dedicated safety hub: educational resources, date check-in scheduling
/// with emergency-contact details, a reusable emergency-contact list, a
/// quick-trigger SOS button, a direct user-reporting channel, and - when
/// [messagingApi] is supplied - one-tap blocking of an existing match
/// without needing to open that match's chat first.
class SafetyCenterScreen extends StatefulWidget {
  const SafetyCenterScreen({
    super.key,
    required this.safetyApi,
    this.messagingApi,
    this.currentPositionProvider = _defaultCurrentPositionProvider,
  });

  final SafetyApi safetyApi;
  final MessagingApi? messagingApi;
  final Future<Coordinates> Function() currentPositionProvider;

  @override
  State<SafetyCenterScreen> createState() => _SafetyCenterScreenState();
}

class _SafetyCenterScreenState extends State<SafetyCenterScreen> {
  List<SafetyResource> _resources = [];
  List<EmergencyHotline> _hotlines = [];
  List<CheckIn> _checkIns = [];
  List<EmergencyContact> _contacts = [];
  List<MatchSummary> _matches = [];
  bool _isLoading = true;
  bool _isSendingSos = false;
  bool _isSharingLocation = false;
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
        widget.safetyApi.fetchEmergencyHotlines(),
        widget.safetyApi.fetchCheckIns(),
        widget.safetyApi.fetchEmergencyContacts(),
      ]);
      setState(() {
        _resources = results[0] as List<SafetyResource>;
        _hotlines = results[1] as List<EmergencyHotline>;
        _checkIns = results[2] as List<CheckIn>;
        _contacts = results[3] as List<EmergencyContact>;
      });
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }

    final messagingApi = widget.messagingApi;
    if (messagingApi != null) {
      try {
        final matches = await messagingApi.fetchMyMatches();
        if (mounted) {
          setState(() => _matches = matches);
        }
      } on MessagingApiException {
        // Non-critical: the rest of the safety center still works without
        // the quick-block match list.
      }
    }
  }

  /// One-tap block of an existing match, right from the safety center -
  /// unmatching is this app's stand-in for blocking (see MessagingApi.
  /// unmatch's doc comment), tagged as a safety-driven block so it's
  /// distinguishable in moderation monitoring from a routine unmatch.
  Future<void> _blockMatch(MatchSummary match) async {
    final messagingApi = widget.messagingApi;
    if (messagingApi == null) {
      return;
    }
    setState(() => _errorText = null);
    try {
      await messagingApi.unmatch(match.matchId, reason: 'Safety concern');
      setState(() {
        _matches = _matches.where((existing) => existing.matchId != match.matchId).toList();
        _statusText = '${match.otherUserName ?? 'This match'} has been blocked.';
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _addEmergencyContact(String name, String phone) async {
    setState(() => _errorText = null);
    try {
      final contact = await widget.safetyApi.addEmergencyContact(name: name, phone: phone);
      setState(() => _contacts = [..._contacts, contact]);
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _deleteEmergencyContact(EmergencyContact contact) async {
    setState(() => _errorText = null);
    try {
      await widget.safetyApi.deleteEmergencyContact(contact.id);
      setState(() => _contacts = _contacts.where((c) => c.id != contact.id).toList());
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _triggerSos() async {
    setState(() {
      _isSendingSos = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final coordinates = await widget.currentPositionProvider();
      final result = await widget.safetyApi.triggerSos(
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      );
      setState(() {
        _statusText = 'SOS sent to ${result.notifiedContactIds.length} contact(s).';
      });
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSendingSos = false);
      }
    }
  }

  Future<void> _shareDateLocation(String? destinationAddress) async {
    setState(() {
      _isSharingLocation = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final coordinates = await widget.currentPositionProvider();
      final result = await widget.safetyApi.shareDateLocation(
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        destinationAddress: destinationAddress,
      );
      setState(() {
        _statusText = 'Live location shared with ${result.notifiedContactIds.length} contact(s).';
      });
    } on SafetyApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSharingLocation = false);
      }
    }
  }

  Future<void> _openShareLocationDialog() async {
    final destinationController = TextEditingController();

    final shared = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Share your live location'),
        content: TextField(
          controller: destinationController,
          decoration: const InputDecoration(labelText: 'Destination address (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Share')),
        ],
      ),
    );

    if (shared == true) {
      await _shareDateLocation(
        destinationController.text.trim().isEmpty ? null : destinationController.text.trim(),
      );
    }
  }

  Future<void> _scheduleCheckIn(
    int minutesFromNow,
    String? location,
    String? emergencyContactName,
    String? emergencyContactPhone,
  ) async {
    setState(() => _errorText = null);
    try {
      await widget.safetyApi.createCheckIn(
        scheduledAt: DateTime.now().add(Duration(minutes: minutesFromNow)),
        location: location,
        emergencyContactName: emergencyContactName,
        emergencyContactPhone: emergencyContactPhone,
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

  Future<void> _shareDatePlan(CheckIn checkIn) async {
    setState(() => _errorText = null);
    try {
      final link = await widget.safetyApi.generateDatePlanShareLink(checkIn.id);
      if (!mounted) {
        return;
      }
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Share this date plan'),
          content: SelectableText(link),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: link));
                Navigator.of(context).pop();
              },
              child: const Text('Copy link'),
            ),
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
          ],
        ),
      );
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
    final contactNameController = TextEditingController();
    final contactPhoneController = TextEditingController();
    var minutes = 120;

    final scheduled = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Schedule a check-in'),
          content: SingleChildScrollView(
            child: Column(
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
                const SizedBox(height: 12),
                TextField(
                  controller: contactNameController,
                  decoration: const InputDecoration(labelText: 'Emergency contact name (optional)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: contactPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Emergency contact phone (optional)',
                    helperText: "They'll get a text if you miss your check-in.",
                  ),
                ),
              ],
            ),
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
        contactNameController.text.trim().isEmpty ? null : contactNameController.text.trim(),
        contactPhoneController.text.trim().isEmpty ? null : contactPhoneController.text.trim(),
      );
    }
  }

  Future<void> _openAddEmergencyContactDialog() async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();

    final added = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add emergency contact'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Add')),
        ],
      ),
    );

    if (added == true &&
        nameController.text.trim().isNotEmpty &&
        phoneController.text.trim().isNotEmpty) {
      await _addEmergencyContact(nameController.text.trim(), phoneController.text.trim());
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isSendingSos ? null : _triggerSos,
        backgroundColor: Colors.red,
        icon: _isSendingSos
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Icon(Icons.sos),
        label: const Text('SOS'),
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
                OutlinedButton.icon(
                  onPressed: _isSharingLocation ? null : _openShareLocationDialog,
                  icon: _isSharingLocation
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.share_location_outlined),
                  label: const Text('Share my live location'),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Emergency Contacts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    TextButton.icon(
                      onPressed: _openAddEmergencyContactDialog,
                      icon: const Icon(Icons.person_add_alt),
                      label: const Text('Add'),
                    ),
                  ],
                ),
                if (_contacts.isEmpty) const Text('No emergency contacts yet.'),
                for (final contact in _contacts)
                  ListTile(
                    title: Text(contact.name),
                    subtitle: Text(contact.phone),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete),
                      tooltip: 'Remove',
                      onPressed: () => _deleteEmergencyContact(contact),
                    ),
                  ),
                if (widget.messagingApi != null) ...[
                  const SizedBox(height: 24),
                  const Text('Block a Match', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  if (_matches.isEmpty) const Text('No active matches.'),
                  for (final match in _matches)
                    ListTile(
                      title: Text(match.otherUserName ?? 'Someone new'),
                      trailing: TextButton(
                        onPressed: () => _blockMatch(match),
                        child: const Text('Block'),
                      ),
                    ),
                ],
                const SizedBox(height: 24),
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
                for (final checkIn in _checkIns)
                  _CheckInTile(
                    checkIn: checkIn,
                    onConfirm: () => _confirmCheckIn(checkIn),
                    onShare: () => _shareDatePlan(checkIn),
                  ),
                const SizedBox(height: 24),
                const Text('Safety Resources', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                for (final resource in _resources)
                  ListTile(
                    title: Text(resource.title),
                    subtitle: Text(resource.summary),
                  ),
                const SizedBox(height: 24),
                const Text(
                  'Crisis Support Hotlines',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                for (final hotline in _hotlines)
                  ListTile(
                    title: Text(hotline.name),
                    subtitle: Text('${hotline.phoneNumber}\n${hotline.description}'),
                    isThreeLine: true,
                  ),
              ],
            ),
    );
  }
}

class _CheckInTile extends StatelessWidget {
  const _CheckInTile({required this.checkIn, required this.onConfirm, required this.onShare});

  final CheckIn checkIn;
  final VoidCallback onConfirm;
  final VoidCallback onShare;

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
        '${checkIn.scheduledAt.toLocal()} · ${checkIn.status}'
        '${checkIn.alertSent ? ' · contact alerted' : ''}',
        style: TextStyle(color: _statusColor),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.share),
            tooltip: 'Share this date plan',
            onPressed: onShare,
          ),
          if (checkIn.isConfirmed)
            const Icon(Icons.check_circle, color: Colors.green)
          else
            TextButton(onPressed: onConfirm, child: const Text("I'm safe")),
        ],
      ),
    );
  }
}
