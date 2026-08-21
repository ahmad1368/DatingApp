import 'package:flutter/material.dart';

import 'profile_visits_api.dart';

/// Premium "profile visitors": everyone who has viewed the current user's
/// profile, most recent first (excluding anyone who browsed anonymously).
class ProfileVisitorsScreen extends StatefulWidget {
  const ProfileVisitorsScreen({super.key, required this.profileVisitsApi});

  final ProfileVisitsApi profileVisitsApi;

  @override
  State<ProfileVisitorsScreen> createState() => _ProfileVisitorsScreenState();
}

class _ProfileVisitorsScreenState extends State<ProfileVisitorsScreen> {
  List<ProfileVisitor> _visitors = [];
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
      final visitors = await widget.profileVisitsApi.fetchVisitors();
      setState(() => _visitors = visitors);
    } on ProfileVisitsApiException catch (e) {
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
      appBar: AppBar(title: const Text('Profile Visitors')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _visitors.isEmpty
                  ? const Center(child: Text('No visitors yet.'))
                  : ListView.builder(
                      itemCount: _visitors.length,
                      itemBuilder: (context, index) {
                        final visitor = _visitors[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundImage: visitor.visitorPhotoUrl != null
                                ? NetworkImage(visitor.visitorPhotoUrl!)
                                : null,
                            child: visitor.visitorPhotoUrl == null
                                ? const Icon(Icons.person)
                                : null,
                          ),
                          title: Text(visitor.visitorName ?? 'Someone new'),
                          subtitle: Text('Visited ${visitor.visitedAt.toLocal()}'),
                        );
                      },
                    ),
    );
  }
}
