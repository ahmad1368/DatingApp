import 'package:flutter/material.dart';

import 'spotify_api.dart';

/// Shows a "music personality" match with another user: a similarity
/// percentage over each side's synced Spotify top artists, plus the
/// artists they have in common.
class MusicCompatibilityScreen extends StatefulWidget {
  const MusicCompatibilityScreen({super.key, required this.spotifyApi, required this.otherUserId});

  final SpotifyApi spotifyApi;
  final String otherUserId;

  @override
  State<MusicCompatibilityScreen> createState() => _MusicCompatibilityScreenState();
}

class _MusicCompatibilityScreenState extends State<MusicCompatibilityScreen> {
  MusicCompatibility? _compatibility;
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
      final compatibility = await widget.spotifyApi.fetchMusicCompatibility(widget.otherUserId);
      setState(() => _compatibility = compatibility);
    } on SpotifyApiException catch (e) {
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
      appBar: AppBar(title: const Text('Music Match')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _buildBody(_compatibility!),
    );
  }

  Widget _buildBody(MusicCompatibility compatibility) {
    if (compatibility.percentage == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Connect Spotify to see your music match with this person.'),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Music match: ${compatibility.percentage}%',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        const Text('Artists you both like', style: TextStyle(fontWeight: FontWeight.bold)),
        if (compatibility.sharedArtists.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('No shared top artists yet.'),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final artist in compatibility.sharedArtists) Chip(label: Text(artist)),
            ],
          ),
      ],
    );
  }
}
