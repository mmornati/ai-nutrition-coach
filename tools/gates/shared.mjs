// Shared plumbing for the release-posture gates (tools/check_*.mjs): which files count as
// shipped code, and TypeScript-compiler-API helpers. The gates read the PARSED program, never
// call-site text, so a comment, a string or a rename cannot hide (or fake) a violation.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** Source roots whose files ship to people (the PWA and the pure core). */
export const SHIPPED_ROOTS = ['apps/web/src', 'packages/core/src'];
/** Extra shipped files outside those roots (the service workers are copied into the bundle). */
export const SHIPPED_FILES = ['tools/pwa/sw.template.js', 'tools/pwa/sw.kill.js'];
/** Directories whose TOP-LEVEL scripts ship verbatim (classic scripts copied into the bundle, e.g. boot-guard.js). */
export const SHIPPED_PUBLIC_DIRS = ['apps/web/public'];

const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Repo-relative, `/`-separated. */
export const rel = (root, abs) => relative(root, abs).split(sep).join('/');

/** A test, fixture or declaration file: never shipped. */
export function isNonShipped(path) {
  return (
    TEST_FILE.test(path) ||
    path.endsWith('.d.ts') ||
    /(^|\/)(test|testing|__tests__|e2e|harness|node_modules|dist)\//.test(path)
  );
}

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

const RESOLVE_EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

/** The repo-relative file a relative specifier from `fromPath` resolves to (null when it does not). */
function resolveRelative(root, fromPath, spec) {
  const base = join(root, fromPath, '..', spec.split('?')[0]);
  const stems = [base, base.replace(/\.[cm]?jsx?$/, '')];
  for (const stem of stems) {
    for (const ext of RESOLVE_EXT) {
      const candidate = stem + ext;
      if (existsSync(candidate) && statSync(candidate).isFile()) return rel(root, candidate);
    }
  }
  return null;
}

/**
 * isNonShipped() skips `test/`, `testing/`, `__tests__/`, `e2e/` and `dist/` directories, so a
 * shipped file that IMPORTS from one would smuggle unscanned code into the bundle. Returns a
 * `{path, line, message}` for each value import (type-only imports are erased) of such a path.
 */
export function nonShippedImports(root) {
  const out = [];
  for (const path of shippedFiles(root)) {
    const sf = parse(path, readFileSync(join(root, path), 'utf8'));
    const check = (node, spec) => {
      if (spec === undefined || !spec.startsWith('.')) return;
      const resolved = resolveRelative(root, path, spec);
      const target = resolved ?? rel(root, join(root, path, '..', spec));
      if (resolved?.endsWith('.d.ts')) return;
      if (isNonShipped(target)) {
        out.push({ path, line: lineOf(sf, node), message: `shipped file imports ${target}, which the gates treat as non-shipped (test/e2e/dist code would reach the bundle unscanned)` });
      }
    };
    walkNodes(sf, (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const clause = n.importClause;
        const named = clause?.namedBindings;
        const typeOnly = !!clause && (clause.isTypeOnly || (!clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)));
        if (!typeOnly) check(n, n.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !n.isTypeOnly) {
        check(n, n.moduleSpecifier.text);
      } else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
        check(n, stringValue(n.arguments[0]));
      }
    });
  }
  return out;
}

/** Every shipped source file under `root` as repo-relative paths. */
export function shippedFiles(root, { extra = SHIPPED_FILES } = {}) {
  const found = [];
  for (const dir of SHIPPED_ROOTS) {
    const abs = join(root, dir);
    if (existsSync(abs)) walk(abs, found);
  }
  const paths = found.map((f) => rel(root, f)).filter((p) => SOURCE_EXT.test(p) && !isNonShipped(p));
  for (const file of extra) if (existsSync(join(root, file))) paths.push(file);
  for (const dir of SHIPPED_PUBLIC_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (SOURCE_EXT.test(name) && statSync(join(abs, name)).isFile()) paths.push(`${dir}/${name}`);
    }
  }
  return paths;
}

/** Every package.json in the repository, wherever it lives (node_modules, dist and .git excluded). */
export function packageJsonFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name === 'package.json') out.push(rel(root, full));
    }
  };
  visit(root);
  return out;
}

/** Dependency names declared in a package.json text (all kinds, overrides included). */
export function declaredDependencies(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const names = new Set();
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const n of Object.keys(json[key] ?? {})) names.add(n);
  }
  for (const key of ['overrides', 'resolutions']) {
    for (const n of Object.keys(json[key] ?? {})) names.add(n);
  }
  for (const n of Object.keys(json.pnpm?.overrides ?? {})) names.add(n);
  return [...names];
}

/** Parse source text into a TypeScript AST (JSX-aware for .tsx/.jsx; allowJs for scripts). */
export function parse(path, text) {
  const kind = /\.tsx$/.test(path)
    ? ts.ScriptKind.TSX
    : /\.jsx$/.test(path)
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}

/** 1-based line of a node's first token. */
export const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** Visit every node of a tree, depth first. */
export function walkNodes(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walkNodes(child, visit));
}

/** True when `node` sits inside a type position (erased at build time, never runs). */
export function inTypePosition(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return true;
    if (ts.isStatement(n) || ts.isExpression(n) || ts.isBlock(n)) return false;
  }
  return false;
}

/**
 * Whether an Identifier is a REFERENCE to a binding/global (an expression), as opposed to a
 * property name, a declaration name, an object-literal key, a label, an import/export specifier
 * or a type.
 */
export function isReference(id) {
  const p = id.parent;
  if (!p) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p)) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isShorthandPropertyAssignment(p) && p.name === id) return true; // `{ fetch }` reads the binding
  if (
    (ts.isPropertySignature(p) ||
      ts.isMethodSignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isGetAccessor(p) ||
      ts.isSetAccessor(p) ||
      ts.isEnumMember(p) ||
      ts.isBindingElement(p) && p.propertyName === id) &&
    p.name === id
  ) {
    return false;
  }
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isTypeParameterDeclaration(p) ||
      ts.isInterfaceDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isImportSpecifier(p) ||
      ts.isExportSpecifier(p) ||
      ts.isImportClause(p) ||
      ts.isNamespaceImport(p) ||
      ts.isNamespaceExport(p) ||
      ts.isLabeledStatement(p) ||
      ts.isBreakOrContinueStatement(p)) &&
    p.name === id
  ) {
    return false;
  }
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  if (ts.isJsxAttribute(p)) return false;
  return !inTypePosition(id);
}

/** Strip parentheses, `as`, `satisfies`, `!` and type assertions. */
export function unwrap(node) {
  let n = node;
  while (
    n &&
    (ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isSatisfiesExpression(n) ||
      ts.isTypeAssertionExpression(n))
  ) {
    n = n.expression;
  }
  return n;
}

/**
 * A constant string's text: a literal, a template without substitutions, or a concatenation /
 * template of constants (`'fe' + 'tch'` folds to `fetch`); else undefined.
 */
export function stringValue(node) {
  const n = unwrap(node);
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = stringValue(n.left);
    const b = stringValue(n.right);
    return a !== undefined && b !== undefined ? a + b : undefined;
  }
  if (ts.isTemplateExpression(n)) {
    let text = n.head.text;
    for (const span of n.templateSpans) {
      const v = stringValue(span.expression);
      if (v === undefined) return undefined;
      text += v + span.literal.text;
    }
    return text;
  }
  return undefined;
}

/** The literal text a (possibly non-constant) string expression starts with ('' when unknown). */
export function staticPrefix(node) {
  const n = unwrap(node);
  if (!n) return '';
  const whole = stringValue(n);
  if (whole !== undefined) return whole;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) return staticPrefix(n.left);
  if (ts.isTemplateExpression(n)) return n.head.text;
  return '';
}

/** Every literal fragment of a string expression, joined (what a `url(` could hide in). */
export function staticText(node) {
  const n = unwrap(node);
  if (!n) return '';
  const whole = stringValue(n);
  if (whole !== undefined) return whole;
  if (ts.isBinaryExpression(n)) return `${staticText(n.left)}${staticText(n.right)}`;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => s.literal.text).join('');
  return '';
}

/** The names that denote the global object. */
export const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

const GLOBAL_PROPS = new Set(['window', 'self', 'globalThis', 'global', 'top', 'frames']);

/**
 * Which names denote the global object ('g') or `navigator` ('n') in a file: the well-known names
 * plus every alias (`const g = globalThis`, `g = window.self`, `{ window: w } = globalThis`,
 * a parameter defaulting to one). `kindOf(expr)` answers 'g' | 'n' | undefined.
 */
export function globalRefs(sf) {
  const names = new Map([...GLOBAL_OBJECTS].map((n) => [n, 'g']));
  names.set('navigator', 'n');
  const kindOf = (expr) => {
    const e = unwrap(expr);
    if (!e) return undefined;
    if (ts.isIdentifier(e)) return names.get(e.text);
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
      if (kindOf(e.expression) !== 'g') return undefined;
      const key = ts.isPropertyAccessExpression(e) ? e.name.text : stringValue(e.argumentExpression);
      if (key === 'navigator') return 'n';
      return GLOBAL_PROPS.has(key) ? 'g' : undefined;
    }
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (k === ts.SyntaxKind.CommaToken) return kindOf(e.right);
      if (
        k === ts.SyntaxKind.BarBarToken ||
        k === ts.SyntaxKind.QuestionQuestionToken ||
        k === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        return kindOf(e.left) ?? kindOf(e.right);
      }
      return undefined;
    }
    if (ts.isConditionalExpression(e)) return kindOf(e.whenTrue) ?? kindOf(e.whenFalse);
    return undefined;
  };
  const bind = (name, kind) => {
    if (kind && !names.has(name)) {
      names.set(name, kind);
      return true;
    }
    return false;
  };
  for (let changed = true; changed; ) {
    changed = false;
    walkNodes(sf, (n) => {
      if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && n.initializer) {
        const kind = kindOf(n.initializer);
        if (ts.isIdentifier(n.name)) changed = bind(n.name.text, kind) || changed;
        else if (ts.isObjectBindingPattern(n.name) && kind === 'g') {
          for (const el of n.name.elements) {
            const key = (el.propertyName ?? el.name).text;
            if (ts.isIdentifier(el.name)) changed = bind(el.name.text, key === 'navigator' ? 'n' : GLOBAL_PROPS.has(key) ? 'g' : undefined) || changed;
          }
        }
      } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left)) {
        changed = bind(n.left.text, kindOf(n.right)) || changed;
      }
    });
  }
  return { kindOf, names };
}

/** Whether `spec` is a same-origin URL that cannot reach another host: `/x`, `./x`, `../x`, `#x`, `data:`, `blob:`, or empty. */
export function isRelativeUrl(spec) {
  if (spec === '') return true;
  if (/^(?:data|blob):/i.test(spec)) return true;
  if (spec.startsWith('#')) return true;
  if (spec.startsWith('./') || spec.startsWith('../')) return true;
  return spec.startsWith('/') && spec[1] !== '/' && spec[1] !== '\\';
}

/**
 * Whether an expression is provably a same-origin URL: a relative / data: / blob: literal (or a
 * template / concatenation that starts with one), `URL.createObjectURL(...)`, or a `const` of
 * this file bound to one.
 */
export function isSafeUrlExpr(expr, sf, seen = new Set()) {
  const e = unwrap(expr);
  if (!e) return false;
  const prefix = staticPrefix(e);
  const whole = stringValue(e);
  if (whole !== undefined) return isRelativeUrl(whole);
  if (prefix && (/^(?:data|blob):/i.test(prefix) || prefix.startsWith('#') || prefix.startsWith('./') || prefix.startsWith('../'))) return true;
  if (prefix.length >= 2 && prefix.startsWith('/') && prefix[1] !== '/' && prefix[1] !== '\\') return true;
  if (ts.isCallExpression(e)) {
    const c = unwrap(e.expression);
    return !!c && ts.isPropertyAccessExpression(c) && c.name.text === 'createObjectURL';
  }
  if (ts.isConditionalExpression(e)) return isSafeUrlExpr(e.whenTrue, sf, seen) && isSafeUrlExpr(e.whenFalse, sf, seen);
  if (ts.isIdentifier(e) && !seen.has(e.text)) {
    seen.add(e.text);
    const inits = [];
    let other = false;
    walkNodes(sf, (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text) {
        if (n.initializer && ts.isVariableDeclarationList(n.parent) && n.parent.flags & ts.NodeFlags.Const) inits.push(n.initializer);
        else other = true;
      } else if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.name.text === e.text) other = true;
      else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === e.text) other = true;
    });
    return !other && inits.length > 0 && inits.every((i) => isSafeUrlExpr(i, sf, seen));
  }
  return false;
}

export { ts, readFileSync };
