export function run(input) {
  return (async () => {
    // --- resolve & validate mint (tolerate string or object shapes) ---
    let mint, topN = 10, full = false;
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      if (input.topN != null) topN = input.topN;
      full = input.full === true;
      mint = input.mint != null ? input.mint : alve.pickAddress(input);
    } else {
      mint = alve.pickAddress(input);
    }
    if (!mint || typeof mint !== 'string') throw new Error('missing mint address');
    alve.assertSolanaAddress(mint);

    topN = Math.floor(Number(topN));
    if (!Number.isFinite(topN) || topN < 1) topN = 10;
    if (topN > 100) topN = 100;

    // --- total supply via standard RPC (cheap, works on default endpoint) ---
    const supplyRes = await alve.solanaRpc('getTokenSupply', [mint]);
    const supplyVal = supplyRes && supplyRes.value;
    if (!supplyVal || supplyVal.amount == null) throw new Error('could not read token supply for mint ' + mint);
    const totalSupplyRaw = Number(supplyVal.amount);
    const decimals = Number(supplyVal.decimals);
    if (!(totalSupplyRaw > 0)) throw new Error('token has zero supply, cannot compute distribution');

    // --- full holder enumeration requires a dedicated indexer (Helius DAS) ---
    const key = process.env.HELIUS_API_KEY;
    if (!key) throw new Error('missing env HELIUS_API_KEY');
    const endpoint = 'https://mainnet.helius-rpc.com/?api-key=' + key;

    const owners = new Map(); // owner -> raw amount (as BigInt-safe number)
    const limit = 1000;
    let page = 1;
    let scannedAccounts = 0;
    let truncated = false;
    const maxPages = full ? 500 : 12;            // page cap
    const deadline = Date.now() + (full ? 60000 : 20000); // time budget

    while (page <= maxPages) {
      if (Date.now() > deadline) { truncated = true; break; }
      const body = {
        jsonrpc: '2.0',
        id: 'holders-' + page,
        method: 'getTokenAccounts',
        params: { mint, page, limit, options: { showZeroBalance: false } }
      };
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) throw new Error('Helius getTokenAccounts failed: HTTP ' + resp.status);
      const j = await resp.json();
      if (j.error) throw new Error('Helius RPC error: ' + (j.error.message || JSON.stringify(j.error)));
      const accounts = (j.result && j.result.token_accounts) || [];
      if (accounts.length === 0) break;
      for (const a of accounts) {
        const owner = a.owner;
        const amt = Number(a.amount || 0);
        if (!owner || !(amt > 0)) continue;
        owners.set(owner, (owners.get(owner) || 0) + amt);
      }
      scannedAccounts += accounts.length;
      if (accounts.length < limit) break;
      page++;
      if (page > maxPages) { truncated = true; }
    }

    const sorted = [...owners.entries()].sort((a, b) => b[1] - a[1]);
    const round = (n) => Math.round(n * 1e6) / 1e6;
    const topHolders = sorted.slice(0, topN).map(([address, raw]) => ({
      address,
      amount: raw / Math.pow(10, decimals),
      pct: round((raw / totalSupplyRaw) * 100)
    }));
    const concentrationPct = round(topHolders.reduce((s, h) => s + (h.pct || 0), 0));

    return {
      mint,
      decimals,
      totalSupply: totalSupplyRaw / Math.pow(10, decimals),
      holderCount: owners.size,
      scannedAccounts,
      truncated,
      topHolders,
      concentrationPct
    };
  })();
}
