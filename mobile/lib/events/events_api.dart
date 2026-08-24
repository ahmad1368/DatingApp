import 'dart:convert';

import 'package:http/http.dart' as http;

class EventsApiException implements Exception {
  EventsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class LocalEvent {
  LocalEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.location,
    required this.category,
    required this.startsAt,
    required this.distanceKm,
    required this.rsvpCount,
    required this.isRsvped,
    required this.checkedInCount,
    required this.isCheckedIn,
  });

  final String id;
  final String title;
  final String? description;
  final String location;
  final String category;
  final DateTime startsAt;
  final double? distanceKm;
  final int rsvpCount;
  final bool isRsvped;
  final int checkedInCount;
  final bool isCheckedIn;
}

/// Talks to the backend's app-sponsored local events endpoints: browsing
/// nearby events and RSVPing. Event creation is committee-gated server-side
/// and has no mobile UI here.
class EventsApi {
  EventsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<LocalEvent>> fetchNearbyEvents() async {
    final response = await _client.get(Uri.parse('$_baseUrl/events'), headers: _headers);

    if (response.statusCode != 200) {
      throw EventsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toLocalEvent).toList();
  }

  Future<void> rsvp(String eventId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/events/$eventId/rsvp'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw EventsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<void> cancelRsvp(String eventId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/events/$eventId/cancel-rsvp'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw EventsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// Confirms physical attendance at an event already RSVPed to. Only
  /// allowed once the event has started.
  Future<void> checkIn(String eventId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/events/$eventId/check-in'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw EventsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  LocalEvent _toLocalEvent(Map<String, dynamic> json) {
    return LocalEvent(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      location: json['location'] as String,
      category: json['category'] as String,
      startsAt: DateTime.parse(json['startsAt'] as String),
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      rsvpCount: json['rsvpCount'] as int,
      isRsvped: json['isRsvped'] as bool,
      checkedInCount: json['checkedInCount'] as int,
      isCheckedIn: json['isCheckedIn'] as bool,
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
