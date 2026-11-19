// Babillard's own lint rules: an oxlint JS plugin (`.oxlintrc.json` « jsPlugins »), review #41.
//
// Each rule here used to be a vitest « grep guard » that read the source with a regex and kept an
// ALLOWED map of files. A regex is fooled by formatting and comments (STATE.md §5: one reported
// green over the very defect it was written for), and every guard grew its own idea of what a
// comment is. These run on the AST instead. An exemption is an inline directive with its reason:
//   // oxlint-disable-next-line babillard/<rule> -- <why this site is right>
// lint-disable-rule.test.ts requires that reason, and `--report-unused-disable-directives`
// (package.json « lint ») fails a directive whose violation is gone, the way a stale ALLOWED
// entry used to.
//
// Rules that encode something only this repo knows (calm-tenets, write-rule, csrfExempt…) stay
// tests: they read migrations, route tables and call graphs, not one node at a time.

// Look through `x!`, `x as T` and `(x)` to the expression underneath.
function unwrap(node) {
  let n = node
  while (n && (n.type === 'TSNonNullExpression' || n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'ParenthesizedExpression')) n = n.expression
  return n
}
const propName = (m) => (m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier' ? m.property.name : null)
const isIdent = (n, name) => n && n.type === 'Identifier' && n.name === name

const rule = (description, create) => ({ meta: { type: 'problem', docs: { description } }, create })

export default {
  meta: { name: 'babillard' },
  rules: {
    // THE FORMATTER RULE. Constructing an Intl formatter costs ~100 µs, a thousand times the
    // .format() it enables. /api/year burned 1.8 s of Worker CPU (budget ≈ 10 ms) building two
    // per day of the year, and lib/format.ts rebuilt one per list row on a cheap wall tablet
    // (both 2026-09-03). The fix is always one cached formatter per (locale, shape), in a
    // formatter home: lib/format.ts, lib/money.ts, shared/localDay.ts, _lib/askContext.ts.
    'no-intl-construction': rule('Intl formatters are constructed only in a cached formatter home', (context) => ({
      NewExpression(node) {
        const c = unwrap(node.callee)
        if (c && c.type === 'MemberExpression' && isIdent(unwrap(c.object), 'Intl'))
          context.report({ node, message: 'Use a cached helper (lib/format.ts, lib/money.ts, shared/localDay.ts, _lib/askContext.ts). A new shape gets a new cached helper THERE.' })
      },
    })),

    // THE IMAGE RULE. A bare <img> gets one shot at its bytes; when it fails (a bar of signal,
    // iOS cancelling requests as the PWA backgrounds, the SW's synthetic 504) it sits empty for
    // the session. The board « Dessins » tiles came back « clear » on 2026-10-30. <Img>
    // (components/Img.tsx) retries with backoff, re-asks on reconnection/foregrounding, and
    // sets data-loaded for a shape-reserving placeholder.
    'no-raw-img': rule('A picture is <Img>, never a bare <img>', (context) => ({
      JSXOpeningElement(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'img')
          context.report({ node, message: 'Use <Img> (components/Img.tsx): same props, plus retry and data-loaded. If a site truly cannot, EXTEND the primitive.' })
      },
    })),

    // THE FETCH RULE. lib/api.ts is the one door to /api/*: it attaches the CSRF echo, the
    // device token, X-Lang, X-Profile and credentials, and reads X-AI-Error into the toast. A bare
    // fetch loses whichever of those the next reader forgets, silently. `fetch(imgUrl(key))` is
    // allowed by SHAPE: /api/img/<key> is an unauthenticated blob read (the key is the capability).
    'no-bare-fetch': rule('An /api/* call goes through lib/api.ts, never a bare fetch', (context) => ({
      CallExpression(node) {
        const c = unwrap(node.callee)
        const global = isIdent(c, 'fetch') || (propName(c) === 'fetch' && ['window', 'globalThis', 'self'].some((g) => isIdent(unwrap(c.object), g)))
        if (!global) return
        const arg = node.arguments[0] && unwrap(node.arguments[0])
        if (arg && arg.type === 'CallExpression' && isIdent(unwrap(arg.callee), 'imgUrl')) return
        context.report({ node, message: 'Use api() (reads) or useWrite() (writes); a blob read is fetch(imgUrl(key)).' })
      },
    })),

    // NO ANONYMOUS SWALLOW. ~100 call sites wrote `.catch(() => {})` on their writes, so a real
    // server refusal reverted the optimistic row with not a word said (« I swipe it and it comes
    // back », 2026-10-06). A write's rejection goes to writeFailed, or wrote()/writeOrNull() when
    // a follow-up depends on it. A body holding a COMMENT is a documented swallow and passes: the
    // reason sits where it is needed.
    'no-anonymous-catch': rule('A rejection is reported (writeFailed), never swallowed anonymously', (context) => ({
      CallExpression(node) {
        const c = unwrap(node.callee)
        if (propName(c) !== 'catch' || node.arguments.length !== 1) return
        const fn = unwrap(node.arguments[0])
        if (!fn || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') || fn.params.length > 1) return
        const b = fn.body
        const empty =
          (b.type === 'BlockStatement' && b.body.length === 0 && !/\/[/*]/.test(context.sourceCode.getText(b))) ||
          (b.type === 'Literal' && b.value === null) ||
          isIdent(b, 'undefined') ||
          (b.type === 'UnaryExpression' && b.operator === 'void')
        // Reported on the `.catch` itself, so a disable sits on the line above it.
        if (empty) context.report({ node: c.property, message: 'Use .catch(writeFailed), or wrote()/writeOrNull(). If it truly is not a server write, say why in the body or in a disable reason.' })
      },
    })),

    // THE METER HAS TO BE UNAVOIDABLE. Workers AI calls, R2 upload bytes and Browser Run minutes
    // cost money per use; each has ONE metered door that charges the household's daily budget
    // (_lib/usage.ts): runModel(), uploadR2Media()/putR2Blob(), renderPage(). A raw call spends
    // what nothing counted, and looks perfectly reviewable.
    'metered-door': rule('Metered resources are reached only through their metered door', (context) => ({
      CallExpression(node) {
        const c = unwrap(node.callee)
        const prop = propName(c)
        const obj = c && c.type === 'MemberExpression' ? unwrap(c.object) : null
        if (prop === 'run' && obj && (isIdent(obj, 'AI') || propName(obj) === 'AI'))
          context.report({ node, message: 'Call runModel(env, model, input): it charges the daily AI budget.' })
        else if (prop === 'put' && obj && (isIdent(obj, 'bucket') || isIdent(obj, 'PHOTOS') || propName(obj) === 'PHOTOS'))
          context.report({ node, message: 'Go through uploadR2Media()/putR2Blob() in _lib/r2.ts: it charges the daily byte budget.' })
        else if (isIdent(c, 'quickAction') || prop === 'quickAction')
          context.report({ node, message: 'Call renderPage(env, url): it charges the browser budget.' })
      },
    })),
  },
}
