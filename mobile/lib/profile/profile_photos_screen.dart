import 'package:flutter/material.dart';

import 'profile_photo_picker_controller.dart';
import 'profile_photos_api.dart';

/// Manages the user's photo gallery. The lead (first) photo is what other
/// users see in the discovery deck; it automatically rotates to whichever
/// photo is converting best once enough swipes have been recorded against
/// it, so conversion stats are shown per photo instead of a manual reorder.
class ProfilePhotosScreen extends StatefulWidget {
  ProfilePhotosScreen({super.key, required this.profilePhotosApi, ProfilePhotoPickerController? picker})
      : picker = picker ?? DeviceProfilePhotoPickerController();

  final ProfilePhotosApi profilePhotosApi;
  final ProfilePhotoPickerController picker;

  @override
  State<ProfilePhotosScreen> createState() => _ProfilePhotosScreenState();
}

class _ProfilePhotosScreenState extends State<ProfilePhotosScreen> {
  List<ProfilePhoto> _photos = [];
  bool _blurUntilMatch = false;
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
      final results = await Future.wait([
        widget.profilePhotosApi.fetchMyPhotos(),
        widget.profilePhotosApi.fetchBlurUntilMatch(),
      ]);
      setState(() {
        _photos = results[0] as List<ProfilePhoto>;
        _blurUntilMatch = results[1] as bool;
      });
    } on ProfilePhotosApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _toggleBlurUntilMatch(bool enabled) async {
    setState(() => _errorText = null);
    try {
      final updated = await widget.profilePhotosApi.setBlurUntilMatch(enabled);
      setState(() => _blurUntilMatch = updated);
    } on ProfilePhotosApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _addPhoto() async {
    setState(() => _errorText = null);
    final path = await widget.picker.pickPhoto();
    if (path == null) {
      return;
    }
    try {
      await widget.profilePhotosApi.addPhoto(path);
      await _load();
    } on ProfilePhotosApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _deletePhoto(ProfilePhoto photo) async {
    setState(() => _errorText = null);
    try {
      await widget.profilePhotosApi.deletePhoto(photo.id);
      setState(() => _photos = _photos.where((p) => p.id != photo.id).toList());
    } on ProfilePhotosApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _reorderByQuality() async {
    setState(() => _errorText = null);
    try {
      final photos = await widget.profilePhotosApi.reorderByQuality();
      setState(() => _photos = photos);
    } on ProfilePhotosApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// Fetches the AI curation pass and, if it found anything worth flagging,
  /// shows a dialog so the user can delete a suggested removal in one tap
  /// (or leave it - these are suggestions, nothing is deleted automatically).
  Future<void> _openCurationSuggestions() async {
    setState(() => _errorText = null);
    PhotoGalleryCuration curation;
    try {
      curation = await widget.profilePhotosApi.fetchCurationSuggestions();
    } on ProfilePhotosApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }
    if (!mounted) {
      return;
    }
    if (curation.suggestedRemovals.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your gallery looks great - nothing to clean up.')),
      );
      return;
    }

    final photoToDelete = await showDialog<ProfilePhoto>(
      context: context,
      builder: (context) => _CurationSuggestionsDialog(
        suggestions: curation.suggestedRemovals,
        photos: _photos,
      ),
    );
    if (photoToDelete != null) {
      await _deletePhoto(photoToDelete);
    }
  }

  String _statsLabel(ProfilePhoto photo) {
    final swipes = photo.conversionRate == null
        ? 'No swipes yet'
        : '${(photo.conversionRate! * 100).toStringAsFixed(0)}% right-swipes (${photo.impressions} shown)';
    return '$swipes · Quality score: ${photo.qualityScore}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile Photos'),
        actions: [
          IconButton(
            icon: const Icon(Icons.auto_fix_high),
            tooltip: 'AI gallery curator',
            onPressed: _photos.isEmpty ? null : _openCurationSuggestions,
          ),
          IconButton(
            icon: const Icon(Icons.auto_awesome),
            tooltip: 'Auto-rank by AI quality score',
            onPressed: _photos.isEmpty ? null : _reorderByQuality,
          ),
        ],
      ),
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
                SwitchListTile(
                  title: const Text('Blur photos until matched'),
                  subtitle: const Text('Your photos stay blurred to everyone until you match.'),
                  value: _blurUntilMatch,
                  onChanged: _toggleBlurUntilMatch,
                ),
                Expanded(
                  child: _photos.isEmpty
                      ? const Center(child: Text('No profile photos yet. Add one to get started.'))
                      : ListView.builder(
                          itemCount: _photos.length,
                          itemBuilder: (context, index) {
                            final photo = _photos[index];
                            return ListTile(
                              leading: SizedBox(
                                width: 56,
                                height: 56,
                                child: Stack(
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: Image.network(
                                        photo.mediaUrl,
                                        width: 56,
                                        height: 56,
                                        fit: BoxFit.cover,
                                        // AI-detected smart-crop focal point (see
                                        // ProfilePhoto.cropFocalX/Y) keeps the
                                        // face centered no matter this box's
                                        // aspect ratio, instead of a plain
                                        // geometric center-crop.
                                        alignment: Alignment(
                                          photo.cropFocalX * 2 - 1,
                                          photo.cropFocalY * 2 - 1,
                                        ),
                                        errorBuilder: (context, error, stackTrace) =>
                                            const Icon(Icons.image_outlined),
                                      ),
                                    ),
                                    if (photo.isLead)
                                      const Positioned(
                                        right: 0,
                                        bottom: 0,
                                        child: Icon(Icons.star, color: Colors.amber, size: 18),
                                      ),
                                  ],
                                ),
                              ),
                              title: Text(photo.isLead ? 'Lead photo' : 'Photo ${index + 1}'),
                              subtitle: Text(_statsLabel(photo)),
                              trailing: IconButton(
                                icon: const Icon(Icons.delete),
                                tooltip: 'Delete',
                                onPressed: () => _deletePhoto(photo),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}

class _CurationSuggestionsDialog extends StatelessWidget {
  const _CurationSuggestionsDialog({required this.suggestions, required this.photos});

  final List<PhotoCurationSuggestion> suggestions;
  final List<ProfilePhoto> photos;

  static String _reasonLabel(PhotoCurationReason reason) {
    switch (reason) {
      case PhotoCurationReason.blurry:
        return 'Blurry';
      case PhotoCurationReason.duplicate:
        return 'Duplicate';
      case PhotoCurationReason.lowEngagement:
        return 'Low engagement';
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Suggested cleanup'),
      content: SizedBox(
        width: double.maxFinite,
        child: ListView.builder(
          shrinkWrap: true,
          itemCount: suggestions.length,
          itemBuilder: (context, index) {
            final suggestion = suggestions[index];
            final photoIndex = photos.indexWhere((photo) => photo.id == suggestion.photoId);
            final photo = photoIndex == -1 ? null : photos[photoIndex];
            return ListTile(
              title: Text(photo != null ? 'Photo ${photoIndex + 1}' : suggestion.mediaUrl),
              subtitle: Text(suggestion.reasons.map(_reasonLabel).join(', ')),
              trailing: photo == null
                  ? null
                  : TextButton(
                      onPressed: () => Navigator.of(context).pop(photo),
                      child: const Text('Remove'),
                    ),
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
