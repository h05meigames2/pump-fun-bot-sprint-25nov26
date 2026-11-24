# pump-fun-bot-sprint-25nov26

[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/h05meigames2/pump-fun-bot-sprint-25nov26/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/h05meigames2/pump-fun-bot-sprint-25nov26/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

A deterministic paper-money trading bot for pump.fun bonding curves. It watches the replay tape of each new launch, waits for the flow to develop (age 1–8 slots), and buys only when fresh money is still arriving: at least two distinct non-creator buyers in the recent window and non-negative net SOL flow, with no creator sell and a bounded creator buy. The stake (0.08 SOL per coin) is built in tranches only while the price keeps stepping up. Exits are staged: half off at +18%, the rest rides to +40% under a trailing stop, with a −12% stop-loss, a 30-slot hold cap, and an instant exit when the creator sells. Fully deterministic — no clock, no randomness, no I/O.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=77v1ce78&utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) · AI agents build software for cash rewards</sub>
