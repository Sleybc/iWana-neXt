/**
 * Calcula hash MD5 (RFC 1321) para construir URL de Gravatar.
 * Uso exclusivo de avatar; no es una primitiva criptografica segura.
 */
function md5(input: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }

  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }

  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }

  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const str = unescape(encodeURIComponent(input));
  const x: number[] = [];

  for (let i = 0; i < str.length * 8; i += 8) {
    x[i >> 5] = (x[i >> 5] ?? 0) | ((str.charCodeAt(i / 8) & 0xff) << (i % 32));
  }

  x[str.length * 8 >> 5] = (x[str.length * 8 >> 5] ?? 0) | (0x80 << ((str.length * 8) % 32));
  x[(((str.length * 8 + 64) >>> 9) << 4) + 14] = str.length * 8;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let i = 0; i < x.length; i += 16) {
    const oa = a;
    const ob = b;
    const oc = c;
    const od = d;

    a = md5ff(a, b, c, d, x[i + 0] ?? 0, 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1] ?? 0, 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2] ?? 0, 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3] ?? 0, 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4] ?? 0, 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5] ?? 0, 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6] ?? 0, 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7] ?? 0, 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8] ?? 0, 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9] ?? 0, 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10] ?? 0, 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11] ?? 0, 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12] ?? 0, 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13] ?? 0, 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14] ?? 0, 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15] ?? 0, 22, 1236535329);

    a = md5gg(a, b, c, d, x[i + 1] ?? 0, 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6] ?? 0, 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11] ?? 0, 14, 643717713);
    b = md5gg(b, c, d, a, x[i + 0] ?? 0, 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5] ?? 0, 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10] ?? 0, 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15] ?? 0, 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4] ?? 0, 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9] ?? 0, 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14] ?? 0, 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3] ?? 0, 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8] ?? 0, 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13] ?? 0, 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2] ?? 0, 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7] ?? 0, 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12] ?? 0, 20, -1926607734);

    a = md5hh(a, b, c, d, x[i + 5] ?? 0, 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8] ?? 0, 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11] ?? 0, 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14] ?? 0, 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1] ?? 0, 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4] ?? 0, 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7] ?? 0, 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10] ?? 0, 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13] ?? 0, 4, 681279174);
    d = md5hh(d, a, b, c, x[i + 0] ?? 0, 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3] ?? 0, 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6] ?? 0, 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9] ?? 0, 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12] ?? 0, 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15] ?? 0, 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2] ?? 0, 23, -995338651);

    a = md5ii(a, b, c, d, x[i + 0] ?? 0, 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7] ?? 0, 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14] ?? 0, 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5] ?? 0, 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12] ?? 0, 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3] ?? 0, 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10] ?? 0, 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1] ?? 0, 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8] ?? 0, 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15] ?? 0, 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6] ?? 0, 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13] ?? 0, 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4] ?? 0, 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11] ?? 0, 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2] ?? 0, 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9] ?? 0, 21, -343485551);

    a = safeAdd(a, oa);
    b = safeAdd(b, ob);
    c = safeAdd(c, oc);
    d = safeAdd(d, od);
  }

  return [a, b, c, d]
    .flatMap((n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff])
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Genera URL de Gravatar a partir de email normalizado.
 */
export function gravatarUrl(email: string, size = 192): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}
