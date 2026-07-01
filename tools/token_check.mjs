export async function run(input) {
  const mint = alve.assertSolanaAddress(alve.pickAddress(input));
  const url = `https://api.dexscreener.com/tokens/v1/solana/${mint}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  } catch (e) {
    throw new Error(`DexScreener request failed: ${e.message}`);
  }
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const data = await res.json();
  const pairs = Array.isArray(data) ? data : (Array.isArray(data?.pairs) ? data.pairs : []);

  if (!pairs.length) {
    return { mint, score: 0, verdict: 'high risk', reason: 'No trading pairs found on DexScreener; token has no discoverable liquidity.', signals: { totalLiquidityUsd: 0, totalVolumeH24: 0, oldestPairAgeDays: null, pairCount: 0 } };
  }

  let totalLiquidity = 0;
  let totalVolume = 0;
  let oldestCreatedAt = null;
  for (const p of pairs) {
    const liq = Number(p?.liquidity?.usd);
    if (Number.isFinite(liq)) totalLiquidity += liq;
    const vol = Number(p?.volume?.h24);
    if (Number.isFinite(vol)) totalVolume += vol;
    const created = Number(p?.pairCreatedAt);
    if (Number.isFinite(created) && created > 0) {
      if (oldestCreatedAt === null || created < oldestCreatedAt) oldestCreatedAt = created;
    }
  }

  const ageMs = oldestCreatedAt === null ? null : Math.max(0, Date.now() - oldestCreatedAt);
  const ageDays = ageMs === null ? null : ageMs / 86400000;

  // Liquidity: 0-40
  let liqPts;
  if (totalLiquidity >= 100000) liqPts = 40;
  else if (totalLiquidity >= 50000) liqPts = 32;
  else if (totalLiquidity >= 10000) liqPts = 24;
  else if (totalLiquidity >= 1000) liqPts = 12;
  else if (totalLiquidity > 0) liqPts = 5;
  else liqPts = 0;

  // Volume h24: 0-25
  let volPts;
  if (totalVolume >= 100000) volPts = 25;
  else if (totalVolume >= 10000) volPts = 18;
  else if (totalVolume >= 1000) volPts = 10;
  else if (totalVolume > 0) volPts = 4;
  else volPts = 0;

  // Age: 0-25
  let agePts;
  if (ageDays === null) agePts = 0;
  else if (ageDays >= 180) agePts = 25;
  else if (ageDays >= 30) agePts = 18;
  else if (ageDays >= 7) agePts = 12;
  else if (ageDays >= 1) agePts = 6;
  else agePts = 2;

  // Pair count: 0-10
  let pairPts;
  const pc = pairs.length;
  if (pc >= 5) pairPts = 10;
  else if (pc >= 3) pairPts = 7;
  else if (pc >= 2) pairPts = 5;
  else pairPts = 3;

  const score = Math.max(0, Math.min(100, liqPts + volPts + agePts + pairPts));

  let verdict;
  if (score >= 70) verdict = 'looks safer';
  else if (score >= 45) verdict = 'mixed / caution';
  else verdict = 'high risk';

  const notes = [];
  notes.push(`liquidity $${Math.round(totalLiquidity).toLocaleString('en-US')}`);
  notes.push(`24h vol $${Math.round(totalVolume).toLocaleString('en-US')}`);
  notes.push(ageDays === null ? 'age unknown' : `oldest pair ~${ageDays < 1 ? Math.round(ageDays * 24) + 'h' : Math.round(ageDays) + 'd'} old`);
  notes.push(`${pc} pair${pc === 1 ? '' : 's'}`);
  const reason = `${verdict[0].toUpperCase()}${verdict.slice(1)}: ${notes.join(', ')}.`;

  return {
    mint,
    score,
    verdict,
    reason,
    signals: {
      totalLiquidityUsd: Math.round(totalLiquidity),
      totalVolumeH24: Math.round(totalVolume),
      oldestPairAgeDays: ageDays === null ? null : Math.round(ageDays * 100) / 100,
      pairCount: pc
    },
    breakdown: { liquidity: liqPts, volume: volPts, age: agePts, pairs: pairPts }
  };
}
