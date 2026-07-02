export function run(input) { return (async () => {
  const rpcUrl = (input && typeof input === 'object' && input.rpcUrl) ? input.rpcUrl : undefined;
  const poolRaw = alve.pickAddress(input && typeof input === 'object' ? (input.pool ?? input) : input);
  if (!poolRaw) throw new Error('missing pool address');
  const pool = alve.assertSolanaAddress(poolRaw);

  const acc = await alve.solanaRpc('getAccountInfo', [pool, { encoding: 'base64' }], rpcUrl);
  if (!acc || !acc.value) throw new Error('pool account not found on-chain: ' + pool);
  const owner = acc.value.owner;
  const dataB64 = acc.value.data && acc.value.data[0];
  if (!dataB64) throw new Error('pool account has no data');
  const bytes = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));

  const readPubkeyAt = (off) => {
    if (off < 0 || off + 32 > bytes.length) return null;
    const slice = bytes.slice(off, off + 32);
    // reject all-zero (uninitialized) key
    let allZero = true; for (const b of slice) { if (b !== 0) { allZero = false; break; } }
    if (allZero) return null;
    try { return alve.base58Encode(slice); } catch (_) { return null; }
  };

  const candidates = [];
  const explicit = (input && typeof input === 'object' && Number.isInteger(input.lpMintOffset)) ? input.lpMintOffset : null;
  const offsets = explicit !== null ? [explicit] : [464]; // Raydium AMM v4 lpMint offset

  for (const off of offsets) {
    const pk = readPubkeyAt(off);
    if (pk) candidates.push({ offset: off, mint: pk });
  }

  // Validate each candidate by confirming it is a real SPL token mint account
  const results = [];
  for (const c of candidates) {
    try {
      const info = await alve.solanaRpc('getAccountInfo', [c.mint, { encoding: 'jsonParsed' }], rpcUrl);
      const val = info && info.value;
      const isMint = val && val.data && val.data.parsed && val.data.parsed.type === 'mint';
      if (isMint) {
        const m = val.data.parsed.info;
        results.push({ offset: c.offset, lpMint: c.mint, decimals: m.decimals, supply: m.supply, mintAuthority: m.mintAuthority, freezeAuthority: m.freezeAuthority });
      }
    } catch (_) { /* skip non-mint candidate */ }
  }

  if (results.length === 0) {
    throw new Error('could not resolve LP mint from pool ' + pool + ' (owner ' + owner + ', data len ' + bytes.length + '); try passing lpMintOffset explicitly');
  }

  const best = results[0];
  return {
    pool,
    programOwner: owner,
    dataLength: bytes.length,
    lpMint: best.lpMint,
    lpMintOffset: best.offset,
    decimals: best.decimals,
    supply: best.supply,
    mintAuthority: best.mintAuthority,
    freezeAuthority: best.freezeAuthority,
    candidates: results
  };
})(); }
