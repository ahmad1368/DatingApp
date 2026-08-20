import 'package:flutter/material.dart';

import 'blocking_api.dart';

/// "Privacy shield": lets a user submit phone numbers or emails from their
/// contacts to block acquaintances, family, or ex-partners from seeing or
/// appearing in their discovery feed - mutual, in both directions.
class BlockedContactsScreen extends StatefulWidget {
  const BlockedContactsScreen({super.key, required this.blockingApi});

  final BlockingApi blockingApi;

  @override
  State<BlockedContactsScreen> createState() => _BlockedContactsScreenState();
}

class _BlockedContactsScreenState extends State<BlockedContactsScreen> {
  final _contactController = TextEditingController();
  List<BlockedContact> _blockedContacts = [];
  bool _isLoading = true;
  bool _isSyncing = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _contactController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final blockedContacts = await widget.blockingApi.fetchBlockedContacts();
      setState(() => _blockedContacts = blockedContacts);
    } on BlockingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _syncContacts() async {
    final contacts = _contactController.text
        .split(RegExp(r'[,\n]'))
        .map((c) => c.trim())
        .where((c) => c.isNotEmpty)
        .toList();
    if (contacts.isEmpty) {
      return;
    }

    setState(() {
      _isSyncing = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final result = await widget.blockingApi.syncContacts(contacts);
      setState(() {
        _statusText = result.matchedUsers > 0
            ? 'Blocked ${result.matchedUsers} of ${result.totalSubmitted} contacts who are on the app.'
            : 'Saved ${result.totalSubmitted} contacts - none are on the app yet, but they will be blocked automatically if they join.';
      });
      _contactController.clear();
      await _load();
    } on BlockingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSyncing = false);
      }
    }
  }

  Future<void> _unblock(BlockedContact contact) async {
    setState(() => _errorText = null);
    try {
      await widget.blockingApi.unblockContact(contact.id);
      setState(() => _blockedContacts = _blockedContacts.where((c) => c.id != contact.id).toList());
    } on BlockingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy Shield')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Block acquaintances, family, or ex-partners from seeing or appearing in '
                  'your feed. Add their phone number or email below.',
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _contactController,
                  minLines: 1,
                  maxLines: 4,
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
                      : const Text('Block these contacts'),
                ),
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 8),
                  Text(_statusText!),
                ],
                const SizedBox(height: 24),
                const Text('Blocked', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (_blockedContacts.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text('No blocked contacts yet.'),
                  ),
                for (final contact in _blockedContacts)
                  ListTile(
                    title: Text(contact.blockedUserName ?? contact.contactValue),
                    subtitle: Text(
                      contact.isAppUser ? 'On the app - hidden from each other' : 'Not on the app yet',
                    ),
                    trailing: TextButton(
                      onPressed: () => _unblock(contact),
                      child: const Text('Unblock'),
                    ),
                  ),
              ],
            ),
    );
  }
}
