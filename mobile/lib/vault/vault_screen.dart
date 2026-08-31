import 'package:flutter/material.dart';

import '../messaging/messaging_api.dart';
import 'vault_api.dart';
import 'vault_photo_picker_controller.dart';

/// Owner's private photo vault: photos stay hidden by default, and access
/// is granted per-match rather than shown on the profile or in chat.
class VaultScreen extends StatefulWidget {
  VaultScreen({
    super.key,
    required this.vaultApi,
    required this.messagingApi,
    VaultPhotoPickerController? picker,
  }) : picker = picker ?? DeviceVaultPhotoPickerController();

  final VaultApi vaultApi;
  final MessagingApi messagingApi;
  final VaultPhotoPickerController picker;

  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  List<VaultPhoto> _photos = [];
  bool _isLoading = true;
  String? _errorText;

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
      final photos = await widget.vaultApi.fetchMyPhotos();
      setState(() => _photos = photos);
    } on VaultApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _addPhoto() async {
    setState(() => _errorText = null);
    final path = await widget.picker.pickPhoto();
    if (path == null) {
      return;
    }
    try {
      await widget.vaultApi.addPhoto(path);
      await _load();
    } on VaultApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _deletePhoto(VaultPhoto photo) async {
    setState(() => _errorText = null);
    try {
      await widget.vaultApi.deletePhoto(photo.id);
      setState(() => _photos = _photos.where((p) => p.id != photo.id).toList());
    } on VaultApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _manageAccess(VaultPhoto photo) async {
    setState(() => _errorText = null);
    List<MatchSummary> matches;
    try {
      matches = await widget.messagingApi.fetchMyMatches();
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }

    if (!mounted) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => _AccessSheet(
        vaultApi: widget.vaultApi,
        photo: photo,
        matches: matches,
        onChanged: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Private Vault')),
      floatingActionButton: FloatingActionButton(
        onPressed: _addPhoto,
        child: const Icon(Icons.add_a_photo),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                Expanded(
                  child: _photos.isEmpty
                      ? const Center(child: Text('No vault photos yet. Add one to get started.'))
                      : GridView.builder(
                          padding: const EdgeInsets.all(12),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                            childAspectRatio: 0.85,
                          ),
                          itemCount: _photos.length,
                          itemBuilder: (context, index) {
                            final photo = _photos[index];
                            return _VaultPhotoTile(
                              photo: photo,
                              onDelete: () => _deletePhoto(photo),
                              onManageAccess: () => _manageAccess(photo),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}

class _VaultPhotoTile extends StatelessWidget {
  const _VaultPhotoTile({
    required this.photo,
    required this.onDelete,
    required this.onManageAccess,
  });

  final VaultPhoto photo;
  final VoidCallback onDelete;
  final VoidCallback onManageAccess;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Expanded(
            child: Image.network(
              photo.mediaUrl,
              fit: BoxFit.cover,
              width: double.infinity,
              errorBuilder: (context, error, stackTrace) => Container(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: const Icon(Icons.lock_outline, size: 32),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              photo.grantedMatchIds.isEmpty
                  ? 'Locked'
                  : 'Shared with ${photo.grantedMatchIds.length}',
              style: const TextStyle(fontSize: 12),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              IconButton(
                icon: const Icon(Icons.lock_open),
                tooltip: 'Manage access',
                onPressed: onManageAccess,
              ),
              IconButton(icon: const Icon(Icons.delete), tooltip: 'Delete', onPressed: onDelete),
            ],
          ),
        ],
      ),
    );
  }
}

class _AccessSheet extends StatefulWidget {
  const _AccessSheet({
    required this.vaultApi,
    required this.photo,
    required this.matches,
    required this.onChanged,
  });

  final VaultApi vaultApi;
  final VaultPhoto photo;
  final List<MatchSummary> matches;
  final VoidCallback onChanged;

  @override
  State<_AccessSheet> createState() => _AccessSheetState();
}

class _AccessSheetState extends State<_AccessSheet> {
  final Set<String> _grantedMatchIds = <String>{};

  @override
  void initState() {
    super.initState();
    _grantedMatchIds.addAll(widget.photo.grantedMatchIds);
  }

  Future<void> _toggle(String matchId, bool grant) async {
    try {
      if (grant) {
        await widget.vaultApi.grantAccess(widget.photo.id, matchId);
      } else {
        await widget.vaultApi.revokeAccess(widget.photo.id, matchId);
      }
      setState(() {
        if (grant) {
          _grantedMatchIds.add(matchId);
        } else {
          _grantedMatchIds.remove(matchId);
        }
      });
      widget.onChanged();
    } on VaultApiException {
      // Non-critical: leave the switch in its previous state on failure.
    }
  }

  /// Re-grants with a time-limited expiry (or null for a permanent key) -
  /// the backend upsert replaces whatever expiry the match's key had before.
  Future<void> _setExpiry(String matchId, int? expiresInHours) async {
    try {
      await widget.vaultApi.grantAccess(widget.photo.id, matchId, expiresInHours: expiresInHours);
      widget.onChanged();
    } on VaultApiException {
      // Non-critical: the key keeps its previous expiry on failure.
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Grant access', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ),
          if (widget.matches.isEmpty) const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text('No matches yet.'),
          ),
          for (final match in widget.matches)
            SwitchListTile(
              title: Text(match.otherUserName ?? 'Someone new'),
              value: _grantedMatchIds.contains(match.matchId),
              onChanged: (value) => _toggle(match.matchId, value),
              secondary: _grantedMatchIds.contains(match.matchId)
                  ? PopupMenuButton<int?>(
                      icon: const Icon(Icons.timer_outlined),
                      tooltip: 'Set key expiry',
                      onSelected: (expiresInHours) => _setExpiry(match.matchId, expiresInHours),
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: null, child: Text('Permanent')),
                        PopupMenuItem(value: 1, child: Text('Expires in 1 hour')),
                        PopupMenuItem(value: 24, child: Text('Expires in 24 hours')),
                        PopupMenuItem(value: 168, child: Text('Expires in 7 days')),
                      ],
                    )
                  : null,
            ),
        ],
      ),
    );
  }
}
