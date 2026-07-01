export async function run(input) {
  const sig = typeof input === 'string'
    ? input.trim()
    : (input && typeof input === 'object' && input.signature != null ? String(input.signature).trim() : null);
  if (!sig) throw new Error('signature required (base58 string or {signature})');
  let raw;
  try { raw = alve.base58Decode(sig); } catch (e) { throw new Error('invalid base58 signature'); }
  if (raw.length !== 64) throw new Error('invalid signature length: expected 64 bytes, got ' + raw.length);
  const rpcUrl = (input && typeof input === 'object' && input.rpcUrl) ? String(input.rpcUrl) : undefined;

  const tx = await alve.solanaRpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }], rpcUrl);
  if (!tx) throw new Error('transaction not found for signature ' + sig);

  const message = (tx.transaction && tx.transaction.message) || {};
  const accountKeys = Array.isArray(message.accountKeys) ? message.accountKeys : [];
  const meta = tx.meta || {};

  const keyAt = (i) => {
    const k = accountKeys[i];
    if (!k) return null;
    return typeof k === 'string' ? k : k.pubkey;
  };

  // Map token account address -> { mint, owner, decimals } from pre/post token balances.
  const tokenAcct = {};
  const collectBal = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const b of arr) {
      const acct = keyAt(b.accountIndex);
      if (!acct) continue;
      tokenAcct[acct] = {
        mint: b.mint,
        owner: b.owner,
        decimals: b.uiTokenAmount ? b.uiTokenAmount.decimals : undefined
      };
    }
  };
  collectBal(meta.preTokenBalances);
  collectBal(meta.postTokenBalances);

  // Gather all instructions: top-level + inner.
  const topIx = Array.isArray(message.instructions) ? message.instructions : [];
  const innerGroups = Array.isArray(meta.innerInstructions) ? meta.innerInstructions : [];
  const innerIx = [];
  for (const g of innerGroups) {
    if (g && Array.isArray(g.instructions)) for (const ix of g.instructions) innerIx.push(ix);
  }
  const allIx = topIx.concat(innerIx);

  const programs = [];
  const seenProg = new Set();
  for (const ix of allIx) {
    const pid = ix && ix.programId;
    if (pid && !seenProg.has(pid)) { seenProg.add(pid); programs.push(pid); }
  }

  const transfers = [];
  let memo = null;

  const fmtToken = (rawAmount, decimals) => {
    if (rawAmount == null) return null;
    if (decimals == null) return String(rawAmount);
    try {
      const d = BigInt(decimals);
      const base = 10n ** d;
      const v = BigInt(rawAmount);
      const whole = v / base;
      const frac = v % base;
      if (frac === 0n) return whole.toString();
      let fs = frac.toString().padStart(Number(decimals), '0').replace(/0+$/, '');
      return whole.toString() + '.' + fs;
    } catch (e) {
      return String(rawAmount);
    }
  };

  for (const ix of allIx) {
    const prog = ix && ix.program;
    const parsed = ix && ix.parsed;
    if (prog === 'spl-memo') {
      const m = typeof parsed === 'string' ? parsed : (parsed && parsed.info ? parsed.info : null);
      if (m != null) memo = typeof m === 'string' ? m : JSON.stringify(m);
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const type = parsed.type;
    const info = parsed.info || {};

    if (prog === 'system' && type === 'transfer') {
      transfers.push({
        from: info.source || null,
        to: info.destination || null,
        amount: alve.lamportsToSol(info.lamports),
        mint: 'SOL'
      });
    } else if (prog === 'spl-token' || prog === 'spl-token-2022') {
      if (type === 'transferChecked') {
        const ta = info.tokenAmount || {};
        const amount = ta.uiAmountString != null ? ta.uiAmountString : (ta.uiAmount != null ? ta.uiAmount : fmtToken(ta.amount, ta.decimals));
        transfers.push({
          from: (tokenAcct[info.source] && tokenAcct[info.source].owner) || info.source || null,
          to: (tokenAcct[info.destination] && tokenAcct[info.destination].owner) || info.destination || null,
          amount: amount,
          mint: info.mint || (tokenAcct[info.source] && tokenAcct[info.source].mint) || null
        });
      } else if (type === 'transfer') {
        const src = tokenAcct[info.source];
        const dst = tokenAcct[info.destination];
        const mint = (src && src.mint) || (dst && dst.mint) || null;
        const decimals = (src && src.decimals != null) ? src.decimals : (dst ? dst.decimals : undefined);
        transfers.push({
          from: (src && src.owner) || info.source || null,
          to: (dst && dst.owner) || info.destination || null,
          amount: fmtToken(info.amount, decimals),
          mint: mint
        });
      }
    }
  }

  // Fallback memo from log messages if no memo instruction parsed.
  if (memo == null && Array.isArray(meta.logMessages)) {
    for (const l of meta.logMessages) {
      const mm = /Program log: Memo \(len \d+\): "([\s\S]*)"/.exec(l);
      if (mm) { memo = mm[1]; break; }
    }
  }

  const cpSet = new Set();
  for (const t of transfers) {
    if (t.from) cpSet.add(t.from);
    if (t.to) cpSet.add(t.to);
  }
  const counterparties = Array.from(cpSet);

  return {
    signature: sig,
    slot: tx.slot != null ? tx.slot : null,
    counterparties,
    transfers,
    programs,
    memo
  };
}
