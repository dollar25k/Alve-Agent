export function run(input) {
  const mint = alve.assertSolanaAddress(alve.pickAddress(input));
  return (async () => {
    let res;
    try {
      res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) {
      throw new Error(`DexScreener request failed: ${e.message}`);
    }
    if (!res.ok) {
      throw new Error(`DexScreener returned HTTP ${res.status}`);
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON from DexScreener: ${e.message}`);
    }
    const pairs = Array.isArray(data) ? data : (Array.isArray(data && data.pairs) ? data.pairs : []);
    const priced = pairs.filter(p => p && p.priceUsd != null && !isNaN(Number(p.priceUsd)));
    if (priced.length === 0) {
      return { mint, priceUsd: null, found: false, message: `No trading pair with a USD price found for mint ${mint}` };
    }
    const liq = p => (p.liquidity && typeof p.liquidity.usd === 'number') ? p.liquidity.usd : 0;
    const best = priced.reduce((a, b) => liq(b) > liq(a) ? b : a);
    const priceUsd = Number(best.priceUsd);
    return {
      mint,
      priceUsd,
      found: true,
      symbol: best.baseToken && best.baseToken.symbol ? best.baseToken.symbol : null,
      dexId: best.dexId || null,
      pairAddress: best.pairAddress || null,
      liquidityUsd: liq(best),
      message: `${priceUsd} USD`
    };
  })();
}
