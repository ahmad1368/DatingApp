import 'package:flutter/material.dart';

import 'video_picker_controller.dart';
import 'video_snippet_api.dart';

class VideoSnippetScreen extends StatefulWidget {
  VideoSnippetScreen({super.key, required this.videoSnippetApi, VideoPickerController? picker})
      : picker = picker ?? DeviceVideoPickerController();

  final VideoSnippetApi videoSnippetApi;
  final VideoPickerController picker;

  @override
  State<VideoSnippetScreen> createState() => _VideoSnippetScreenState();
}

class _VideoSnippetScreenState extends State<VideoSnippetScreen> {
  String? _currentUrl;
  String? _pickedPath;
  bool _isLoading = true;
  bool _isBusy = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await widget.videoSnippetApi.fetchVideoSnippet();
      setState(() => _currentUrl = result.url);
    } on VideoSnippetApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _pick() async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });
    final path = await widget.picker.pickVideo();
    if (path == null) {
      return;
    }
    setState(() => _pickedPath = path);
  }

  Future<void> _save() async {
    final path = _pickedPath;
    if (path == null) {
      return;
    }
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final result = await widget.videoSnippetApi.setVideoSnippet(url: path);
      setState(() {
        _currentUrl = result.url;
        _pickedPath = null;
        _statusText = 'Video snippet saved.';
      });
    } on VideoSnippetApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _remove() async {
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.videoSnippetApi.clearVideoSnippet();
      setState(() {
        _currentUrl = null;
        _statusText = 'Video snippet removed.';
      });
    } on VideoSnippetApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Video snippet')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Pick a short (up to $maxVideoSnippetSeconds second) looping video clip to '
                    'show instead of a static photo.',
                  ),
                  const SizedBox(height: 16),
                  if (_currentUrl != null) ...[
                    Text('Current: $_currentUrl'),
                    const SizedBox(height: 8),
                  ],
                  if (_pickedPath != null) ...[
                    Text('Selected: $_pickedPath'),
                    const SizedBox(height: 8),
                  ],
                  ElevatedButton(
                    onPressed: _isBusy ? null : _pick,
                    child: const Text('Choose video'),
                  ),
                  if (_pickedPath != null) ...[
                    const SizedBox(height: 8),
                    ElevatedButton(
                      onPressed: _isBusy ? null : _save,
                      child: _isBusy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Save'),
                    ),
                  ],
                  if (_currentUrl != null) ...[
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: _isBusy ? null : _remove,
                      child: const Text('Remove'),
                    ),
                  ],
                  if (_errorText != null) ...[
                    const SizedBox(height: 16),
                    Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ],
                  if (_statusText != null) ...[
                    const SizedBox(height: 16),
                    Text(_statusText!),
                  ],
                ],
              ),
            ),
    );
  }
}
