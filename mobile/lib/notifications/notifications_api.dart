import 'dart:convert';

import 'package:http/http.dart' as http;

class NotificationsApiException implements Exception {
  NotificationsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.data,
    required this.read,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final Map<String, dynamic>? data;
  final bool read;
  final DateTime createdAt;
}

class NotificationFeed {
  NotificationFeed({required this.notifications, required this.unreadCount});

  final List<AppNotification> notifications;
  final int unreadCount;
}

/// Talks to the backend's in-app notification feed (new match, new message,
/// ...) and the device-token registry that stands in for a real FCM/APNs
/// push provider - see the backend's NotificationsService for why there's
/// no actual push transport here yet.
class NotificationsApi {
  NotificationsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<NotificationFeed> fetchNotifications() async {
    final response = await _client.get(Uri.parse('$_baseUrl/notifications'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw NotificationsApiException(_errorMessage(body, response.statusCode));
    }

    final list = (body['notifications'] as List).cast<Map<String, dynamic>>().map(_toNotification).toList();
    return NotificationFeed(notifications: list, unreadCount: body['unreadCount'] as int);
  }

  Future<AppNotification> markRead(String notificationId) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/notifications/$notificationId/read'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw NotificationsApiException(_errorMessage(body, response.statusCode));
    }

    return _toNotification(body);
  }

  Future<int> markAllRead() async {
    final response = await _client.put(Uri.parse('$_baseUrl/notifications/read-all'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw NotificationsApiException(_errorMessage(body, response.statusCode));
    }

    return body['updated'] as int;
  }

  /// Registers this device's push token (as obtained from FCM/APNs on the
  /// client) so a future real push provider can target it.
  Future<void> registerDeviceToken({required String token, required String platform}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/notifications/device-tokens'),
      headers: _headers,
      body: jsonEncode({'token': token, 'platform': platform}),
    );

    if (response.statusCode != 201) {
      throw NotificationsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<void> removeDeviceToken(String token) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/notifications/device-tokens/$token'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw NotificationsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  AppNotification _toNotification(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      data: json['data'] as Map<String, dynamic>?,
      read: json['read'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _errorMessage(Map<String, dynamic> body, int statusCode) {
    final message = body['message'];
    if (message is String) {
      return message;
    }
    if (message is List && message.isNotEmpty) {
      return message.first.toString();
    }
    return 'Request failed with status $statusCode';
  }
}
