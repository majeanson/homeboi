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

// Every string a JSX attribute value can hold: a literal, the static parts of a template, and
// the literals anywhere inside an expression (`'chip' + (on ? ' is-on' : '')`).
function stringsIn(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'Literal' && typeof node.value === 'string') out.push(node.value)
  else if (node.type === 'TemplateElement') out.push(node.value.cooked ?? node.value.raw)
  for (const k of Object.keys(node)) {
    if (k === 'parent' || k === 'loc' || k === 'range') continue
    const v = node[k]
    if (Array.isArray(v)) v.forEach((c) => stringsIn(c, out))
    else if (v && typeof v === 'object' && typeof v.type === 'string') stringsIn(v, out)
  }
  return out
}
const attrName = (a) => (a.name.type === 'JSXIdentifier' ? a.name.name : null)
const LENS_VALUES = new Set(['parent', 'toddler', 'simple'])
const BAD_LENS_NAMES = new Set(['kid', 'isToddler'])
const SIZE_PROPS = new Set(['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight'])
const SCREEN_PROPS = new Set(['width', 'height', 'availWidth', 'availHeight'])
// QueryClient methods that take a key (or filters holding one) as their first argument.
const QUERY_CLIENT_METHODS = new Set([
  'setQueryData', 'getQueryData', 'getQueryState', 'setQueriesData', 'getQueriesData', 'removeQueries', 'cancelQueries',
  'invalidateQueries', 'refetchQueries', 'resetQueries', 'ensureQueryData', 'prefetchQuery', 'fetchQuery',
])

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

    // THE CHIP RULE. components/Chip.tsx is THE chip, and `.chip` is its markup: spelling the
    // class by hand makes a second chip, which drifts on the part you cannot see (the 2026-09-08
    // audit found 18; ten action chips announced themselves as unpressed toggles). Chip carries
    // all five shapes (selected · onClick · to · neither · expanded); a call site that does not
    // fit EXTENDS it. Only the bare token: `chip--toggle`, `cnote__chip` are other classes.
    'no-chip-class': rule('The .chip class belongs to Chip.tsx', (context) => ({
      JSXAttribute(node) {
        if (attrName(node) !== 'className' || !node.value) return
        if (stringsIn(node.value).some((s) => s.trim().split(/\s+/).includes('chip')))
          context.report({ node, message: 'Use <Chip> (selected = toggle · onClick = action · to = link · neither = label · expanded = unfolds). If it does not fit, EXTEND Chip.' })
      },
    })),

    // THE TIME RULE (review #11, 2026-11-17). A native <input type="time"> draws the BROWSER
    // locale's clock: a Québec household on an English Chrome read « 08:00 AM » in a French app.
    // No attribute fixes it; a time of day is components/TimeField.tsx (24-hour).
    'no-native-time-input': rule('A time of day is <TimeField>, never <input type="time">', (context) => ({
      JSXAttribute(node) {
        if (attrName(node) === 'type' && node.value && stringsIn(node.value).includes('time'))
          context.report({ node, message: 'Use <TimeField> (components/TimeField.tsx): same « HH:MM » value, always 24-hour.' })
      },
    })),

    // THE LENS RULE (2026-11-05). lib/audience.ts useLens() is the ONE place that says what each
    // audience may see and do (toddler/simple/parent to pick a view; teaches, interrupts, acts,
    // spoken). Before it, 46 sites compared `audience === '…'` themselves and the `simple` lens
    // was gated by accident. A surface reads a flag and thereby NAMES what it gates. The flag is
    // spelled `toddler`, never `kid` or `isToddler`.
    'lens-flag': rule('Read a useLens() flag, never compare the audience string', (context) => ({
      BinaryExpression(node) {
        if (node.operator !== '===' && node.operator !== '!==') return
        const isAudience = (n) => {
          const u = unwrap(n)
          return isIdent(u, 'audience') || propName(u) === 'audience'
        }
        const isLensValue = (n) => n.type === 'Literal' && LENS_VALUES.has(n.value)
        if ((isAudience(node.left) && isLensValue(node.right)) || (isLensValue(node.left) && isAudience(node.right)))
          context.report({ node, message: 'Pick the flag: toddler/simple/parent for a VIEW; teaches (help), interrupts (an uninvited prompt), acts (an edit/share door), spoken (tap-to-hear).' })
      },
      JSXAttribute(node) {
        if (BAD_LENS_NAMES.has(attrName(node))) context.report({ node, message: 'The lens flag is spelled `toddler`.' })
      },
      TSPropertySignature(node) {
        if (node.key.type === 'Identifier' && BAD_LENS_NAMES.has(node.key.name)) context.report({ node, message: 'The lens flag is spelled `toddler`.' })
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && BAD_LENS_NAMES.has(node.id.name) && node.init && /\baudience\b/.test(context.sourceCode.getText(node.init)))
          context.report({ node, message: 'The lens flag is spelled `toddler`.' })
      },
    })),

    // THE SURFACE RULE. What a screen SHOWS follows the device's role (lib/surface) and the lens
    // (lib/audience), plus CSS for layout. A wall tablet in portrait is as narrow as a big phone;
    // a component that reads the window width to decide what to render gets it wrong on exactly
    // the cheap kiosk this app is for. A preference query (`matchMedia('(prefers-…)')`,
    // `'(display-mode: …)'`) asks a setting, not a size, and passes. Positioning math (keep a
    // bubble on screen) is the usual reason for a disable.
    'no-viewport-size': rule('What renders follows surface/lens, never the window width', (context) => {
      const report = (node) =>
        context.report({ node, message: 'Pick what renders from useSurface()/useLens() and lay it out with CSS. Positioning math or a deliberate content-amount choice takes a disable with its reason.' })
      return {
        MemberExpression(node) {
          const p = propName(node)
          if (p && SIZE_PROPS.has(p)) report(node)
          else if (p && SCREEN_PROPS.has(p) && isIdent(unwrap(node.object), 'screen')) report(node)
        },
        CallExpression(node) {
          const c = unwrap(node.callee)
          if (!(isIdent(c, 'matchMedia') || propName(c) === 'matchMedia')) return
          const a = node.arguments[0] && unwrap(node.arguments[0])
          const q = a && a.type === 'Literal' && typeof a.value === 'string' ? a.value : a && a.type === 'TemplateLiteral' && a.expressions.length === 0 ? a.quasis[0].value.cooked : null
          if (q !== null && /^\(\s*(prefers-|display-mode)/.test(q.trim())) return
          report(node)
        },
      }
    }),

    // THE QUERY-KEY RULE. A key is a NAME declared once (lib/queryKeys.ts, or a file-level
    // `const X_KEY = ['…']` beside its reader) and derived from (`[...X_KEY, id]`). A literal at
    // the call site is the second spelling waiting to happen; on 2026-11-16 three of eight
    // already were (LegalPage's ['health'], DealsBrowser's ['flyers', day], HouseDiary's
    // ['chores-ledger']). keyShape.test.ts is the sibling that groups keys by value.
    'no-inline-query-key': rule('A query key is a declared name, never a literal at the call site', (context) => {
      const literalKey = (n) => {
        const a = n && unwrap(n)
        const first = a && a.type === 'ArrayExpression' ? a.elements[0] : null
        return !!first && ((first.type === 'Literal' && typeof first.value === 'string') || first.type === 'TemplateLiteral')
      }
      const message = "Declare the key (lib/queryKeys.ts, or a file-level const X_KEY = ['…']) and use the name, or derive from it: [...X_KEY, id]. Grep the value first."
      return {
        Property(node) {
          if (!node.computed && ((node.key.type === 'Identifier' && node.key.name === 'queryKey') || (node.key.type === 'Literal' && node.key.value === 'queryKey')) && literalKey(node.value))
            context.report({ node, message })
        },
        CallExpression(node) {
          if (QUERY_CLIENT_METHODS.has(propName(unwrap(node.callee))) && literalKey(node.arguments[0])) context.report({ node, message })
        },
      }
    }),

    // THE OVERLAY RULE (2026-11-05). Three shells own dialog behaviour (Modal, Sheet, confirm),
    // and useModal gives them Escape, the scroll lock, the focus trap and the phone's back
    // button. A role="dialog" spelled elsewhere promises behaviour the element may not keep
    // (AmbientScreen had the role and none of it; the AI-error toast called itself an
    // alertdialog and trapped nothing), and a useModal( call outside the shells is a fourth
    // shell growing. A routed full-screen scene is a legitimate exception, with its reason.
    'dialog-shell': rule('A dialog is <Modal>/<Sheet>/confirm; anything else says why', (context) => ({
      JSXAttribute(node) {
        if (attrName(node) === 'role' && node.value && stringsIn(node.value).some((s) => s === 'dialog' || s === 'alertdialog'))
          context.report({ node, message: 'Use <Modal> or <Sheet>. A routed scene or a lightbox that must be its own dialog takes a disable with the reason.' })
      },
      CallExpression(node) {
        if (isIdent(unwrap(node.callee), 'useModal'))
          context.report({ node, message: 'useModal is the shells’ hook (Modal, Sheet, confirm). A routed scene or lightbox that needs it takes a disable with the reason.' })
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
