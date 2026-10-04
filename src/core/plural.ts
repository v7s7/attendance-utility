// Text with counts in proper Arabic (and English): "{n, plural, one {يوم واحد} two {يومان}
// few {# أيام} many {# يوماً} other {# يوم}}" picks the form for n and puts n where # is.
// The forms are the language's plural categories: zero, one, two, few, many, other, or an
// exact number such as =0.

const rulesCache = new Map<string, Intl.PluralRules>();

function category(lang: string, n: number): string {
  let rules = rulesCache.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    rulesCache.set(lang, rules);
  }
  return rules.select(n);
}

/** The text between a "{" at `open` and its matching "}" (exclusive), and where it ends. */
function block(text: string, open: number): { body: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
  }
  return null;
}

export function formatPlurals(text: string, lang: string, vars: Record<string, string | number>): string {
  const start = /\{(\w+), plural,/g;
  let out = "";
  let from = 0;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    const whole = block(text, m.index);
    if (!whole) break;
    const n = Number(vars[m[1]]);

    // The forms: "one {…} two {…} …" after "name, plural,"
    const forms: Record<string, string> = {};
    let rest = whole.body.slice(m[0].length - 1);
    for (let key = /^\s*(=\d+|\w+)\s*\{/.exec(rest); key; key = /^\s*(=\d+|\w+)\s*\{/.exec(rest)) {
      const form = block(rest, key[0].length - 1);
      if (!form) break;
      forms[key[1]] = form.body;
      rest = rest.slice(form.end);
    }

    const chosen = forms[`=${n}`] ?? forms[category(lang, n)] ?? forms.other ?? "";
    out += text.slice(from, m.index) + chosen.split("#").join(String(n));
    from = whole.end;
    start.lastIndex = whole.end;
  }
  return out + text.slice(from);
}
