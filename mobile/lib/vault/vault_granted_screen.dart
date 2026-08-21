import 'package:flutter/material.dart';

import 'vault_api.dart';

/// Read-only view of the vault photos a match partner has granted access
/// to, from the viewer's side.
class VaultGrantedScreen extends StatefulWidget {
  const VaultGrantedScreen({super.key, required this.vaultApi, required this.matchId});

  final VaultApi vaultApi;
  final String matchId;

  @override
  State<VaultGrantedScreen> createState() => _VaultGrantedScreenState();
}

class _VaultGrantedScreenState extends State<VaultGrantedScreen> {
  List<GrantedVaultPhoto> _photos = [];
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
      final photos = await widget.vaultApi.fetchGrantedPhotos(widget.matchId);
      setState(() => _photos = photos);
    } on VaultApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Shared Private Photos')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _photos.isEmpty
                  ? const Center(child: Text('Nothing shared with you yet.'))
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
                        return ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            photo.mediaUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) => Container(
                              color: Theme.of(context).colorScheme.surfaceContainerHighest,
                              child: const Icon(Icons.broken_image_outlined),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
