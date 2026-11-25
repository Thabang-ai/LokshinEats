/// Changing what customers see.
///
/// A kitchen registers once, in a hurry, and then lives with whatever it
/// typed: the name over the shop, the street it is on, what it says it
/// cooks. Until this screen there was no way to correct any of it from the
/// app - a misspelt name was permanent, and a kitchen that moved had to ask
/// someone with database access.
///
/// Only what changed is sent, so a field this screen does not ask about -
/// opening hours, the photographs - is never quietly blanked by saving.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/utils/money.dart';

import '../models/store.dart';
import '../providers/store_providers.dart';
import '../widgets/store_photo_field.dart';

class EditStorePage extends ConsumerStatefulWidget {
  const EditStorePage({super.key, required this.store});

  final Store store;

  @override
  ConsumerState<EditStorePage> createState() => _EditStorePageState();
}

class _EditStorePageState extends ConsumerState<EditStorePage> {
  final _formKey = GlobalKey<FormState>();

  late final _name = TextEditingController(text: widget.store.name);
  late final _cuisine = TextEditingController(text: widget.store.cuisine);
  late final _description = TextEditingController(
    text: widget.store.description,
  );
  late final _address = TextEditingController(text: widget.store.address);
  late final _city = TextEditingController(text: widget.store.city);
  late final _phone = TextEditingController(text: widget.store.phone ?? '');
  late final _deliveryTime = TextEditingController(
    text: widget.store.deliveryTime,
  );
  late final _minOrder = TextEditingController(
    text: widget.store.minOrderAmount.toStringAsFixed(2),
  );
  late final _opening = TextEditingController(
    text: widget.store.openingTime ?? '',
  );
  late final _closing = TextEditingController(
    text: widget.store.closingTime ?? '',
  );

  late bool _scheduled = widget.store.hoursMode == StoreHoursMode.scheduled;

  /// Where the kitchen delivers, and whether it limits that at all.
  ///
  /// An empty list on the kitchen means no limit, so the switch starts off
  /// and the list starts as whatever the kitchen already serves.
  late final List<String> _areas = [...widget.store.deliveryAreas];
  late bool _limitAreas = widget.store.hasDeliveryAreas;
  final _area = TextEditingController();
  String? _areaError;

  bool _busy = false;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _cuisine,
      _description,
      _address,
      _city,
      _phone,
      _deliveryTime,
      _minOrder,
      _opening,
      _closing,
      _area,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  /// The value if it changed, or null to leave it alone.
  String? _changed(TextEditingController controller, String current) {
    final value = controller.text.trim();
    return value == current.trim() ? null : value;
  }

  double? _changedAmount(TextEditingController controller, double current) {
    final value = double.tryParse(controller.text.trim().replaceAll(',', '.'));
    if (value == null) return null;
    return (value - current).abs() < 0.005 ? null : value;
  }

  /// Case and spacing are noise; the letters are the name. Matches the API.
  String _areaKey(String value) =>
      value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

  /// The kitchen's own township, which it always delivers to.
  bool _isOwnCity(String area) => _areaKey(area) == _areaKey(widget.store.city);

  void _addArea() {
    final name = _area.text.trim();
    if (name.length < 2) return;

    setState(() {
      if (!_areas.any((existing) => _areaKey(existing) == _areaKey(name))) {
        _areas.add(name);
      }
      _area.clear();
      _limitAreas = true;
    });
  }

  /// The areas to send, or null when nothing about them changed.
  List<String>? _changedAreas() {
    final wanted = _limitAreas ? _areas : const <String>[];
    return wanted.join('\u0000') == widget.store.deliveryAreas.join('\u0000')
        ? null
        : List.of(wanted);
  }

  Future<void> _save() async {
    // A limit with nothing in it would mean "deliver nowhere", which is not
    // what anybody switching this on means.
    final emptyLimit = _limitAreas && _areas.isEmpty;
    setState(() => _areaError = emptyLimit ? 'Name at least one area.' : null);

    if (!(_formKey.currentState?.validate() ?? false) || emptyLimit) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      await ref
          .read(myStoreProvider.notifier)
          .updateDetails(
            name: _changed(_name, widget.store.name),
            cuisine: _changed(_cuisine, widget.store.cuisine),
            description: _changed(_description, widget.store.description),
            address: _changed(_address, widget.store.address),
            city: _changed(_city, widget.store.city),
            phone: _changed(_phone, widget.store.phone ?? ''),
            deliveryTime: _changed(_deliveryTime, widget.store.deliveryTime),
            minOrderAmount: _changedAmount(
              _minOrder,
              widget.store.minOrderAmount,
            ),
            openingTime: _changed(_opening, widget.store.openingTime ?? ''),
            closingTime: _changed(_closing, widget.store.closingTime ?? ''),
            hoursMode:
                _scheduled ==
                    (widget.store.hoursMode == StoreHoursMode.scheduled)
                ? null
                : (_scheduled ? 'scheduled' : 'manual'),
            deliveryAreas: _changedAreas(),
          );

      messenger.showSnackBar(
        const SnackBar(content: Text('Your kitchen has been updated')),
      );
      navigator.pop();
    } on ApiException catch (error) {
      // The API says which field is wrong; passing that on is the difference
      // between a fixable form and a dead end.
      messenger.showSnackBar(
        SnackBar(content: Text(error.firstFieldError ?? error.message)),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not save that. Try again.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Your kitchen')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            children: [
              Text(
                'What customers see',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              StorePhotoField(
                kind: 'banner',
                title: 'Your banner',
                explanation:
                    'The wide picture across the top of your page. Your food '
                    'or your shopfront, in good light.',
                currentUrl: widget.store.bannerUrl,
                aspectRatio: 16 / 9,
              ),
              const SizedBox(height: 22),
              StorePhotoField(
                kind: 'logo',
                title: 'Your logo',
                explanation: 'The small round picture beside your name.',
                currentUrl: widget.store.logoUrl,
                aspectRatio: 1,
                round: true,
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Kitchen name'),
                validator: (value) => (value ?? '').trim().length < 2
                    ? 'Your kitchen needs a name.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _cuisine,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'What you cook',
                  helperText: 'Kota Specialist, Traditional Township Food…',
                ),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ? 'Say what you cook.' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _description,
                maxLines: 4,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'About your kitchen',
                ),
              ),

              const SizedBox(height: 8),
              Text(
                'Where you are',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _address,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Street address'),
                validator: (value) => (value ?? '').trim().length < 3
                    ? 'Drivers need an address to collect from.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _city,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Township or city',
                ),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ? 'Which area?' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone',
                  helperText: 'For drivers and LokshinEats, not customers.',
                ),
              ),

              const SizedBox(height: 24),
              Text(
                'Delivery',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _deliveryTime,
                decoration: const InputDecoration(
                  labelText: 'How long you take',
                  helperText: '30-45 min',
                ),
                validator: (value) => (value ?? '').trim().length < 3
                    ? 'Give customers an idea of the wait.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _minOrder,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Minimum order',
                  prefixText: 'R ',
                ),
                validator: _amount,
              ),
              const SizedBox(height: 20),

              // Hours that do something. They have been collected since the
              // first registration form and have never closed a kitchen, so
              // turning them on is the vendor's choice rather than a change
              // made to them.
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _scheduled,
                onChanged: (value) => setState(() => _scheduled = value),
                title: const Text('Open and close automatically'),
                subtitle: Text(
                  _scheduled
                      ? 'Customers can order between these times. You can '
                            'still close early whenever you need to.'
                      : 'Your open switch decides, and these times are only '
                            'shown to customers.',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _opening,
                      decoration: const InputDecoration(
                        labelText: 'Opens',
                        hintText: '08:00',
                      ),
                      validator: _time,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _closing,
                      decoration: const InputDecoration(
                        labelText: 'Closes',
                        hintText: '20:00',
                      ),
                      validator: _time,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'A closing time earlier than the opening one means you trade '
                'past midnight — 18:00 to 02:00 is a normal Friday.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),

              const SizedBox(height: 24),
              Text(
                'Where you deliver',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),

              // Until this existed a kitchen in Meadowlands could be ordered
              // from in Tembisa, 40km away: the order went through, the food
              // was cooked, and somebody had to phone the customer.
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _limitAreas,
                onChanged: (value) => setState(() {
                  _limitAreas = value;
                  _areaError = null;
                  // Their own township first, so the list starts out true
                  // rather than empty. The API adds it back anyway.
                  if (value && _areas.isEmpty && widget.store.city.isNotEmpty) {
                    _areas.add(widget.store.city);
                  }
                }),
                title: const Text('Only deliver to certain areas'),
                subtitle: Text(
                  _limitAreas
                      ? 'Customers outside these areas cannot order from you.'
                      : 'Anyone can order from you, however far away they are.',
                ),
              ),

              if (_limitAreas) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final area in _areas)
                      _isOwnCity(area)
                          // The kitchen's own township. The API puts it back
                          // if it is removed, so it is not offered as a
                          // choice here either.
                          ? Chip(
                              label: Text(area),
                              avatar: const Icon(Icons.home_outlined, size: 18),
                            )
                          : InputChip(
                              label: Text(area),
                              deleteButtonTooltipMessage:
                                  'Stop delivering to $area',
                              onDeleted: () =>
                                  setState(() => _areas.remove(area)),
                            ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _area,
                        textCapitalization: TextCapitalization.words,
                        onSubmitted: (_) => _addArea(),
                        decoration: InputDecoration(
                          labelText: 'Add an area',
                          hintText: 'Dobsonville',
                          errorText: _areaError,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: IconButton.filledTonal(
                        onPressed: _addArea,
                        icon: const Icon(Icons.add),
                        tooltip: 'Add this area',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Name the townships and suburbs a driver can reach from '
                  'you. A customer whose address is somewhere else is told '
                  'before they order, not after you have cooked.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],

              const SizedBox(height: 20),
              // No longer a field. The fee is the same from every kitchen on
              // LokshinEats, and a kitchen that could set it was setting the
              // driver's pay with it.
              Text(
                'Delivery costs customers '
                '${formatRands(widget.store.deliveryFee)} from every kitchen '
                'on LokshinEats, and most of it goes to the driver who brings '
                'the food. Orders already placed keep the fee they were '
                'placed at.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),

              const SizedBox(height: 28),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _amount(String? value) {
    final parsed = double.tryParse((value ?? '').trim().replaceAll(',', '.'));
    if (parsed == null) return 'Enter an amount.';
    if (parsed < 0) return 'That cannot be less than nothing.';
    return null;
  }

  /// A 24-hour time, or nothing at all.
  ///
  /// Blank is allowed while the switch is in charge: plenty of kitchens have
  /// never filled these in. It stops being allowed the moment the hours are
  /// what decides, because then a blank one would mean "never closed".
  String? _time(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) {
      return _scheduled ? 'Give a time, or turn this off.' : null;
    }
    return RegExp(r'^([01][0-9]|2[0-3]):[0-5][0-9]$').hasMatch(text)
        ? null
        : 'Use 24-hour time, like 08:00.';
  }
}
