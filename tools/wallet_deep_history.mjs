export function run(input) {
  const obj = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const addr = alve.assertSolanaAddress(alve.pickAddress(input));

  let limit = Number.isFinite(obj.limit) ? Math.floor(obj.limit) : 1000;
  if (limit < 1) limit = 1;
  if (limit > 1000) limit = 1000;

  const full = obj.full === true;
  let maxPages = full ? (Number.isFinite(obj.maxPages) ? Math.floor(obj.maxPages) : 50) : 1;
  if (maxPages < 1) maxPages = 1;
  if (maxPages > 200) maxPages = 200;

  const until = (typeof obj.until === 'string' && obj.until) ? obj.until : undefined;
  let before = (typeof obj.before === 'string' && obj.before) ? obj.before : undefined;

  return (async () => {
    const signatures = [];
    let pages = 0;
    let hasMore = false;

    while (pages < maxPages) {
      const opts = { limit };
      if (before) opts.before = before;
      if (until) opts.until = until;

      const page = await alve.solanaRpc('getSignaturesForAddress', [addr, opts], obj.rpcUrl);
      pages++;

      if (!Array.isArray(page) || page.length === 0) { hasMore = false; break; }

      for (const s of page) signatures.push(s);
      before = page[page.length - 1].signature;

      if (page.length < limit) { hasMore = false; break; }
      hasMore = true;
    }

    const newest = signatures.length ? signatures[0] : null;
    const oldest = signatures.length ? signatures[signatures.length - 1] : null;

    return {
      address: addr,
      count: signatures.length,
      pagesFetched: pages,
      hasMore,
      nextBefore: hasMore ? before : null,
      newestSignature: newest ? newest.signature : null,
      oldestSignature: oldest ? oldest.signature : null,
      newestBlockTime: newest ? (newest.blockTime ?? null) : null,
      oldestBlockTime: oldest ? (oldest.blockTime ?? null) : null,
      signatures
    };
  })();
}
