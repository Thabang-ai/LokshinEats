/// The eight things a customer might be craving, as the website lists them.
///
/// Deliberately the same eight, in the same order, with the same photographs
/// as `app/page.tsx`: someone who browses the site and then installs the app
/// should land somewhere they recognise.
///
/// Tapping one searches for its name. That is not a new kind of filtering -
/// it is the search the list already does, which matches a kitchen's name,
/// its cuisine and its categories - so a category with nobody cooking it
/// honestly comes back empty rather than pretending.
library;

class FoodCategory {
  const FoodCategory(this.name, this.imageUrl);

  final String name;
  final String imageUrl;
}

const foodCategories = <FoodCategory>[
  FoodCategory(
    'Kota',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Braai',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Pap & Vleis',
    'https://images.unsplash.com/photo-1547592180-85f173990554?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Fast Food',
    'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Groceries',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Drinks',
    'https://images.unsplash.com/photo-1556881286-fc6915169721?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Bunny Chow',
    'https://images.unsplash.com/photo-1606471191009-63994c53433b?w=500&h=500&fit=crop',
  ),
  FoodCategory(
    'Sweets',
    'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=500&h=500&fit=crop',
  ),
];

/// The photograph behind the hero, as on the website.
const heroImageUrl =
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&h=800&fit=crop';
