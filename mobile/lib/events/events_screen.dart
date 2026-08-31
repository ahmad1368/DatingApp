import 'package:flutter/material.dart';

import 'events_api.dart';

/// Dedicated tab listing app-sponsored offline singles events, mixers, and
/// local activity meetups nearby, nearest-first when location is known.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, required this.eventsApi});

  final EventsApi eventsApi;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<LocalEvent> _events = [];
  int? _coinBalance;
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
      final events = await widget.eventsApi.fetchNearbyEvents();
      setState(() => _events = events);
    } on EventsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _toggleRsvp(LocalEvent event) async {
    setState(() => _errorText = null);
    try {
      final newBalance = event.isRsvped
          ? await widget.eventsApi.cancelRsvp(event.id)
          : await widget.eventsApi.rsvp(event.id);
      setState(() => _coinBalance = newBalance);
      await _load();
    } on EventsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _checkIn(LocalEvent event) async {
    setState(() => _errorText = null);
    try {
      await widget.eventsApi.checkIn(event.id);
      await _load();
    } on EventsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  String _subtitle(LocalEvent event) {
    final date = event.startsAt;
    final dateLabel = '${date.year}-${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
    final distance = event.distanceKm != null ? ' · ${event.distanceKm!.toStringAsFixed(1)} km away' : '';
    final price = event.priceCoins > 0 ? ' · ${event.priceCoins} coins' : ' · Free';
    return '${event.location} · $dateLabel$distance$price';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Local Events'),
        actions: [
          if (_coinBalance != null)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(child: Text('$_coinBalance coins')),
            ),
        ],
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
                Expanded(
                  child: _events.isEmpty
                      ? const Center(child: Text('No upcoming events nearby yet.'))
                      : ListView.builder(
                          itemCount: _events.length,
                          itemBuilder: (context, index) {
                            final event = _events[index];
                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(event.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                                    const SizedBox(height: 4),
                                    Text(_subtitle(event)),
                                    const SizedBox(height: 8),
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.end,
                                      children: [
                                        if (event.isRsvped)
                                          TextButton(
                                            onPressed: event.isCheckedIn ? null : () => _checkIn(event),
                                            child: Text(event.isCheckedIn ? 'Checked in' : 'Check in'),
                                          ),
                                        ElevatedButton(
                                          onPressed: () => _toggleRsvp(event),
                                          child: Text(
                                            event.isRsvped
                                                ? 'Cancel RSVP'
                                                : event.priceCoins > 0
                                                    ? 'RSVP (${event.priceCoins} coins)'
                                                    : 'RSVP',
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
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
