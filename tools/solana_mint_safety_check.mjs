const BURN = new Set(['1nc1nerator11111111111111111111111111111111','11111111111111111111111111111111','deadeadeadeadeadeadeadeadeadeadeadeadeadead']);

async function analyzeLp(lpMint, full) {
  lpMint = alve.assertSolanaAddress(lpMint);
  const sup = await alve.solanaRpc('getTokenSupply', [lpMint]);
  if (!sup || !sup.value) throw new Error('LP mint not found on-chain: ' + lpMint);
  const totalRaw = Number(sup.value.amount);
  const result = { lpMint, supply: sup.value.amount, decimals: sup.value.decimals, burnedPercent: 0, lockedOrBurnedPercent: 0, burnedToDeadAddress: false, holders: [] };
  if (totalRaw === 0) { result.lockedOrBurnedPercent = 100; result.burnedPercent = 100; result.note = 'LP supply is zero \u2014 LP tokens fully burned.'; return result; }
  const largest = await alve.solanaRpc('getTokenLargestAccounts', [lpMint]);
  const accounts = (largest && largest.value) || [];
  const slice = full ? accounts : accounts.slice(0, 8);
  const owners = await Promise.all(slice.map(async (a) => {
    try {
      const ai = await alve.solanaRpc('getAccountInfo', [a.address, { encoding: 'jsonParsed' }]);
      const o = ai && ai.value && ai.value.data && ai.value.data.parsed && ai.value.data.parsed.info;
      return { account: a.address, amount: Number(a.amount), owner: o ? o.owner : null };
    } catch (e) { return { account: a.address, amount: Number(a.amount), owner: null }; }
  }));
  let burned = 0;
  for (const h of owners) {
    const isBurn = h.owner && BURN.has(h.owner);
    if (isBurn) burned += h.amount;
    result.holders.push({ account: h.account, owner: h.owner, amount: h.amount, percent: (h.amount / totalRaw) * 100, burned: !!isBurn });
  }
  result.burnedPercent = (burned / totalRaw) * 100;
  result.lockedOrBurnedPercent = result.burnedPercent;
  result.burnedToDeadAddress = burned > 0;
  if (result.lockedOrBurnedPercent < 50) result.warning = 'Less than 50% of LP tokens are burned to a dead address \u2014 liquidity could be pulled (rug risk). Note: LP held by a third-party locker program is not auto-detected here.';
  return result;
}

export async function run(input) {
  if (input === null || input === undefined) throw new Error('input required: a Solana mint address (string) or { mint, lpMint? }');
  let mint, lpMint = null, full = false;
  if (typeof input === 'string' || Array.isArray(input)) {
    mint = alve.pickAddress(input);
  } else if (typeof input === 'object') {
    mint = alve.pickAddress(input.mint != null ? input.mint : (input.token != null ? input.token : (input.address != null ? input.address : input)));
    if (input.lpMint != null || input.lp != null) lpMint = alve.pickAddress({ address: input.lpMint != null ? input.lpMint : input.lp });
    full = !!(input.full || input.complete || input.all);
  } else {
    throw new Error('input must be a string mint address or an object');
  }
  mint = alve.assertSolanaAddress(mint);

  const info = await alve.solanaRpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  if (!info || !info.value) throw new Error('mint account not found on-chain: ' + mint);
  const val = info.value;
  const parsed = val.data && val.data.parsed;
  if (!parsed || parsed.type !== 'mint') throw new Error('address is not an SPL token mint: ' + mint);
  const i = parsed.info;
  const decimals = i.decimals;
  const rawSupply = i.supply;
  const supplyUi = Number(rawSupply) / Math.pow(10, decimals);
  const mintAuthority = i.mintAuthority || null;
  const freezeAuthority = i.freezeAuthority || null;
  const mintRenounced = mintAuthority === null;
  const freezeRenounced = freezeAuthority === null;

  const warnings = [];
  if (!mintRenounced) warnings.push('Mint authority is ACTIVE \u2014 supply can be inflated by minting new tokens.');
  if (!freezeRenounced) warnings.push('Freeze authority is ACTIVE \u2014 token accounts can be frozen, blocking transfers/sells.');

  let lp = null;
  if (lpMint) { lp = await analyzeLp(lpMint, full); if (lp.warning) warnings.push(lp.warning); }

  let score = 0;
  if (!mintRenounced) score += 2;
  if (!freezeRenounced) score += 2;
  if (lp && lp.lockedOrBurnedPercent < 50) score += 2;
  const riskLevel = score >= 4 ? 'high' : (score >= 2 ? 'medium' : 'low');

  const parts = [];
  parts.push(mintRenounced ? 'mint authority renounced' : 'MINT AUTHORITY ACTIVE');
  parts.push(freezeRenounced ? 'freeze authority renounced' : 'FREEZE AUTHORITY ACTIVE');
  if (lp) parts.push('LP ' + lp.lockedOrBurnedPercent.toFixed(1) + '% burned');

  return { mint, programOwner: val.owner, decimals, supply: rawSupply, supplyUi, mintAuthority, freezeAuthority, mintRenounced, freezeRenounced, lp, riskLevel, warnings, summary: parts.join('; ') };
}
