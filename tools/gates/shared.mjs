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

const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Repo-relative, `/`-separated. */
export const rel = (root, abs) => relative(root, abs).split(sep).join('/');

/** A test, fixture or declaration file: never shipped. */
export function isNonShipped(path) {
  return (
    TEST_FILE.test(path) ||
    path.endsWith('.d.ts') ||
    /(^|\/)(test|testing|__tests__|e2e|node_modules|dist)\//.test(path)
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

/** Every shipped source file under `root` as repo-relative paths. */
export function shippedFiles(root, { extra = SHIPPED_FILES } = {}) {
  const found = [];
  for (const dir of SHIPPED_ROOTS) {
    const abs = join(root, dir);
    if (existsSync(abs)) walk(abs, found);
  }
  const paths = found.map((f) => rel(root, f)).filter((p) => SOURCE_EXT.test(p) && !isNonShipped(p));
  for (const file of extra) if (existsSync(join(root, file))) paths.push(file);
  return paths;
}

/** Every package.json in the workspace (root, apps/*, packages/*). */
export function packageJsonFiles(root) {
  const out = [];
  if (existsSync(join(root, 'package.json'))) out.push('package.json');
  for (const group of ['apps', 'packages']) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name, 'package.json');
      if (existsSync(file)) out.push(rel(root, file));
    }
  }
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

/** A literal's text for string-like nodes, else undefined. */
export function stringValue(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

/** The names that denote the global object. */
export const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

export { ts, readFileSync };
