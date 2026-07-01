export async function run(input) {
  const cfg = normalize(input);
  if (cfg.mode === 'trade') return await executeTrade(cfg);
  if (cfg.mode === 'scan') return await scan(cfg);
  return await analyze(cfg);
}

function num(v, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  if (!isFinite(n)) throw new Error('invalid number: ' + v);
  return n;
}
function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

function normalize(input) {
  const d = { mode:'analyze', minMarketCapUsd:0, maxMarketCapUsd:null, maxAgeMinutes:null, requireSocials:false, excludeMigrated:true, limit:50, topN:10 };
  if (input === undefined || input === null || input === '')
    throw new Error('input required: a pump.fun mint address (string) or a config object');
  if (typeof input === 'string')
    return { ...d, mode:'analyze', mint: alve.assertSolanaAddress(alve.pickAddress(input)) };
  if (typeof input !== 'object')
    throw new Error('input must be a mint address string or a config object');

  const cfg = { ...d };
  const action = typeof input.action === 'string' ? input.action.toLowerCase() : null;
  if (action === 'buy' || action === 'sell') cfg.mode = 'trade';
  else if (input.mode === 'scan' || input.scan === true) cfg.mode = 'scan';
  else cfg.mode = 'analyze';

  if (cfg.mode !== 'scan') cfg.mint = alve.assertSolanaAddress(alve.pickAddress(input));

  if (input.minMarketCapUsd !== undefined) cfg.minMarketCapUsd = num(input.minMarketCapUsd, 0);
  if (input.maxMarketCapUsd !== undefined) cfg.maxMarketCapUsd = num(input.maxMarketCapUsd, null);
  if (input.maxAgeMinutes !== undefined) cfg.maxAgeMinutes = num(input.maxAgeMinutes, null);
  if (input.requireSocials !== undefined) cfg.requireSocials = !!input.requireSocials;
  if (input.excludeMigrated !== undefined) cfg.excludeMigrated = !!input.excludeMigrated;
  if (input.limit !== undefined) cfg.limit = Math.max(1, Math.min(100, Math.floor(num(input.limit, 50))));
  if (input.topN !== undefined) cfg.topN = Math.max(1, Math.min(50, Math.floor(num(input.topN, 10))));

  if (cfg.mode === 'trade') {
    cfg.action = action;
    cfg.denominatedInSol = input.denominatedInSol !== undefined ? !!input.denominatedInSol : (action === 'buy');
    cfg.amount = num(input.amount !== undefined ? input.amount : input.amountSol, null);
    if (cfg.amount === null || !(cfg.amount > 0))
      throw new Error('trade requires a positive "amount" (SOL for buy, token amount for sell)');
    cfg.slippage = num(input.slippage, 10);
    cfg.priorityFee = num(input.priorityFee, 0.00005);
    cfg.pool = typeof input.pool === 'string' ? input.pool : 'pump';
  }
  return cfg;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0 (sol-sniper)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('pump.fun API error: HTTP ' + res.status + ' for ' + url);
  return await res.json();
}

function evaluate(coin, cfg) {
  const now = Date.now();
  const created = Number(coin.created_timestamp) || null;
  const ageMinutes = created ? round((now - created) / 60000, 2) : null;
  const mcUsd = (coin.usd_market_cap != null) ? round(Number(coin.usd_market_cap), 2) : null;
  const socials = { twitter: coin.twitter || null, telegram: coin.telegram || null, website: coin.website || null };
  const hasSocials = !!(socials.twitter || socials.telegram || socials.website);
  const migrated = !!coin.complete || !!coin.raydium_pool;
  const bondingCurveProgressPct = mcUsd != null ? Math.min(round((mcUsd / 69000) * 100, 1), 100) : null;

  const checks = [];
  if (mcUsd != null) {
    const okMin = mcUsd >= (cfg.minMarketCapUsd || 0);
    const okMax = cfg.maxMarketCapUsd == null || mcUsd <= cfg.maxMarketCapUsd;
    checks.push({ name:'marketCapInRange', pass: okMin && okMax, detail:'$' + mcUsd + ' vs [' + (cfg.minMarketCapUsd||0) + ', ' + (cfg.maxMarketCapUsd==null?'inf':cfg.maxMarketCapUsd) + ']' });
  }
  if (cfg.maxAgeMinutes != null) {
    checks.push({ name:'freshEnough', pass: ageMinutes != null && ageMinutes <= cfg.maxAgeMinutes, detail: (ageMinutes==null?'unknown age':ageMinutes + 'm') + ' <= ' + cfg.maxAgeMinutes + 'm' });
  }
  if (cfg.requireSocials) checks.push({ name:'hasSocials', pass: hasSocials, detail: JSON.stringify(socials) });
  if (cfg.excludeMigrated) checks.push({ name:'notMigrated', pass: !migrated, detail: migrated ? 'already migrated/complete' : 'still on bonding curve' });

  const snipe = checks.length > 0 ? checks.every(c => c.pass) : true;

  let score = 40;
  if (hasSocials) score += 15;
  if (!migrated) score += 10;
  if (ageMinutes != null && ageMinutes <= 30) score += 15;
  if (ageMinutes != null && ageMinutes <= 5) score += 10;
  if (mcUsd != null && mcUsd >= 5000 && mcUsd <= 40000) score += 10;
  if (Number(coin.reply_count) >= 10) score += 5;
  if (!snipe) score = Math.min(score, 35);
  score = Math.max(0, Math.min(100, score));

  return {
    mint: coin.mint || coin.address || null,
    name: coin.name || null,
    symbol: coin.symbol || null,
    marketCapUsd: mcUsd,
    ageMinutes,
    bondingCurveProgressPct,
    migrated,
    hasSocials,
    socials,
    replyCount: coin.reply_count != null ? Number(coin.reply_count) : null,
    creator: coin.creator || null,
    checks,
    snipe,
    score,
    reasons: checks.filter(c => !c.pass).map(c => c.name + ': ' + c.detail),
    pumpUrl: coin.mint ? 'https://pump.fun/' + coin.mint : null,
  };
}

async function analyze(cfg) {
  const coin = await fetchJson('https://frontend-api-v3.pump.fun/coins/' + encodeURIComponent(cfg.mint));
  if (!coin || (!coin.mint && !coin.name)) throw new Error('token not found on pump.fun: ' + cfg.mint);
  const report = evaluate(coin, cfg);
  return { mode:'analyze', criteria: publicCriteria(cfg), token: report, timestamp: new Date().toISOString() };
}

async function scan(cfg) {
  const url = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=' + cfg.limit + '&sort=created_timestamp&order=DESC&includeNftInMarketCap=false';
  const list = await fetchJson(url);
  const coins = Array.isArray(list) ? list : (list && Array.isArray(list.coins) ? list.coins : []);
  const evaluated = coins.map(c => evaluate(c, cfg));
  const matched = evaluated.filter(e => e.snipe);
  const candidates = matched.slice().sort((a, b) => b.score - a.score).slice(0, cfg.topN);
  return {
    mode:'scan',
    scanned: coins.length,
    matched: matched.length,
    criteria: publicCriteria(cfg),
    candidates,
    timestamp: new Date().toISOString(),
  };
}

async function executeTrade(cfg) {
  const key = process.env.PUMPPORTAL_API_KEY;
  if (!key) throw new Error('missing env PUMPPORTAL_API_KEY');
  const body = {
    action: cfg.action,
    mint: cfg.mint,
    amount: cfg.amount,
    denominatedInSol: cfg.denominatedInSol ? 'true' : 'false',
    slippage: cfg.slippage,
    priorityFee: cfg.priorityFee,
    pool: cfg.pool,
  };
  const res = await fetch('https://pumpportal.fun/api/trade?api-key=' + encodeURIComponent(key), {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await res.json(); } catch (e) { data = { raw: await res.text().catch(() => '') }; }
  if (!res.ok) throw new Error('PumpPortal trade failed: HTTP ' + res.status + ' ' + JSON.stringify(data));
  const sig = data && data.signature ? data.signature : null;
  return {
    mode:'trade',
    action: cfg.action,
    mint: cfg.mint,
    amount: cfg.amount,
    denominatedInSol: cfg.denominatedInSol,
    slippage: cfg.slippage,
    priorityFee: cfg.priorityFee,
    signature: sig,
    explorer: sig ? 'https://solscan.io/tx/' + sig : null,
    result: data,
    timestamp: new Date().toISOString(),
  };
}

function publicCriteria(cfg) {
  return {
    minMarketCapUsd: cfg.minMarketCapUsd,
    maxMarketCapUsd: cfg.maxMarketCapUsd,
    maxAgeMinutes: cfg.maxAgeMinutes,
    requireSocials: cfg.requireSocials,
    excludeMigrated: cfg.excludeMigrated,
  };
}
