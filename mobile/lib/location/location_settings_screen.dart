import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import 'location_api.dart';

class Coordinates {
  const Coordinates({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

Future<Coordinates> _defaultCurrentPositionProvider() async {
  final serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    throw LocationApiException('Location services are disabled. Please enable them in settings.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
    throw LocationApiException('Location permission is required to find matches nearby.');
  }

  final position = await Geolocator.getCurrentPosition();
  return Coordinates(latitude: position.latitude, longitude: position.longitude);
}

class LocationSettingsScreen extends StatefulWidget {
  const LocationSettingsScreen({
    super.key,
    required this.locationApi,
    this.currentPositionProvider = _defaultCurrentPositionProvider,
  });

  final LocationApi locationApi;
  final Future<Coordinates> Function() currentPositionProvider;

  @override
  State<LocationSettingsScreen> createState() => _LocationSettingsScreenState();
}

class _LocationSettingsScreenState extends State<LocationSettingsScreen> {
  static const double _kmPerMile = 1.60934;

  double _radiusKm = 50;
  String _distanceUnit = 'KM';
  bool _autoExpandRadiusEnabled = true;
  List<NearbyUser> _nearbyUsers = const [];
  bool _isBusy = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    unawaited(_loadRadiusSettings());
  }

  /// Best-effort load of the saved radius/unit/auto-expand preference.
  /// Failure here shouldn't surface to the user; it just means this screen
  /// falls back to its defaults until the user changes something.
  Future<void> _loadRadiusSettings() async {
    try {
      final settings = await widget.locationApi.fetchRadiusSettings();
      if (mounted) {
        setState(() {
          _radiusKm = settings.searchRadiusKm.toDouble();
          _distanceUnit = settings.distanceUnit;
          _autoExpandRadiusEnabled = settings.autoExpandRadiusEnabled;
        });
      }
    } catch (_) {
      // Ignored - see doc comment above.
    }
  }

  Future<void> _toggleAutoExpandRadius(bool enabled) async {
    setState(() {
      _autoExpandRadiusEnabled = enabled;
      _errorText = null;
    });
    try {
      final settings = await widget.locationApi.setAutoExpandRadius(enabled);
      setState(() => _autoExpandRadiusEnabled = settings.autoExpandRadiusEnabled);
    } on LocationApiException catch (e) {
      setState(() {
        _autoExpandRadiusEnabled = !enabled;
        _errorText = e.message;
      });
    }
  }

  Future<void> _setDistanceUnit(String unit) async {
    if (unit == _distanceUnit) {
      return;
    }
    setState(() => _distanceUnit = unit);
    try {
      await widget.locationApi.setDistanceUnit(unit);
    } on LocationApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _shareLocation() async {
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final coordinates = await widget.currentPositionProvider();
      await widget.locationApi.updateLocation(
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      );
      setState(() => _statusText = 'Location updated.');
      await _loadNearbyUsers();
    } on LocationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _saveRadius() async {
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.locationApi.updateSearchRadius(_radiusKm.round());
      setState(() => _statusText = 'Search radius saved.');
      await _loadNearbyUsers();
    } on LocationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _loadNearbyUsers() async {
    try {
      final users = await widget.locationApi.fetchNearbyUsers();
      if (mounted) {
        setState(() => _nearbyUsers = users);
      }
    } on LocationApiException catch (e) {
      if (mounted) {
        setState(() => _errorText = e.message);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isMiles = _distanceUnit == 'MI';
    final sliderMin = 1.0;
    final sliderMax = isMiles ? 500 / _kmPerMile : 500.0;
    final sliderValue = (isMiles ? _radiusKm / _kmPerMile : _radiusKm).clamp(sliderMin, sliderMax);
    final displayValue = sliderValue.round();
    final unitLabel = isMiles ? 'mi' : 'km';

    return Scaffold(
      appBar: AppBar(title: const Text('Location & discovery radius')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Share your location to find matches nearby.'),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _isBusy ? null : _shareLocation,
                  child: _isBusy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Share my location'),
                ),
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 8),
                  Text(_statusText!),
                ],
                const SizedBox(height: 24),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('km'),
                      selected: !isMiles,
                      onSelected: (_) => _setDistanceUnit('KM'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('mi'),
                      selected: isMiles,
                      onSelected: (_) => _setDistanceUnit('MI'),
                    ),
                  ],
                ),
                Text('Search radius: $displayValue $unitLabel'),
                Slider(
                  value: sliderValue,
                  min: sliderMin,
                  max: sliderMax,
                  divisions: (sliderMax - sliderMin).round(),
                  label: '$displayValue $unitLabel',
                  onChanged: (value) => setState(() {
                    _radiusKm = isMiles ? value * _kmPerMile : value;
                  }),
                ),
                ElevatedButton(
                  onPressed: _isBusy ? null : _saveRadius,
                  child: const Text('Save radius'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Automatically expand radius when few nearby matches'),
                  subtitle: const Text(
                    'Widens your search for a single deck fetch instead of showing a near-empty deck.',
                  ),
                  value: _autoExpandRadiusEnabled,
                  onChanged: _toggleAutoExpandRadius,
                ),
              ],
            ),
          ),
          Expanded(
            child: _nearbyUsers.isEmpty
                ? const Center(child: Text('No nearby matches yet.'))
                : ListView.builder(
                    itemCount: _nearbyUsers.length,
                    itemBuilder: (context, index) {
                      final user = _nearbyUsers[index];
                      return ListTile(
                        title: Text(user.name ?? 'Someone nearby'),
                        subtitle: Text('${user.distanceKm.toStringAsFixed(1)} km away'),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
