export async function run(input) {
  const A = globalThis.alve;
  if (!A || !A.pickAddress) throw new Error('alve global unavailable');
  if (input === null || input === undefined) throw new Error('input required: { wallet, mint }');

  let raw, mint, full = false;
  if (typeof input === 'string') {
    raw = input;
  } else if (typeof input === 'object') {
    raw = input.wallet ?? input.address ?? input.owner ?? input.account ?? input;
    mint = input.mint ?? input.token ?? input.tokenMint ?? input.tokenAddress;
    full = !!(input.full || input.all || input.complete);
  } else {
    throw new Error('input must be a string or object { wallet, mint }');
  }

  const wallet = A.assertSolanaAddress(A.pickAddress(raw));

  if (!mint || typeof mint !== 'string') throw new Error('missing token mint (pass { wallet, mint })');
  const sym = mint.trim().toUpperCase();
  if (A.tokens && A.tokens[sym]) mint = A.tokens[sym];
  A.assertSolanaAddress(mint);

  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('missing env HELIUS_API_KEY');

  const maxPages = full ? 25 : 4;
  const txs = [];
  let before;
  for (let i = 0; i < maxPages; i++) {
    let url = 'https://api.helius.xyz/v0/addresses/' + wallet + '/transactions?api-key=' + key + '&limit=100';
    if (before) url += '&before=' + before;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('helius transactions HTTP ' + res.status);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    txs.push(...page);
    before = page[page.length - 1].signature;
    if (page.length < 100) break;
  }

  txs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let qty = 0, costSol = 0, realizedSol = 0, buys = 0, sells = 0, decimals = null;

  for (const tx of txs) {
    const ad = (tx.accountData || []).find(a => a.account === wallet);
    if (!ad) continue;
    let tokenDelta = 0;
    for (const tc of ad.tokenBalanceChanges || []) {
      if (tc.mint === mint && tc.rawTokenAmount) {
        const d = Number(tc.rawTokenAmount.decimals);
        if (Number.isFinite(d)) decimals = d;
        tokenDelta += Number(tc.rawTokenAmount.tokenAmount) / Math.pow(10, d);
      }
    }
    if (!tokenDelta) continue;
    const solDelta = (ad.nativeBalanceChange || 0) / 1e9;
    if (tokenDelta > 0) {
      buys++;
      qty += tokenDelta;
      costSol += Math.max(0, -solDelta);
    } else {
      sells++;
      const soldQty = -tokenDelta;
      const proceeds = Math.max(0, solDelta);
      const avg = qty > 0 ? costSol / qty : 0;
      const basis = avg * Math.min(soldQty, qty);
      realizedSol += proceeds - basis;
      qty = Math.max(0, qty - soldQty);
      costSol = Math.max(0, costSol - basis);
    }
  }

  let currentBalance = 0;
  try {
    const r = await A.solanaRpc('getTokenAccountsByOwner', [wallet, { mint }, { encoding: 'jsonParsed' }]);
    for (const acc of (r && r.value) || []) {
      const ta = acc.account && acc.account.data && acc.account.data.parsed && acc.account.data.parsed.info && acc.account.data.parsed.info.tokenAmount;
      if (ta && Number.isFinite(ta.uiAmount)) currentBalance += ta.uiAmount;
    }
  } catch (e) {}

  let solPriceUsd = null, tokenPriceUsd = null;
  try {
    const ids = mint + ',' + A.tokens.SOL;
    const pr = await fetch('https://api.jup.ag/price/v2?ids=' + ids, { signal: AbortSignal.timeout(8000) });
    if (pr.ok) {
      const pj = await pr.json();
      const d = pj.data || {};
      if (d[mint] && d[mint].price != null) tokenPriceUsd = Number(d[mint].price);
      if (d[A.tokens.SOL] && d[A.tokens.SOL].price != null) solPriceUsd = Number(d[A.tokens.SOL].price);
    }
  } catch (e) {}

  const avgCostSol = qty > 0 ? costSol / qty : 0;
  const holdingsCostSol = avgCostSol * currentBalance;
  const holdingsValueUsd = tokenPriceUsd != null ? tokenPriceUsd * currentBalance : null;
  let unrealizedSol = null;
  if (tokenPriceUsd != null && solPriceUsd) {
    unrealizedSol = currentBalance * (tokenPriceUsd / solPriceUsd) - holdingsCostSol;
  }
  const unrealizedUsd = unrealizedSol != null && solPriceUsd != null ? unrealizedSol * solPriceUsd : null;
  const realizedUsd = solPriceUsd != null ? realizedSol * solPriceUsd : null;
  const totalPnlUsd = realizedUsd != null && unrealizedUsd != null ? realizedUsd + unrealizedUsd : null;

  const round = (x, n = 6) => x == null || !Number.isFinite(x) ? (x == null ? null : x) : Math.round(x * Math.pow(10, n)) / Math.pow(10, n);

  return {
    wallet,
    mint,
    scanned: { transactions: txs.length, full },
    trades: { buys, sells, total: buys + sells },
    decimals,
    realized: { sol: round(realizedSol), usd: round(realizedUsd, 2) },
    unrealized: {
      currentBalance: round(currentBalance),
      avgCostSolPerToken: round(avgCostSol, 9),
      currentPriceUsd: tokenPriceUsd,
      holdingsValueUsd: round(holdingsValueUsd, 2),
      sol: round(unrealizedSol),
      usd: round(unrealizedUsd, 2)
    },
    totalPnlUsd: round(totalPnlUsd, 2),
    solPriceUsd,
    note: 'PnL uses SOL as quote currency from parsed swaps; USD conversion uses current prices (historical prices not applied), so figures are approximate.'
  };
}
