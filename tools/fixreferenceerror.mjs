export function run(input) {
  const extractCode = (inp) => {
    if (typeof inp === 'string') return inp;
    if (inp && typeof inp === 'object' && !Array.isArray(inp)) {
      if (typeof inp.code === 'string') return inp.code;
      if (typeof inp.source === 'string') return inp.source;
    }
    return inp;
  };

  const src = extractCode(input);
  if (typeof src !== 'string' || src.trim() === '') {
    throw new Error('input must be non-empty JavaScript source code as a string, or { code: string }');
  }

  const opts = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  if (opts.binding !== undefined && typeof opts.binding !== 'string') {
    throw new Error('binding must be a string expression when provided');
  }
  const binding = (typeof opts.binding === 'string' && opts.binding.trim())
    ? opts.binding.trim()
    : "(typeof globalThis!=='undefined'&&globalThis.alve)?globalThis.alve:(()=>{throw new Error('alve global is not available in this runtime')})()";

  const referenced = /\balve\b/.test(src);
  const alreadyDefined = /(?:^|[^.\w$])(?:const|let|var|function|class)\s+alve\b|import[^;\n]*\balve\b/.test(src);

  if (!referenced) {
    return { code: src, changed: false, referenced: false, alreadyDefined, reason: "identifier 'alve' is not referenced; nothing to fix" };
  }
  if (alreadyDefined) {
    return { code: src, changed: false, referenced: true, alreadyDefined: true, reason: "identifier 'alve' is already defined; no ReferenceError expected" };
  }

  const header = 'const alve = ' + binding + ';';
  let fixed;
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n');
    fixed = nl === -1 ? src + '\n' + header : src.slice(0, nl + 1) + header + '\n' + src.slice(nl + 1);
  } else {
    fixed = header + '\n' + src;
  }

  return {
    code: fixed,
    changed: true,
    referenced: true,
    alreadyDefined: false,
    inserted: header,
    reason: "defined 'alve' by binding it to the vetted global so 'alve is not defined' no longer throws"
  };
}
