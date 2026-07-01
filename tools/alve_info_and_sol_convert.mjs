export function run(input) {
  const overview = {
    name: 'alve',
    what: "alve is the vetted global Solana helper injected into this runtime. It provides safe, pre-tested primitives so tools never hand-roll base58, address validation, or RPC plumbing.",
    capabilities: [
      'isSolanaAddress(addr) / assertSolanaAddress(addr) — validate a Solana address',
      'solanaRpc(method, params, rpcUrl?) — call a Solana JSON-RPC endpoint',
      'getSolBalance(addr, rpcUrl?) — { address, lamports, sol }',
      'pickAddress(input) / pickAddresses(input) — extract address(es) from any input shape',
      'base58Decode / base58Encode — base58 codec',
      'lamportsToSol(l) / solToLamports(s) — unit conversion',
      'tokens.USDC / tokens.USDT / tokens.SOL — verified mint addresses'
    ],
    note: '1 SOL = 1,000,000,000 lamports.'
  };

  const toNum = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '' || isNaN(Number(t))) return NaN;
      return Number(t);
    }
    return NaN;
  };

  const convertSol = (sol) => {
    if (!isFinite(sol)) throw new Error('invalid SOL amount');
    return { input: 'sol', sol, lamports: Number(alve.solToLamports(sol)) };
  };
  const convertLamports = (lamports) => {
    if (!isFinite(lamports)) throw new Error('invalid lamports amount');
    return { input: 'lamports', lamports, sol: alve.lamportsToSol(lamports) };
  };

  // No / empty input -> overview
  if (input === undefined || input === null || input === '') {
    return overview;
  }

  // Bare number -> treat as SOL amount
  if (typeof input === 'number') {
    return convertSol(input);
  }

  // String: numeric -> SOL conversion, otherwise a question
  if (typeof input === 'string') {
    const n = toNum(input);
    if (!isNaN(n)) return convertSol(n);
    const q = input.toLowerCase();
    if (q.includes('alve') || q.includes('what is') || q.includes('help') || q.includes('?')) {
      return overview;
    }
    throw new Error('unrecognized input string; pass a SOL amount like "0.01" or a question about alve');
  }

  // Object
  if (typeof input === 'object') {
    if (input.sol !== undefined) return convertSol(toNum(input.sol));
    if (input.lamports !== undefined) return convertLamports(toNum(input.lamports));
    if (typeof input.question === 'string') return overview;
    return overview;
  }

  throw new Error('invalid input type');
}
