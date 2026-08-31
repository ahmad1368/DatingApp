import 'package:flutter/material.dart';

import 'social_graph_api.dart';

/// Lets a user sync their address book so shared mutual contacts can be
/// highlighted on candidate profile cards in the swipe deck.
class SocialContactsScreen extends StatefulWidget {
  const SocialContactsScreen({super.key, required this.socialGraphApi});

  final SocialGraphApi socialGraphApi;

  @override
  State<SocialContactsScreen> createState() => _SocialContactsScreenState();
}

class _SocialContactsScreenState extends State<SocialContactsScreen> {
  final _contactController = TextEditingController();
  bool _isSyncing = false;
  bool _hideFromMutualConnections = false;
  String? _errorText;
  String? _statusText;

  @override
  void dispose() {
    _contactController.dispose();
    super.dispose();
  }

  Future<void> _syncContacts() async {
    final contacts = _contactController.text
        .split(RegExp(r'[,\n]'))
        .map((c) => c.trim())
        .where((c) => c.isNotEmpty)
        .toList();

    setState(() {
      _isSyncing = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final result = await widget.socialGraphApi.syncContacts(contacts);
      setState(() {
        _statusText = 'Synced ${result.totalSynced} contacts. '
            "We'll highlight anyone you both know on their profile card.";
      });
    } on SocialGraphApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSyncing = false);
      }
    }
  }

  Future<void> _toggleHideFromMutualConnections(bool enabled) async {
    setState(() => _errorText = null);
    try {
      final result = await widget.socialGraphApi.setHideFromMutualConnections(enabled);
      setState(() => _hideFromMutualConnections = result);
    } on SocialGraphApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mutual Connections')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            "Sync your contacts to see mutual friends on candidates' profile cards. "
            'Syncing again replaces your previous list.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _contactController,
            minLines: 1,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Phone numbers or emails (comma or newline separated)',
            ),
          ),
          const SizedBox(height: 8),
          ElevatedButton(
            onPressed: _isSyncing ? null : _syncContacts,
            child: _isSyncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Sync contacts'),
          ),
          if (_errorText != null) ...[
            const SizedBox(height: 8),
            Text(_errorText!, style: const TextStyle(color: Colors.red)),
          ],
          if (_statusText != null) ...[
            const SizedBox(height: 8),
            Text(_statusText!),
          ],
          const Divider(height: 32),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Hide from mutual connections'),
            subtitle: const Text(
              "Don't show my profile to direct contacts, mutual friends, or phonebook "
              "entries connected to me. Doesn't affect anyone who already liked me.",
            ),
            value: _hideFromMutualConnections,
            onChanged: _toggleHideFromMutualConnections,
          ),
        ],
      ),
    );
  }
}
