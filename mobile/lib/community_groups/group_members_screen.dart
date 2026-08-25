import 'package:flutter/material.dart';

import 'community_groups_api.dart';

/// Browses other members of one community group, so a user can see profiles
/// active within that specific niche instead of only their main swipe deck.
class GroupMembersScreen extends StatefulWidget {
  const GroupMembersScreen({
    super.key,
    required this.communityGroupsApi,
    required this.groupId,
    required this.groupName,
  });

  final CommunityGroupsApi communityGroupsApi;
  final String groupId;
  final String groupName;

  @override
  State<GroupMembersScreen> createState() => _GroupMembersScreenState();
}

class _GroupMembersScreenState extends State<GroupMembersScreen> {
  List<GroupMember> _members = [];
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
      final members = await widget.communityGroupsApi.fetchGroupMembers(widget.groupId);
      setState(() => _members = members);
    } on CommunityGroupsApiException catch (e) {
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
      appBar: AppBar(title: Text(widget.groupName)),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(child: Text(_errorText!, style: const TextStyle(color: Colors.red)))
              : _members.isEmpty
                  ? const Center(child: Text('No one else here yet.'))
                  : ListView.builder(
                      itemCount: _members.length,
                      itemBuilder: (context, index) {
                        final member = _members[index];
                        return ListTile(
                          title: Text(member.name ?? 'Someone in this group'),
                          subtitle: member.age != null ? Text('${member.age}') : null,
                        );
                      },
                    ),
    );
  }
}
