const ts = require('C:/appiw/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript');
const fs = require('fs'),
  path = require('path');
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, o);
    } else if (p.endsWith('.ts') && !/\.spec\.ts$|\.d\.ts$|fixture/.test(p)) o.push(p);
  }
  return o;
}
const files = walk('apps/api/src');
const rows = [];
const isPortCall = (n) => {
  if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return null;
  const t = n.expression.expression.getText();
  const m = n.expression.name.text;
  if (/^this\.\w*(Port|privacyMarks)\b/.test(t) || /^\w*(ReadPort|privacyMarksReadPort)!?$/.test(t))
    return t.replace(/\?$/, '') + '.' + m;
  return null;
};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes('runInTenantSchema') && !src.includes('withPrivacyTenant')) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const methods = new Map();
  const collect = (n) => {
    if (ts.isMethodDeclaration(n) && n.body) {
      methods.set(n.name.getText(), n);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const direct = new Map();
  for (const [k, m] of methods) {
    const s = [];
    const v = (n) => {
      const c = isPortCall(n);
      if (c) s.push(c);
      ts.forEachChild(n, v);
    };
    v(m.body);
    direct.set(k, new Set(s));
  }
  let ch = true;
  const calls = new Map();
  for (const [k, m] of methods) {
    const s = new Set();
    const v = (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      )
        s.add(n.expression.name.text);
      ts.forEachChild(n, v);
    };
    v(m.body);
    calls.set(k, s);
  }
  while (ch) {
    ch = false;
    for (const [k, s] of calls)
      for (const c of s)
        for (const p of direct.get(c) || [])
          if (!direct.get(k).has(p)) {
            direct.get(k).add(p);
            ch = true;
          }
  }
  const inTx = (n) => {
    let p = n.parent;
    while (p) {
      if (
        ts.isCallExpression(p) &&
        /runInTenantSchema|withPrivacyTenant/.test(p.expression.getText()) &&
        (ts.isArrowFunction(n) || true)
      ) {
        return true;
      }
      p = p.parent;
    }
    return false;
  };
  const encl = (n) => {
    let p = n;
    while (p) {
      if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p)) return p.name.getText();
      p = p.parent;
    }
    return '?';
  };
  const v = (n) => {
    const c = isPortCall(n);
    if (c && inTx(n)) {
      rows.push([
        f,
        sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        encl(n),
        /manager|qr|queryRunner|ctx|tx|em/i.test(n.arguments.map((a) => a.getText()).join(','))
          ? 'directo-conManager'
          : 'directo-SINmanager',
        c,
      ]);
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
      inTx(n)
    ) {
      const d = direct.get(n.expression.name.text);
      if (d && d.size)
        rows.push([
          f,
          sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          encl(n),
          'via ' + n.expression.name.text,
          [...d].join(','),
        ]);
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}
for (const r of rows)
  console.log(r.join(' | ').split(path.sep).join('/').replace('apps/api/src/modules/', ''));
console.error('total', rows.length);
