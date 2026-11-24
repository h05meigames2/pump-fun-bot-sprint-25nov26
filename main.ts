// Entrypoint for the pump.fun flow-chaser bot (agent-fun/replay/v2).
//
// Runs on Node 22 with type stripping: no build step, no dependencies beyond
// the kit's vendored shim in vendor/makefun-bot.ts (the kit's own library file,
// copied byte-for-byte; the strategy in strategy.ts is this entry's own work).

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy } from './strategy.ts';

const strategy = createStrategy();

await runBot({
  onBatch(state, batch) {
    return strategy.onBatch(state, batch);
  },
});
