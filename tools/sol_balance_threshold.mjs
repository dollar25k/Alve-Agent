export async function run(input) {
  if (input === null || input === undefined) throw new Error('input is required');
  let threshold = 0.05;
  if (typeof input === 'object' && !Array.isArray(input) && input.threshold !== undefined) {
    const t = Number(input.threshold);
    if (!Number.isFinite(t) || t < 0) throw new Error('threshold must be a non-negative number');
    threshold = t;
  }
  const addr = alve.pickAddress(input);
  if (!addr) throw new Error('no Solana address found in input');
  alve.assertSolanaAddress(addr);
  const { address, lamports, sol } = await alve.getSolBalance(addr);
  const meetsThreshold = sol >= threshold;
  return {
    address,
    lamports,
    sol,
    threshold,
    meetsThreshold,
    shortfall: meetsThreshold ? 0 : Number((threshold - sol).toFixed(9))
  };
}
