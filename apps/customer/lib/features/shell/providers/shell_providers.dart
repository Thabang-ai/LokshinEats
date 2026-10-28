/// Which tab the app is on, held outside the shell so a screen can send you
/// to another one.
///
/// The home tab is where you are tempted - a hero, what you might be craving,
/// who is popular - and every one of those is a way of saying "show me the
/// kitchens", which lives on the next tab. Without this, tapping Kota could
/// only push a new screen on top of the home tab, leaving the bottom bar
/// claiming you were still on Home.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../stores/providers/store_providers.dart';

/// The tabs by name rather than by number: two of them only exist for a
/// signed-in customer, so an index means different things to different
/// people.
enum HomeTab { home, kitchens, orders, favourites, account }

class SelectedTab extends Notifier<HomeTab> {
  @override
  HomeTab build() => HomeTab.home;

  void go(HomeTab tab) => state = tab;

  /// Show the kitchens, narrowed to what was tapped.
  ///
  /// Searching for the category name is what the website's category links do,
  /// and it is the same search the field at the top of that tab performs.
  void searchKitchens(String query) {
    ref.read(storeSearchQueryProvider.notifier).update(query);
    state = HomeTab.kitchens;
  }
}

final selectedTabProvider = NotifierProvider<SelectedTab, HomeTab>(
  SelectedTab.new,
);
