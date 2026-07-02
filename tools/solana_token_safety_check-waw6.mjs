export async function run(input) {
  if (input == null) throw new Error('input required: token mint address');
  let mint, rpcUrl;
  if (typeof input === 'object' && !Array.isArray(input)) {
    if (typeof input.rpcUrl === 'string') rpcUrl = input.rpcUrl;
    if (typeof input.mint === 'string') mint = input.mint;
  }
  if (!mint) mint = alve.pickAddress(input);
  alve.assertSolanaAddress(mint);

  const info = await alve.solanaRpc('getAccountInfo', [mint, { encoding: 'base64', commitment: 'confirmed' }], rpcUrl);
  const value = info && info.value;
  if (!value) throw new Error('mint account not found on-chain: ' + mint);
  const owner = value.owner;
  const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
  if (owner !== TOKEN && owner !== TOKEN22) throw new Error('address is not an SPL token mint (owner=' + owner + ')');
  const raw = Buffer.from(value.data[0], 'base64');
  if (raw.length < 82) throw new Error('invalid mint account data length: ' + raw.length);

  const readU32 = (o) => (raw[o] | (raw[o+1] << 8) | (raw[o+2] << 16) | (raw[o+3] << 24)) >>> 0;
  const readPubkey = (o) => alve.base58Encode(raw.subarray(o, o + 32));
  let supply = 0n;
  for (let i = 0; i < 8; i++) supply += BigInt(raw[36 + i]) << BigInt(8 * i);
  const decimals = raw[44];
  const mintAuthority = readU32(0) === 1 ? readPubkey(4) : null;
  const freezeAuthority = readU32(46) === 1 ? readPubkey(50) : null;
  const isToken2022 = owner === TOKEN22;

  const warnings = [];
  if (mintAuthority) warnings.push('Mint authority is active \u2014 total supply can be inflated');
  if (freezeAuthority) warnings.push('Freeze authority is active \u2014 token accounts can be frozen');
  if (isToken2022) warnings.push('Token-2022 program \u2014 verify extensions (transfer fees, transfer hooks) manually');

  let lpLocked = null, lpBurned = null;
  try {
    const res = await fetch('https://api.rugcheck.xyz/v1/tokens/' + encodeURIComponent(mint) + '/report', { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (res.ok) {
      const rep = await res.json();
      const markets = Array.isArray(rep.markets) ? rep.markets : [];
      let anyData = false, lockedPctMax = 0, burned = false;
      for (const m of markets) {
        const lp = m && m.lp;
        if (lp && typeof lp.lpLockedPct === 'number') { anyData = true; if (lp.lpLockedPct > lockedPctMax) lockedPctMax = lp.lpLockedPct; }
      }
      if (Array.isArray(rep.risks)) {
        for (const r of rep.risks) { const n = (r && r.name ? String(r.name) : '').toLowerCase(); if (n.includes('burn')) burned = true; }
      }
      if (anyData) {
        lpLocked = lockedPctMax >= 90;
        lpBurned = burned || lockedPctMax >= 99.5;
        if (!lpLocked) warnings.push('LP only ' + lockedPctMax.toFixed(1) + '% locked \u2014 liquidity can be pulled');
      } else {
        lpBurned = burned || null;
        warnings.push('LP lock/burn data unavailable from indexer \u2014 unverified');
      }
    } else {
      warnings.push('LP status source returned HTTP ' + res.status + ' \u2014 LP unverified');
    }
  } catch (e) {
    warnings.push('LP status check failed: ' + (e && e.message ? e.message : String(e)));
  }

  const authoritiesRenounced = mintAuthority === null && freezeAuthority === null;
  const isSafe = authoritiesRenounced && (lpLocked === true || lpBurned === true);

  return { mint, program: isToken2022 ? 'Token-2022' : 'Token', decimals, supply: supply.toString(), mintAuthority, freezeAuthority, lpLocked, lpBurned, isSafe, warnings };
}
