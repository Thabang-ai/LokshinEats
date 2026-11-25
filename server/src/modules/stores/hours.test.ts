/**
 * Whether the clock says a kitchen is open.
 *
 * Opening hours have been collected since the first registration form and
 * have never meant anything: a kitchen whose hours said 08:00-18:00 could
 * sit "open" at three in the morning, and a customer could order from it.
 *
 * The case worth the most care is the kitchen that trades past midnight.
 * 18:00 to 02:00 is an ordinary night for a kota place, and reading that as
 * a fourteen-hour closure would shut exactly the kitchens that are busiest.
 */

import { describe, expect, it } from 'vitest';
import { isTakingOrders, withinHours } from './store.model';

/** A moment in Johannesburg, given as the UTC instant behind it. */
function sast(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 10, 25, hour - 2, minute));
}

describe('withinHours', () => {
  it('is open between opening and closing', () => {
    expect(withinHours('08:00', '18:00', sast(12))).toBe(true);
  });

  it('is closed before it opens and after it shuts', () => {
    expect(withinHours('08:00', '18:00', sast(7, 59))).toBe(false);
    expect(withinHours('08:00', '18:00', sast(18))).toBe(false);
  });

  it('opens exactly on the minute it says', () => {
    expect(withinHours('08:00', '18:00', sast(8))).toBe(true);
  });

  it('trades past midnight when closing comes before opening', () => {
    // 18:00 to 02:00, which is most of this platform's Friday nights.
    expect(withinHours('18:00', '02:00', sast(23))).toBe(true);
    expect(withinHours('18:00', '02:00', sast(1))).toBe(true);
    expect(withinHours('18:00', '02:00', sast(3))).toBe(false);
    expect(withinHours('18:00', '02:00', sast(12))).toBe(false);
  });

  it('treats hours nobody gave as no restriction', () => {
    // Half a kitchen's registration form is blank; that is not a reason to
    // close it.
    expect(withinHours(null, '18:00', sast(23))).toBe(true);
    expect(withinHours('08:00', null, sast(3))).toBe(true);
    expect(withinHours(null, null, sast(3))).toBe(true);
  });

  it('treats identical times as always open, not never', () => {
    expect(withinHours('00:00', '00:00', sast(13))).toBe(true);
  });

  it('ignores a time that is not a time', () => {
    expect(withinHours('whenever', '18:00', sast(23))).toBe(true);
  });

  it('reads the clock in Johannesburg, not UTC', () => {
    // 00:30 SAST is 22:30 UTC the day before. A kitchen open 18:00-02:00 is
    // open; one that measured UTC would call it closed.
    expect(withinHours('18:00', '02:00', sast(0, 30))).toBe(true);
  });
});

describe('isTakingOrders', () => {
  const hours = { openingTime: '08:00', closingTime: '18:00' };

  it('needs the switch on, whatever the clock says', () => {
    expect(
      isTakingOrders(
        { switchedOn: false, hoursMode: 'scheduled', ...hours },
        sast(12),
      ),
    ).toBe(false);
  });

  it('lets a kitchen close early inside its own hours', () => {
    // The pots ran out at four. The switch still wins.
    expect(
      isTakingOrders(
        { switchedOn: false, hoursMode: 'manual', ...hours },
        sast(12),
      ),
    ).toBe(false);
  });

  it('ignores the hours when the kitchen has not asked for them', () => {
    // Every kitchen registered before this existed. Their hours were never
    // a rule and must not become one behind their backs.
    expect(
      isTakingOrders(
        { switchedOn: true, hoursMode: 'manual', ...hours },
        sast(23),
      ),
    ).toBe(true);
  });

  it('closes a scheduled kitchen outside its hours', () => {
    expect(
      isTakingOrders(
        { switchedOn: true, hoursMode: 'scheduled', ...hours },
        sast(23),
      ),
    ).toBe(false);
  });

  it('opens a scheduled kitchen inside them', () => {
    expect(
      isTakingOrders(
        { switchedOn: true, hoursMode: 'scheduled', ...hours },
        sast(9),
      ),
    ).toBe(true);
  });
});
