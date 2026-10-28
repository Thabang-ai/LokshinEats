/// The kitchen's two photographs: the banner and the logo.
///
/// Both were impossible to set from anywhere. The website sent them to a
/// Firebase Storage bucket that does not exist on this plan and threw before
/// the kitchen was written - so a vendor who chose a logo while registering
/// lost the registration - and the app never asked for them at all. A
/// kitchen's page looked unfinished and its owner had no way to finish it.
///
/// Unlike a dish, a kitchen always exists by the time this is on screen, so
/// a photograph goes up the moment it is chosen rather than waiting for a
/// save. There is nothing else on this screen it needs to be saved with.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';

import '../providers/store_providers.dart';

class StorePhotoField extends ConsumerStatefulWidget {
  const StorePhotoField({
    super.key,
    required this.kind,
    required this.title,
    required this.explanation,
    required this.currentUrl,
    required this.aspectRatio,
    this.round = false,
  });

  /// `banner` or `logo`, as the API names them.
  final String kind;
  final String title;
  final String explanation;
  final String? currentUrl;
  final double aspectRatio;

  /// Logos are shown round, the way a customer sees them.
  final bool round;

  @override
  ConsumerState<StorePhotoField> createState() => _StorePhotoFieldState();
}

class _StorePhotoFieldState extends ConsumerState<StorePhotoField> {
  Uint8List? _justPicked;
  bool _busy = false;
  String? _error;

  Future<void> _pick(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      // A banner is wide and a logo is small; neither needs more than this,
      // and the kitchen is paying for the data that carries it.
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 70,
    );
    if (picked == null) return;

    final bytes = await picked.readAsBytes();
    if (!mounted) return;

    setState(() {
      _justPicked = bytes;
      _busy = true;
      _error = null;
    });

    try {
      await ref
          .read(myStoreProvider.notifier)
          .uploadPhoto(
            kind: widget.kind,
            bytes: bytes,
            contentType: picked.mimeType ?? _typeFromName(picked.name),
          );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _justPicked = null;
        _error = error.firstFieldError ?? error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _justPicked = null;
        _error = 'That photo did not upload. Try again.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _typeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          widget.explanation,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: widget.round ? 110 : double.infinity,
          child: AspectRatio(
            aspectRatio: widget.aspectRatio,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(
                widget.round ? 100 : AppTheme.radius,
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(
                    color: theme.colorScheme.surfaceContainerHighest,
                    child: _preview(theme),
                  ),
                  if (_busy)
                    const ColoredBox(
                      color: Color(0x66000000),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        // Each takes half: side by side at their natural width they run off
        // the edge of a 360dp phone.
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _pick(ImageSource.camera),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Take one'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _pick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Choose one'),
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.error,
            ),
          ),
        ],
      ],
    );
  }

  Widget _preview(ThemeData theme) {
    final picked = _justPicked;
    if (picked != null) return Image.memory(picked, fit: BoxFit.cover);

    final url = widget.currentUrl;
    if (url != null && url.isNotEmpty) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _empty(theme),
      );
    }

    return _empty(theme);
  }

  Widget _empty(ThemeData theme) {
    return Center(
      child: Icon(
        Icons.add_a_photo_outlined,
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}
