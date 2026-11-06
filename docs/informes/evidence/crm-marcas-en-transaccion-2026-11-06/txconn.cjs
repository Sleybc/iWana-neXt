// Inventario: llamadas dentro de transacción que abren otra conexión o hacen E/S externa.
// Sigue this.metodo, this.campo.metodo y puertos abstractos hasta sus implementaciones. Uso: node txconn.js
const ts = require('C:/appiw/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript');
const fs = require('fs'),
  path = require('path');
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', 'dist', 'tests'].includes(e.name)) walk(p, o);
    } else if (p.endsWith('.ts') && !/\.spec\.ts$|\.d\.ts$|fixture/.test(p)) o.push(p);
  }
  return o;
}
const files = walk('apps/api/src');
const classes = new Map();
const impls = new Map();
const MGR = /manager|\bqr\b|queryRunner|\bctx\b|\btx\b|\bem\b/i;
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  const v = (n) => {
    if (ts.isClassDeclaration(n) && n.name) {
      const c = {
        name: n.name.text,
        file: f,
        sf,
        methods: new Map(),
        fields: new Map(),
        abstract: (n.modifiers || []).some((m) => m.kind === ts.SyntaxKind.AbstractKeyword),
      };
      for (const h of n.heritageClauses || [])
        for (const t of h.types) {
          const b = t.expression.getText();
          if (!impls.has(b)) impls.set(b, []);
          impls.get(b).push(c.name);
        }
      for (const m of n.members) {
        if (ts.isMethodDeclaration(m) && m.body) c.methods.set(m.name.getText(), m);
        if (ts.isPropertyDeclaration(m) && m.type) c.fields.set(m.name.getText(), m.type.getText());
        if (ts.isConstructorDeclaration(m))
          for (const p of m.parameters)
            if (
              p.type &&
              p.modifiers &&
              p.modifiers.some((x) =>
                [
                  ts.SyntaxKind.PrivateKeyword,
                  ts.SyntaxKind.ReadonlyKeyword,
                  ts.SyntaxKind.ProtectedKeyword,
                  ts.SyntaxKind.PublicKeyword,
                ].includes(x.kind),
              )
            )
              c.fields.set(
                p.name.getText(),
                p.type.getText().replace(/\s*\|\s*(null|undefined)/g, ''),
              );
      }
      if (!classes.has(c.name)) classes.set(c.name, c);
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}
const OPEN = /^(runInTenantSchema|withPrivacyTenant|runInPublic\w*)$/;
const isOpenCall = (n) => {
  const e = n.expression.getText().replace(/\?/g, '');
  if (OPEN.test(e)) return e;
  if (/\.(createQueryRunner|transaction)$/.test(e) && /dataSource/i.test(e)) return e;
  if (/dataSource\.(query|getRepository|manager)/i.test(e)) return e;
  if (ts.isPropertyAccessExpression(n.expression)) {
    const o = n.expression.expression.getText().replace(/\?/g, '');
    if (/^this\.\w*(Repo|Repository)$/.test(o)) return e;
  }
  return null;
};
const isExt = (n, c) => {
  const e = n.expression.getText().replace(/\?/g, '');
  if (/^this\.\w*queue\w*\.(add|addBulk)$/i.test(e)) return 'bullmq:' + e;
  if (
    /^(fetch|axios\.\w+)$/.test(e) ||
    /httpService|mailer|sendMail|s3|minio|storageClient|redis\.\w+$/i.test(e)
  )
    return 'ext:' + e;
  return null;
};
const memo = new Map();
function targets(c, field, meth) {
  const t = c.fields.get(field);
  if (!t) return [];
  const name = t.replace(/<.*/, '').trim();
  const out = [];
  const st = [name],
    seen = new Set();
  while (st.length) {
    const x = st.pop();
    if (seen.has(x)) continue;
    seen.add(x);
    const k = classes.get(x);
    if (k && k.methods.has(meth)) out.push(x);
    for (const i of impls.get(x) || []) st.push(i);
  }
  return out;
}
function effects(cn, mn, stack = new Set()) {
  const key = cn + '.' + mn;
  if (memo.has(key)) return memo.get(key);
  if (stack.has(key)) return [];
  stack.add(key);
  const c = classes.get(cn);
  const m = c && c.methods.get(mn);
  const res = new Set();
  if (m) {
    const v = (n) => {
      if (ts.isCallExpression(n)) {
        const o = isOpenCall(n);
        if (o) res.add('conn@' + key);
        const x = isExt(n, c);
        if (x) res.add(x + '@' + key);
        if (ts.isPropertyAccessExpression(n.expression)) {
          const pe = n.expression;
          const argsTxt = n.arguments.map((a) => a.getText()).join(',');
          if (
            pe.expression.kind === ts.SyntaxKind.ThisKeyword &&
            c.methods.has(pe.name.text) &&
            !MGR.test(argsTxt)
          )
            for (const r of effects(cn, pe.name.text, stack)) res.add(r);
          const fm = pe.expression
            .getText()
            .replace(/[?!]/g, '')
            .match(/^this\.(\w+)$/);
          if (fm && !MGR.test(argsTxt))
            for (const t of targets(c, fm[1], pe.name.text))
              for (const r of effects(t, pe.name.text, stack)) res.add(r);
        }
      }
      ts.forEachChild(n, v);
    };
    v(m.body);
  }
  stack.delete(key);
  const a = [...res];
  memo.set(key, a);
  return a;
}
const TX = /runInTenantSchema|withPrivacyTenant|dataSource\.transaction|manager\.transaction/i;
const inTx = (n) => {
  let p = n.parent;
  while (p) {
    if (ts.isCallExpression(p) && TX.test(p.expression.getText()) && !p.arguments.includes(n))
      return true;
    p = p.parent;
  }
  return false;
};
const encl = (n) => {
  let p = n;
  while (p) {
    if (ts.isMethodDeclaration(p)) return p.name.getText();
    p = p.parent;
  }
  return '?';
};
const rows = [];
for (const c of classes.values()) {
  const v = (n) => {
    if (ts.isCallExpression(n) && inTx(n) && ts.isPropertyAccessExpression(n.expression)) {
      const pe = n.expression;
      const argsTxt = n.arguments.map((a) => a.getText()).join(',');
      const line = c.sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      const rec = (tgt, eff) => {
        if (eff.length)
          rows.push({
            file: c.file.split(path.sep).join('/').replace('apps/api/src/modules/', ''),
            line,
            method: encl(n),
            call: tgt,
            eff,
          });
      };
      const x = isExt(n, c);
      if (x) rec(n.expression.getText(), [x]);
      if (!MGR.test(argsTxt)) {
        if (pe.expression.kind === ts.SyntaxKind.ThisKeyword && c.methods.has(pe.name.text))
          rec('this.' + pe.name.text, effects(c.name, pe.name.text));
        const fm = pe.expression
          .getText()
          .replace(/[?!]/g, '')
          .match(/^this\.(\w+)$/);
        if (fm)
          for (const t of targets(c, fm[1], pe.name.text))
            rec(fm[1] + '.' + pe.name.text + ' -> ' + t, effects(t, pe.name.text));
      }
    }
    ts.forEachChild(n, v);
  };
  for (const m of c.methods.values()) v(m.body);
}
const uniq = new Map();
for (const r of rows) uniq.set(r.file + ':' + r.line + r.call, r);
for (const r of [...uniq.values()].sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line)))
  console.log([r.file, r.line, r.method, r.call, r.eff.slice(0, 3).join(' ; ')].join(' | '));
console.error('total', uniq.size);
