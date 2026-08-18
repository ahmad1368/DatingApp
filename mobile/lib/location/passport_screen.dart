import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'passport_api.dart';

class PassportScreen extends StatefulWidget {
  const PassportScreen({super.key, required this.passportApi, this.tileProvider});

  final PassportApi passportApi;

  /// Overridable so tests can avoid real network tile requests.
  final TileProvider? tileProvider;

  @override
  State<PassportScreen> createState() => _PassportScreenState();
}

class _PassportScreenState extends State<PassportScreen> {
  LatLng? _selectedPoint;
  bool _isBusy = false;
  String? _errorText;
  String? _statusText;

  Future<void> _setPassportLocation() async {
    final point = _selectedPoint;
    if (point == null) {
      return;
    }
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.passportApi.setPassportLocation(
        latitude: point.latitude,
        longitude: point.longitude,
      );
      setState(() => _statusText = 'Passport location set. You\'ll now match with people there.');
    } on PassportApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _disablePassport() async {
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.passportApi.clearPassportLocation();
      setState(() {
        _statusText = 'Passport disabled. Back to your real location.';
        _selectedPoint = null;
      });
    } on PassportApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final point = _selectedPoint;

    return Scaffold(
      appBar: AppBar(title: const Text('Passport')),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Tap anywhere on the map to match with people there before you travel.'),
          ),
          Expanded(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: const LatLng(20, 0),
                initialZoom: 2,
                onTap: (_, latLng) => setState(() => _selectedPoint = latLng),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.datingapp.mobile',
                  tileProvider: widget.tileProvider ?? NetworkTileProvider(),
                ),
                if (point != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: point,
                        child: const Icon(Icons.location_pin, color: Colors.red, size: 40),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  point == null
                      ? 'No location selected'
                      : 'Selected: ${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}',
                ),
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 8),
                  Text(_statusText!),
                ],
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _isBusy || point == null ? null : _setPassportLocation,
                  child: const Text('Set passport location'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _isBusy ? null : _disablePassport,
                  child: const Text('Disable passport'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
