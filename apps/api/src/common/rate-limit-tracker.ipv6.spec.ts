import { getIpRateLimitTracker } from './rate-limit-tracker';

it('un /64 de IPv6 comparte cuota y otro no', () => {
  const tracker = (ip: string): string => getIpRateLimitTracker({ ip });
  expect(tracker('2001:db8:1:2::1')).toBe(tracker('2001:db8:1:2:aaaa::9'));
  expect(tracker('2001:db8:1:3::1')).not.toBe(tracker('2001:db8:1:2::1'));
  expect(tracker('::ffff:203.0.113.7')).toBe(tracker('203.0.113.7'));
});
