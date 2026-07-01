const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

function knownSymbol(mint) {
  try {
    if (mint === alve.tokens.USDC) return 'USDC';
    if (mint === alve.tokens.USDT) return 'USDT';
    if (mint === alve.tokens.SOL) return 'SOL';
  } catch (e) {}
  return null;
}

export async function run(input) {
  if (!process.env.SOLANA_RPC) throw new Error('missing env SOLANA_RPC');

  const address = alve.assertSolanaAddress(alve.pickAddress(input));
  const opts = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const full = opts.full === true;
  const includeZero = opts.includeZero === true;
  let limit = Number.isInteger(opts.limit) ? opts.limit : 10;
  if (limit < 1) limit = 1;
  if (limit > 50) limit = 50;

  const bal = await alve.getSolBalance(address);

  // Fetch SPL token accounts from both classic and Token-2022 programs.
  async function fetchTokens(programId) {
    const res = await alve.solanaRpc('getTokenAccountsByOwner', [
      address,
      { programId },
      { encoding: 'jsonParsed' }
    ]);
    return (res && res.value) ? res.value : [];
  }

  const [classic, t2022] = await Promise.all([
    fetchTokens(TOKEN_PROGRAM_ID),
    fetchTokens(TOKEN_2022_PROGRAM_ID).catch(() => [])
  ]);

  const raw = classic.concat(t2022);
  const tokens = [];
  for (const acc of raw) {
    const info = acc && acc.account && acc.account.data && acc.account.data.parsed
      ? acc.account.data.parsed.info : null;
    if (!info || !info.tokenAmount) continue;
    const ta = info.tokenAmount;
    const uiAmount = ta.uiAmount != null ? ta.uiAmount : Number(ta.amount) / Math.pow(10, ta.decimals || 0);
    if (!includeZero && (!ta.amount || ta.amount === '0')) continue;
    tokens.push({
      mint: info.mint,
      symbol: knownSymbol(info.mint),
      amount: ta.amount,
      decimals: ta.decimals,
      uiAmount,
      tokenAccount: acc.pubkey
    });
  }

  tokens.sort((a, b) => (b.uiAmount || 0) - (a.uiAmount || 0));

  const result = {
    address,
    sol: bal.sol,
    lamports: bal.lamports,
    tokenCount: tokens.length,
    tokens
  };

  if (full) {
    const sigs = await alve.solanaRpc('getSignaturesForAddress', [address, { limit }]);
    result.recentTransactions = (Array.isArray(sigs) ? sigs : []).map(s => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      err: s.err ? true : false,
      confirmationStatus: s.confirmationStatus
    }));
  }

  return result;
}
