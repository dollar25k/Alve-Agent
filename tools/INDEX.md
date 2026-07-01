# Agent tools
- pump_fun_sol_sniper: Scan newest pump.fun tokens, score snipe candidates by market cap/age/socials/bonding curve, analyze a mint, or execute live buys/sells via PumpPortal.
- decodesolanatransaction: Fetch a Solana transaction by signature and extract counterparties, transfers, programs, slot, and memo for linkage analysis.
- sol_wallet_analyzer: Analyzes a Solana wallet via Helius RPC: SOL balance, SPL token holdings, and (on request) recent transaction activity.
- sol_usd_price: Returns a Solana token's current USD price from DexScreener, using the highest-liquidity pair. Reports if no price exists.
- fixreferenceerror: Resolves 'alve is not defined' by injecting a top-level binding of alve to the vetted global, so analyze/buy/sell can execute.
