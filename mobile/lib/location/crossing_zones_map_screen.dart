import 'package:flutter/material.dart';

import 'location_api.dart';

const double _mapSize = 320;
const double _mapPadding = 32;
const double _minDotSize = 16;
const double _maxDotSize = 40;

/// An interactive map overlay of the approximate neighborhood/landmark
/// zones (see backend's roundToZone) where the current user crossed
/// physical paths with potential matches today - tap a zone to see how many
/// crossings and distinct people were encountered there. This is a
/// lightweight scatter plot rather than a real map SDK, since this codebase
/// has no map/geocoding provider anywhere else either (see
/// DateSuggestionsApi.mapsSearchUrl, which is similarly just data).
class CrossingZonesMapScreen extends StatefulWidget {
  const CrossingZonesMapScreen({super.key, required this.locationApi});

  final LocationApi locationApi;

  @override
  State<CrossingZonesMapScreen> createState() => _CrossingZonesMapScreenState();
}

class _CrossingZonesMapScreenState extends State<CrossingZonesMapScreen> {
  List<CrossingZone> _zones = [];
  CrossingZone? _selectedZone;
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
      final zones = await widget.locationApi.fetchCrossingZones();
      setState(() => _zones = zones);
    } on LocationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Map<String, Offset> _positionsForZones() {
    if (_zones.isEmpty) {
      return {};
    }

    final latitudes = _zones.map((zone) => zone.latitude);
    final longitudes = _zones.map((zone) => zone.longitude);
    final minLat = latitudes.reduce((a, b) => a < b ? a : b);
    final maxLat = latitudes.reduce((a, b) => a > b ? a : b);
    final minLng = longitudes.reduce((a, b) => a < b ? a : b);
    final maxLng = longitudes.reduce((a, b) => a > b ? a : b);
    final latSpan = (maxLat - minLat) == 0 ? 1 : (maxLat - minLat);
    final lngSpan = (maxLng - minLng) == 0 ? 1 : (maxLng - minLng);
    final drawableSize = _mapSize - (2 * _mapPadding);

    return {
      for (final zone in _zones)
        zone.zoneId: Offset(
          _mapPadding + ((zone.longitude - minLng) / lngSpan) * drawableSize,
          // Screen y grows downward, but higher latitude is "up" on a map.
          _mapPadding + (1 - (zone.latitude - minLat) / latSpan) * drawableSize,
        ),
    };
  }

  double _dotSizeFor(CrossingZone zone) {
    final maxCount = _zones.map((z) => z.crossingCount).reduce((a, b) => a > b ? a : b);
    if (maxCount <= 1) {
      return _minDotSize;
    }
    final ratio = zone.crossingCount / maxCount;
    return _minDotSize + (ratio * (_maxDotSize - _minDotSize));
  }

  @override
  Widget build(BuildContext context) {
    final positions = _positionsForZones();
    final selectedZone = _selectedZone;

    return Scaffold(
      appBar: AppBar(title: const Text('Crossing Paths Map')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_zones.isEmpty)
                  const Expanded(
                    child: Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No crossed paths yet today. Keep location sharing on and get out '
                          "there - we'll map where you run into people.",
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  )
                else ...[
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Container(
                      width: _mapSize,
                      height: _mapSize,
                      decoration: BoxDecoration(
                        color: Colors.blueGrey.shade50,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.blueGrey.shade100),
                      ),
                      child: Stack(
                        children: [
                          for (final zone in _zones)
                            Positioned(
                              left: positions[zone.zoneId]!.dx - (_dotSizeFor(zone) / 2),
                              top: positions[zone.zoneId]!.dy - (_dotSizeFor(zone) / 2),
                              child: GestureDetector(
                                key: ValueKey('zone-${zone.zoneId}'),
                                onTap: () => setState(() => _selectedZone = zone),
                                child: Container(
                                  width: _dotSizeFor(zone),
                                  height: _dotSizeFor(zone),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: zone.zoneId == selectedZone?.zoneId
                                        ? Colors.deepPurple
                                        : Colors.deepPurple.withValues(alpha: 0.6),
                                    border: Border.all(color: Colors.white, width: 2),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (selectedZone != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        '${selectedZone.crossingCount} '
                        '${selectedZone.crossingCount == 1 ? 'crossing' : 'crossings'} · '
                        '${selectedZone.uniqueUserCount} '
                        '${selectedZone.uniqueUserCount == 1 ? 'person' : 'people'}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    )
                  else
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: Text('Tap a zone to see details.'),
                    ),
                ],
              ],
            ),
    );
  }
}
