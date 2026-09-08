import 'package:flutter/material.dart';

import 'notifications_api.dart';

/// Shows the in-app notification feed (new match, new message, ...) that
/// the client polls - see NotificationsApi for why there's no real-time
/// push transport wired in yet.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.notificationsApi});

  final NotificationsApi notificationsApi;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

/// Maps the backend's NOTIFICATION_TYPES (notifications.constants.ts) to a
/// distinct icon so the feed reads at a glance instead of relying on the
/// title text alone.
IconData _iconForType(String type) {
  switch (type) {
    case 'NEW_MATCH':
      return Icons.favorite;
    case 'NEW_MESSAGE':
      return Icons.chat_bubble;
    case 'NEW_LIKE':
      return Icons.thumb_up;
    case 'PROFILE_ACTIVITY':
      return Icons.visibility;
    case 'TOP_PICK':
      return Icons.star;
    case 'REPORT_RESOLVED':
      return Icons.shield;
    case 'MATCH_EXPIRING_SOON':
      return Icons.timer;
    default:
      return Icons.notifications;
  }
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
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
      final feed = await widget.notificationsApi.fetchNotifications();
      setState(() {
        _notifications = feed.notifications;
        _unreadCount = feed.unreadCount;
      });
    } on NotificationsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _markAllRead() async {
    setState(() => _errorText = null);
    try {
      await widget.notificationsApi.markAllRead();
      await _load();
    } on NotificationsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _openNotification(AppNotification notification) async {
    if (notification.read) {
      return;
    }
    try {
      final updated = await widget.notificationsApi.markRead(notification.id);
      setState(() {
        _notifications = _notifications.map((n) => n.id == updated.id ? updated : n).toList();
        _unreadCount = _unreadCount > 0 ? _unreadCount - 1 : 0;
      });
    } on NotificationsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_unreadCount > 0 ? 'Notifications ($_unreadCount)' : 'Notifications'),
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all),
            tooltip: 'Mark all as read',
            onPressed: _unreadCount == 0 ? null : _markAllRead,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: Column(
                children: [
                  if (_errorText != null)
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                    ),
                  Expanded(
                    child: _notifications.isEmpty
                        ? const Center(child: Text('No notifications yet.'))
                        : ListView.builder(
                            itemCount: _notifications.length,
                            itemBuilder: (context, index) {
                              final notification = _notifications[index];
                              final color = notification.read
                                  ? Colors.grey
                                  : Theme.of(context).colorScheme.primary;
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: color.withValues(alpha: 0.15),
                                  child: Icon(_iconForType(notification.type), color: color),
                                ),
                                title: Text(
                                  notification.title,
                                  style: TextStyle(
                                    fontWeight: notification.read ? FontWeight.normal : FontWeight.bold,
                                  ),
                                ),
                                subtitle: Text(notification.body),
                                onTap: () => _openNotification(notification),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
