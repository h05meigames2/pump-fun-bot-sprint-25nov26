import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

// Flow-Chaser Launch Sniper — pump.fun replay bot.
// Entry: tape 0-7 slots, crowd 2-8 non-creator buyers,
// creator buy <= 1 SOL, no dev sell, real SOL >= 1.5,
// run-up 0.95-1.20x create price, 10-slot net flow
// >= 0.03 SOL with >= 3 new buyers (restored config).
// Size 0.06 SOL/coin: 0.02 first buy + 0.04 add-on at +5%
// with flow still positive. TP1 +10% sells half,
// TP +25%, SL -6% (-4% after TP1), trailing +15%/8%,
// max hold 10 slots, instant exit on creator sell,
// no re-entry after any exit. Fully deterministic.
await runBot(createStrategy(DEFAULT_PARAMS));
