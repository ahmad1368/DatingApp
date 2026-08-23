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
                              leading: photo.isLead
                                  ? const Icon(Icons.star, color: Colors.amber)
                                  : const Icon(Icons.image_outlined),
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
