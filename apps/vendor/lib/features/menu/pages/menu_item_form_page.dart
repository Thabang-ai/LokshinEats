/// Adding a dish, or changing one.
///
/// The price is what the next customer pays; orders already placed keep the
/// price they were placed at. The form says that under the price, because a
/// kitchen raising a price mid-service will wonder.
///
/// Removing a dish is here rather than on the list, behind a confirmation
/// that points at the gentler option: most of the time a dish is not gone,
/// it is sold out, and switching it off is what the kitchen actually means.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';

import '../models/menu_item.dart';
import '../providers/menu_providers.dart';

class MenuItemFormPage extends ConsumerStatefulWidget {
  const MenuItemFormPage({super.key, this.item});

  /// The dish being changed, or null when adding one.
  final MenuItem? item;

  @override
  ConsumerState<MenuItemFormPage> createState() => _MenuItemFormPageState();
}

class _MenuItemFormPageState extends ConsumerState<MenuItemFormPage> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.item?.name);
  late final _description = TextEditingController(
    text: widget.item?.description,
  );
  late final _price = TextEditingController(
    text: widget.item == null ? '' : widget.item!.price.toStringAsFixed(2),
  );
  late final _category = TextEditingController(text: widget.item?.category);
  late final _prepTime = TextEditingController(
    text: '${widget.item?.preparationTime ?? 20}',
  );
  late bool _vegetarian = widget.item?.isVegetarian ?? false;
  late bool _spicy = widget.item?.isSpicy ?? false;

  bool _busy = false;
  String? _error;

  /// A photograph chosen but not yet sent.
  ///
  /// Held here rather than uploaded on the spot because a dish being added
  /// has no id yet - there is nothing to attach a photograph to until it is
  /// saved. So the picture waits, and goes up immediately afterwards.
  Uint8List? _photo;
  String? _photoType;

  bool get _editing => widget.item != null;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _price.dispose();
    _category.dispose();
    _prepTime.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final draft = MenuItemDraft(
      name: _name.text,
      description: _description.text,
      price: parseRands(_price.text)!,
      category: _category.text,
      preparationTime: int.parse(_prepTime.text.trim()),
      isVegetarian: _vegetarian,
      isSpicy: _spicy,
    );

    setState(() {
      _busy = true;
      _error = null;
    });

    final notifier = ref.read(menuProvider.notifier);
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    try {
      final saved = _editing
          ? await notifier.updateItem(widget.item!.id, draft)
          : await notifier.add(draft);

      // The dish is saved either way; a photograph that fails to upload is
      // worth saying so about, not worth losing the dish over.
      final photo = _photo;
      if (photo != null) {
        try {
          await notifier.uploadPhoto(
            saved.id,
            bytes: photo,
            contentType: _photoType ?? 'image/jpeg',
          );
        } on ApiException catch (error) {
          messenger.showSnackBar(
            SnackBar(
              content: Text(
                'Saved, but the photo did not go up: '
                '${error.firstFieldError ?? error.message}',
              ),
            ),
          );
          if (mounted) setState(() => _busy = false);
          navigator.pop();
          return;
        }
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            _editing
                ? 'Saved. Customers see the change straight away.'
                : '${draft.name.trim()} is on your menu.',
          ),
        ),
      );
      navigator.pop();
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.firstFieldError ?? error.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Take a photograph, or choose one already on the phone.
  ///
  /// Resized and compressed by the picker before it reaches us: a kitchen
  /// photographs food on a phone that produces 4MB files, and what the API
  /// accepts - and what a customer on mobile data wants to download - is a
  /// fraction of that.
  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 70,
      );
      if (picked == null) return;

      final bytes = await picked.readAsBytes();
      if (!mounted) return;

      setState(() {
        _photo = bytes;
        _photoType = picked.mimeType ?? _typeFromName(picked.name);
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Could not open that photo. Try another.');
    }
  }

  static String _typeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  Future<void> _remove() async {
    final item = widget.item!;

    final choice = await showDialog<_RemoveChoice>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${item.name}?'),
        content: const Text(
          'It comes off your menu for good. Orders already placed keep their '
          'record of it.\n\nIf it is only sold out for now, switch it off '
          'instead — you can turn it back on when you have it again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Keep it'),
          ),
          if (item.available)
            TextButton(
              onPressed: () => Navigator.of(context).pop(_RemoveChoice.off),
              child: const Text('Switch it off'),
            ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(_RemoveChoice.remove),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (choice == null || !mounted) return;

    setState(() => _busy = true);
    final notifier = ref.read(menuProvider.notifier);
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    try {
      if (choice == _RemoveChoice.off) {
        await notifier.setAvailable(item.id, available: false);
        messenger.showSnackBar(
          SnackBar(content: Text('${item.name} is switched off.')),
        );
      } else {
        await notifier.remove(item.id);
        messenger.showSnackBar(
          SnackBar(content: Text('${item.name} is off your menu.')),
        );
      }
      navigator.pop();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final categories = ref.watch(menuCategoriesProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(_editing ? 'Edit dish' : 'Add a dish'),
        actions: [
          if (_editing)
            IconButton(
              onPressed: _busy ? null : _remove,
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Remove from the menu',
            ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              _PhotoField(
                picked: _photo,
                existing: widget.item?.photoUrl,
                busy: _busy,
                onPick: _pickPhoto,
                onClear: _photo == null
                    ? null
                    : () => setState(() {
                        _photo = null;
                        _photoType = null;
                      }),
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  hintText: 'Full House Kota',
                  border: OutlineInputBorder(),
                ),
                validator: (value) => (value ?? '').trim().length < 2
                    ? 'Give the dish a name customers will recognise.'
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _price,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Price',
                  prefixText: 'R ',
                  hintText: '45,50',
                  helperText:
                      'What the next customer pays. Orders already placed '
                      'keep their price.',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  final price = parseRands(value ?? '');
                  if (price == null) return 'Enter a price, like 45,50.';
                  if (price < 0.01) return 'The price has to be more than R0.';
                  if (price > 10000) return 'That is more than any dish costs.';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _category,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Section of the menu',
                  hintText: 'Kotas, Sides, Drinks',
                  border: OutlineInputBorder(),
                ),
                validator: (value) => (value ?? '').trim().isEmpty
                    ? 'Say which section it goes under.'
                    : null,
              ),
              // The sections already on the menu, one tap away. Typing "Kota"
              // when the menu says "Kotas" makes two sections of one thing.
              if (categories.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final c in categories)
                      ActionChip(
                        label: Text(c),
                        onPressed: () => setState(() => _category.text = c),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              TextFormField(
                controller: _description,
                maxLines: 3,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  hintText: 'Quarter loaf, chips, polony, cheese, egg',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: _prepTime,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Minutes to make',
                  suffixText: 'min',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  final minutes = int.tryParse((value ?? '').trim());
                  if (minutes == null || minutes < 1) {
                    return 'Roughly how many minutes it takes.';
                  }
                  if (minutes > 240) return 'That is longer than four hours.';
                  return null;
                },
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Vegetarian'),
                value: _vegetarian,
                onChanged: (v) => setState(() => _vegetarian = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Spicy'),
                value: _spicy,
                onChanged: (v) => setState(() => _spicy = v),
              ),

              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ],

              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_editing ? 'Save' : 'Add to menu'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _RemoveChoice { off, remove }

/// The dish's photograph: what it is now, or what is about to replace it.
///
/// A kitchen with no photograph sells less, so this sits at the top of the
/// form rather than buried under the prices. It shows the picture at the
/// shape customers see it in.
class _PhotoField extends StatelessWidget {
  const _PhotoField({
    required this.picked,
    required this.existing,
    required this.busy,
    required this.onPick,
    required this.onClear,
  });

  final Uint8List? picked;
  final String? existing;
  final bool busy;
  final void Function(ImageSource source) onPick;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radius),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: ColoredBox(
              color: theme.colorScheme.surfaceContainerHighest,
              child: _preview(theme),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : () => onPick(ImageSource.camera),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Take a photo'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : () => onPick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Choose one'),
              ),
            ),
          ],
        ),
        if (onClear != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: busy ? null : onClear,
              child: const Text('Undo this photo'),
            ),
          ),
        const SizedBox(height: 4),
        Text(
          picked != null
              ? 'This goes up when you save.'
              : 'Customers choose with their eyes. One clear photo in good '
                    'light sells a dish.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _preview(ThemeData theme) {
    final chosen = picked;
    if (chosen != null) return Image.memory(chosen, fit: BoxFit.cover);

    final url = existing;
    if (url != null && url.isNotEmpty) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _empty(theme, 'That photo would not load'),
      );
    }

    return _empty(theme, 'No photo yet');
  }

  Widget _empty(ThemeData theme, String message) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.restaurant_menu_rounded,
            size: 36,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
