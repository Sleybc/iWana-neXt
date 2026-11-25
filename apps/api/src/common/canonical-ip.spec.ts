import { canonicalClientIp } from './canonical-ip';

describe('canonicalClientIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:cb00:7107', '203.0.113.7'],
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
  ])('%s → %s', (raw, expected) => {
    expect(canonicalClientIp(raw)).toBe(expected);
  });

  it.each([undefined, '', 'x', '203.0.113', '203.0.113.7, 10.0.0.1'])('%s no es válida', (raw) => {
    expect(canonicalClientIp(raw)).toBeNull();
  });
});
