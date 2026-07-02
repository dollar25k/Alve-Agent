export async function run(input) {
  if (input === undefined || input === null || (typeof input === 'string' && input.trim() === '')) {
    throw new Error('input required: a Solana mint address (string) or { mint, includeHolders?, topN?, full? }');
  }
  const opts = (typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const includeHolders = opts.includeHolders === true || opts.full === true;
  const wantFull = opts.full === true;

  // Check indexer key early so callers get a clean error before any network work.
  if (includeHolders && !process.env.HELIUS_API_KEY) {
    throw new Error('missing env HELIUS_API_KEY');
  }

  const mint = alve.pickAddress(input);
  if (!mint) throw new Error('no Solana address found in input');
  alve.assertSolanaAddress(mint);

  let topN = 10;
  if (opts.topN !== undefined) {
    const n = Number(opts.topN);
    if (Number.isFinite(n)) topN = Math.max(1, Math.min(100, Math.floor(n)));
  }

  // --- 1. Mint account: authority + supply (cheap, default RPC) ---
  const acct = await alve.solanaRpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  if (!acct || !acct.value) throw new Error('mint account not found on-chain: ' + mint);
  const value = acct.value;
  const parsed = value.data && value.data.parsed;
  if (!parsed || parsed.type !== 'mint' || !parsed.info) {
    throw new Error('account is not an SPL token mint: ' + mint);
  }
  const info = parsed.info;
  const decimals = Number(info.decimals);
  const rawSupply = String(info.supply);
  const supplyBig = (() => { try { return BigInt(rawSupply); } catch { return 0n; } })();
  const factor = Math.pow(10, decimals);
  const program = value.owner;
  const isToken2022 = program === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

  const warnings = [];
  if (info.mintAuthority) warnings.push('MINT authority is active - total supply can still be increased (inflation risk).');
  if (info.freezeAuthority) warnings.push('FREEZE authority is active - token accounts can be frozen by the authority.');

  const result = {
    mint,
    program,
    isToken2022,
    decimals,
    rawSupply,
    supply: Number(rawSupply) / factor,
    authority: {
      mintAuthority: info.mintAuthority || null,
      freezeAuthority: info.freezeAuthority || null,
      mintAuthorityRenounced: !info.mintAuthority,
      freezeAuthorityRenounced: !info.freezeAuthority
    },
    warnings,
    checkedAt: new Date().toISOString()
  };

  if (!includeHolders) {
    result.holderAnalysis = { skipped: true, note: 'pass { mint, includeHolders: true } to scan holders + LP burn (needs HELIUS_API_KEY). add full:true for a deep scan.' };
    return result;
  }

  // --- 2. Holder distribution + LP burn (expensive full-scan via Helius) ---
  const BURN_ADDRESSES = ['1nc1nerator11111111111111111111111111111111'];
  const endpoint = 'https://mainnet.helius-rpc.com/?api-key=' + process.env.HELIUS_API_KEY;
  const owners = new Map();
  let cursor;
  let pages = 0;
  const maxPages = wantFull ? 50 : 5;

  while (pages < maxPages) {
    const params = { mint, limit: 1000, options: { showZeroBalance: false } };
    if (cursor) params.cursor = cursor;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'kiro', method: 'getTokenAccounts', params }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error('Helius getTokenAccounts HTTP ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error('Helius error: ' + (json.error.message || JSON.stringify(json.error)));
    const list = (json.result && json.result.token_accounts) || [];
    for (const ta of list) {
      if (!ta || !ta.owner) continue;
      let amt = 0n;
      try { amt = BigInt(ta.amount || '0'); } catch { amt = 0n; }
      owners.set(ta.owner, (owners.get(ta.owner) || 0n) + amt);
    }
    pages++;
    cursor = json.result && json.result.cursor;
    if (list.length === 0 || !cursor) break;
  }
  const complete = !cursor;

  const pct = (amt) => supplyBig > 0n ? Number((amt * 1000000n) / supplyBig) / 10000 : 0;

  const holders = [...owners.entries()].map(([owner, amt]) => ({
    owner,
    amount: Number(amt) / factor,
    pct: pct(amt),
    burn: BURN_ADDRESSES.includes(owner)
  })).sort((a, b) => (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0));

  let burnedRaw = 0n;
  for (const [owner, amt] of owners.entries()) {
    if (BURN_ADDRESSES.includes(owner)) burnedRaw += amt;
  }

  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  if (holders[0] && holders[0].pct >= 50 && !holders[0].burn) {
    warnings.push('Single holder controls >=50% of supply - high concentration / rug risk.');
  }

  result.holderAnalysis = {
    totalHolderAccounts: owners.size,
    scanComplete: complete,
    pagesScanned: pages,
    burnedToIncinerator: Number(burnedRaw) / factor,
    burnedPct: pct(burnedRaw),
    lpBurnNote: burnedRaw > 0n
      ? 'Balance found at the incinerator burn address. If this mint is the LP token, this indicates a burned LP position.'
      : 'No balance at the known incinerator burn address. Locked LP via a locker program is NOT detected here - verify the pool separately.',
    top1Pct: holders[0] ? holders[0].pct : 0,
    top10Pct: Math.round(top10 * 10000) / 10000,
    topHolders: holders.slice(0, topN)
  };
  return result;
}
