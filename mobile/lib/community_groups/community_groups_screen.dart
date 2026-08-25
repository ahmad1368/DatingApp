import 'package:flutter/material.dart';

import 'community_groups_api.dart';
import 'group_members_screen.dart';

/// Lets the user join or leave topic-based community hubs (e.g. "Outdoor
/// Adventurers", "Book Lovers") to discover profiles within specific
/// passion niches.
class CommunityGroupsScreen extends StatefulWidget {
  const CommunityGroupsScreen({super.key, required this.communityGroupsApi});

  final CommunityGroupsApi communityGroupsApi;

  @override
  State<CommunityGroupsScreen> createState() => _CommunityGroupsScreenState();
}

class _CommunityGroupsScreenState extends State<CommunityGroupsScreen> {
  List<CommunityGroup> _groups = [];
  Set<String> _myGroupIds = {};
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
        widget.communityGroupsApi.fetchGroups(),
        widget.communityGroupsApi.fetchMyGroups(),
      ]);
      setState(() {
        _groups = results[0] as List<CommunityGroup>;
        _myGroupIds = (results[1] as List<String>).toSet();
      });
    } on CommunityGroupsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _toggle(CommunityGroup group, bool join) async {
    setState(() => _errorText = null);
    try {
      final updated = join
          ? await widget.communityGroupsApi.joinGroup(group.id)
          : await widget.communityGroupsApi.leaveGroup(group.id);
      setState(() => _myGroupIds = updated.toSet());
    } on CommunityGroupsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Community Groups')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                for (final group in _groups)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(group.name),
                      subtitle: Text(group.description),
                      onTap: _myGroupIds.contains(group.id)
                          ? () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (context) => GroupMembersScreen(
                                    communityGroupsApi: widget.communityGroupsApi,
                                    groupId: group.id,
                                    groupName: group.name,
                                  ),
                                ),
                              )
                          : null,
                      trailing: FilterChip(
                        label: Text(_myGroupIds.contains(group.id) ? 'Joined' : 'Join'),
                        selected: _myGroupIds.contains(group.id),
                        onSelected: (selected) => _toggle(group, selected),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
