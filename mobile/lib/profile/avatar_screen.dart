import 'package:flutter/material.dart';

import 'avatar_api.dart';

/// Lets a user pick a curated 3D avatar style for their profile header, or
/// link a third-party avatar image (e.g. a Bitmoji URL) instead - the two
/// are mutually exclusive, so picking one clears the other.
class AvatarScreen extends StatefulWidget {
  const AvatarScreen({super.key, required this.avatarApi});

  final AvatarApi avatarApi;

  @override
  State<AvatarScreen> createState() => _AvatarScreenState();
}

class _AvatarScreenState extends State<AvatarScreen> {
  final _linkController = TextEditingController();

  List<AvatarStyle> _catalog = [];
  Avatar? _avatar;
  bool _isLoading = true;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _linkController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final results = await Future.wait([
        widget.avatarApi.fetchStyleCatalog(),
        widget.avatarApi.fetchMyAvatar(),
      ]);
      setState(() {
        _catalog = results[0] as List<AvatarStyle>;
        _avatar = results[1] as Avatar;
      });
    } on AvatarApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _selectStyle(AvatarStyle style) async {
    setState(() => _errorText = null);
    try {
      final avatar = await widget.avatarApi.selectAvatarStyle(style.id);
      setState(() => _avatar = avatar);
    } on AvatarApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _linkThirdPartyAvatar() async {
    final url = _linkController.text.trim();
    if (url.isEmpty) {
      return;
    }
    setState(() => _errorText = null);
    try {
      final avatar = await widget.avatarApi.linkThirdPartyAvatar(url);
      setState(() {
        _avatar = avatar;
        _linkController.clear();
      });
    } on AvatarApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _clearAvatar() async {
    setState(() => _errorText = null);
    try {
      final avatar = await widget.avatarApi.clearAvatar();
      setState(() => _avatar = avatar);
    } on AvatarApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _toggleVisibility(bool show) async {
    setState(() => _errorText = null);
    try {
      final avatar = await widget.avatarApi.setShowAvatarOnProfile(show);
      setState(() => _avatar = avatar);
    } on AvatarApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final avatar = _avatar;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile Avatar')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null) ...[
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                ],
                if (avatar != null) ...[
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Show avatar on my public profile'),
                    value: avatar.showAvatarOnProfile,
                    onChanged: _toggleVisibility,
                  ),
                  if (avatar.hasAvatar)
                    OutlinedButton(onPressed: _clearAvatar, child: const Text('Remove avatar')),
                  const Divider(height: 32),
                ],
                const Text('Pick a curated style', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  children: [
                    for (final style in _catalog)
                      GestureDetector(
                        onTap: () => _selectStyle(style),
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 32,
                              backgroundColor: avatar?.avatarStyleId == style.id
                                  ? Colors.indigo
                                  : Colors.grey.shade300,
                              child: CircleAvatar(
                                radius: 29,
                                backgroundImage: NetworkImage(style.previewUrl),
                                onBackgroundImageError: (_, _) {},
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              style.label,
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                const Divider(height: 32),
                const Text('Or link a third-party avatar', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                TextField(
                  controller: _linkController,
                  decoration: const InputDecoration(hintText: 'e.g. your Bitmoji image URL'),
                ),
                const SizedBox(height: 8),
                ElevatedButton(onPressed: _linkThirdPartyAvatar, child: const Text('Link avatar')),
              ],
            ),
    );
  }
}
