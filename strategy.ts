// Flow-Chaser Launch Sniper — pump.fun bot sprint entry.
//
// Deterministic flow-chasing launch sniper for the agent-fun/replay/v2
// harness. It buys young curves with a healthy early crowd, scales in
// once on a confirmed +5% run-up with flow still positive, and exits on
// TP / stop / trailing / max-hold / creator dump. No clock, no random:
// every decision is a pure function of the tape seen so far.
//
// Restored best guardrail-passing config (fixer round 2, ronde 1):
// minNewBuyers 3, runUpMax 1.20, add-on +5%, TP1 +10%, per-coin
// cash budgeting, no re-entry after an exit.

import type { Batch, BotState, OrderInput } from './vendor/makefun-bot.ts';

export interface StrategyParams {
  name: string;
  tapeMaxAgeSlots: number;
  crowdMin: number;
  crowdMax: number;
  creatorBuyMaxSol: number;
  realSolMinSol: number;
  runUpMin: number;
  runUpMax: number;
  netFlowMinSol: number;
  minNewBuyers: number;
  firstBuySol: number;
  addOnSol: number;
  addOnTriggerPct: number;
  tp1Pct: number;
  tpFullPct: number;
  slPct: number;
  slAfterTp1Pct: number;
  trailingArmPct: number;
  trailingPullbackPct: number;
  maxHoldSlots: number;
  slippageBps: number;
}

export const DEFAULT_PARAMS: StrategyParams = {
  name: 'Flow-Chaser Launch Sniper',
  tapeMaxAgeSlots: 7,
  crowdMin: 2,
  crowdMax: 8,
  creatorBuyMaxSol: 1,
  realSolMinSol: 1.5,
  runUpMin: 0.95,
  runUpMax: 1.2,
  netFlowMinSol: 0.03,
  minNewBuyers: 3,
  firstBuySol: 0.02,
  addOnSol: 0.04,
  addOnTriggerPct: 0.05,
  tp1Pct: 0.1,
  tpFullPct: 0.25,
  slPct: 0.06,
  slAfterTp1Pct: 0.04,
  trailingArmPct: 0.15,
  trailingPullbackPct: 0.08,
  maxHoldSlots: 10,
  slippageBps: 500,
};

const SOL = 1_000_000_000n;

interface TapeTrade {
  slot: number;
  sol: number;
  buy: boolean;
  user: string;
}

interface CoinTape {
  mint: string;
  creator: string;
  createdSlot: number;
  createPrice: number;
  buyers: Set<string>;
  creatorBuySol: number;
  creatorSold: boolean;
  trades: TapeTrade[];
  entered: boolean;
  entrySlot: number;
  entryPrice: number;
  addedOn: boolean;
  tp1Done: boolean;
  peakReturn: number;
  exited: boolean;
}

function priceOf(vQuote: bigint, vToken: bigint): number {
  if (vToken === 0n) return 0;
  return Number(vQuote) / Number(vToken);
}

function solLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1e9));
}

export function createStrategy(params: StrategyParams = DEFAULT_PARAMS) {
  const tapes = new Map<string, CoinTape>();

  function tapeFor(mint: string, creator: string, slot: number, createPrice: number): CoinTape {
    let t = tapes.get(mint);
    if (t === undefined) {
      t = {
        mint,
        creator,
        createdSlot: slot,
        createPrice,
        buyers: new Set<string>(),
        creatorBuySol: 0,
        creatorSold: false,
        trades: [],
        entered: false,
        entrySlot: 0,
        entryPrice: 0,
        addedOn: false,
        tp1Done: false,
        peakReturn: 0,
        exited: false,
      };
      tapes.set(mint, t);
    }
    return t;
  }

  function windowTrades(t: CoinTape, now: number, span: number): TapeTrade[] {
    return t.trades.filter((tr) => tr.slot > now - span);
  }

  function netFlowSol(t: CoinTape, now: number, span: number): number {
    let flow = 0;
    for (const tr of windowTrades(t, now, span)) flow += tr.buy ? tr.sol : -tr.sol;
    return flow;
  }

  function newBuyers(t: CoinTape, now: number, span: number): Set<string> {
    const seen = new Set<string>();
    for (const tr of windowTrades(t, now, span)) {
      if (tr.buy && tr.user !== t.creator) seen.add(tr.user);
    }
    return seen;
  }

  function pendingBuy(state: BotState, mint: string): boolean {
    for (const p of state.pending.values()) {
      if (p.order.side === 'buy' && p.order.mint === mint) return true;
    }
    return false;
  }

  function onBatch(state: BotState, batch: Batch): OrderInput[] {
    const now = batch.slot;
    const orders: OrderInput[] = [];

    // --- fold this batch's events into the tapes -------------------------
    for (const e of batch.events) {
      if (e.event === 'CreateEvent') {
        const p = priceOf(BigInt(e.virtual_quote_reserves), BigInt(e.virtual_token_reserves));
        tapeFor(e.mint, e.creator, e.slot, p);
      } else if (e.event === 'TradeEvent') {
        const curve = state.curves.get(e.mint);
        let t = tapes.get(e.mint);
        if (t === undefined) {
          const p = curve !== undefined ? priceOf(curve.virtual_quote_reserves, curve.virtual_token_reserves) : 0;
          t = tapeFor(e.mint, e.creator, e.slot, p);
        }
        const sol = Number(BigInt(e.sol_amount)) / 1e9;
        t.trades.push({ slot: e.slot, sol, buy: e.is_buy, user: e.user });
        if (e.user !== t.creator && e.is_buy) t.buyers.add(e.user);
        if (e.user === t.creator) {
          if (e.is_buy) t.creatorBuySol += sol;
          else t.creatorSold = true;
        }
      } else if (e.event === 'CompleteEvent') {
        // Curve done: never touch this mint again.
        const t = tapes.get(e.mint);
        if (t !== undefined) t.exited = true;
      }
    }
    // Prune tape history older than 12 slots (the entry window is 10).
    for (const t of tapes.values()) {
      if (t.trades.length > 0 && t.trades[0].slot <= now - 12) {
        t.trades = t.trades.filter((tr) => tr.slot > now - 12);
      }
    }

    // --- exits + add-ons for held positions ------------------------------
    for (const [mint, pos] of state.positions) {
      const curve = state.curves.get(mint);
      const t = tapes.get(mint);
      if (curve === undefined || curve.complete) continue;
      const price = priceOf(curve.virtual_quote_reserves, curve.virtual_token_reserves);
      if (price <= 0) continue;
      const avgCost = Number(pos.cost_lamports) / Number(pos.token_amount);
      if (avgCost <= 0) continue;
      const ret = price / avgCost - 1;
      if (t !== undefined && ret > t.peakReturn) t.peakReturn = ret;

      const sellAll = (): void => {
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: params.slippageBps });
        if (t !== undefined) t.exited = true;
      };

      // Instant exit when the creator dumps.
      if (t !== undefined && t.creatorSold) {
        sellAll();
        continue;
      }
      // Max hold: 10 slots from the entry decision.
      if (t !== undefined && t.entered && now - t.entrySlot >= params.maxHoldSlots) {
        sellAll();
        continue;
      }
      // Full take-profit at +25%.
      if (ret >= params.tpFullPct) {
        sellAll();
        continue;
      }
      // Stop loss: -6%, tightened to -4% once TP1 has banked.
      const sl = t !== undefined && t.tp1Done ? params.slAfterTp1Pct : params.slPct;
      if (ret <= -sl) {
        sellAll();
        continue;
      }
      // Trailing stop once armed at +15%: exit on an 8pp pullback.
      if (t !== undefined && t.peakReturn >= params.trailingArmPct && ret <= t.peakReturn - params.trailingPullbackPct) {
        sellAll();
        continue;
      }
      // TP1: bank half the position at +10%.
      if (t !== undefined && !t.tp1Done && ret >= params.tp1Pct) {
        const half = pos.token_amount / 2n;
        if (half > 0n) {
          orders.push({ side: 'sell', mint, token_amount: half.toString(), max_slippage_bps: params.slippageBps });
          t.tp1Done = true;
        }
        continue;
      }
      // Add-on: +5% with flow still positive, once per coin.
      if (t !== undefined && !t.addedOn && !pendingBuy(state, mint) && ret >= params.addOnTriggerPct && netFlowSol(t, now, 10) > 0) {
        const amount = solLamports(params.addOnSol);
        if (state.freeCashLamports() >= amount + state.txFeeLamports() && amount <= state.maxBuyLamports(mint)) {
          orders.push({ side: 'buy', mint, quote_lamports: amount.toString(), max_slippage_bps: params.slippageBps });
          t.addedOn = true;
        }
      }
    }

    // --- recover entries whose first buy never filled ---------------------
    // A coin whose buy was rejected/failed is not a real entry: allow a
    // fresh attempt. Coins exited after a real position stay exited.
    for (const t of tapes.values()) {
      if (t.entered && !t.exited && !state.positions.has(t.mint) && !pendingBuy(state, t.mint) && now - t.entrySlot > 3) {
        t.entered = false;
        t.entrySlot = 0;
        t.addedOn = false;
        t.tp1Done = false;
        t.peakReturn = 0;
      }
    }

    // --- new entries -------------------------------------------------------
    // Cash is budgeted per coin: every live coin reserves its 0.04 SOL
    // add-on, so a new entry must leave that reserved cash untouched.
    let reserved = 0n;
    for (const t of tapes.values()) {
      if (t.entered && !t.exited && !t.addedOn) reserved += solLamports(params.addOnSol);
    }
    const firstBuy = solLamports(params.firstBuySol);
    const stake = firstBuy + solLamports(params.addOnSol);

    for (const t of tapes.values()) {
      if (t.entered || t.exited) continue;
      if (t.createPrice <= 0) continue;
      const age = now - t.createdSlot;
      if (age < 0 || age > params.tapeMaxAgeSlots) continue;
      if (t.buyers.size < params.crowdMin || t.buyers.size > params.crowdMax) continue;
      if (t.creatorBuySol > params.creatorBuyMaxSol) continue;
      if (t.creatorSold) continue;
      const curve = state.curves.get(t.mint);
      if (curve === undefined || curve.complete) continue;
      if (curve.real_quote_reserves < solLamports(params.realSolMinSol)) continue;
      const price = priceOf(curve.virtual_quote_reserves, curve.virtual_token_reserves);
      if (price <= 0) continue;
      const runUp = price / t.createPrice;
      if (runUp < params.runUpMin || runUp > params.runUpMax) continue;
      if (netFlowSol(t, now, 10) < params.netFlowMinSol) continue;
      if (newBuyers(t, now, 10).size < params.minNewBuyers) continue;
      if (pendingBuy(state, t.mint)) continue;
      if (state.committedPositionCount() >= state.hello.caps.max_open_positions) break;
      if (state.freeCashLamports() - reserved < stake + state.txFeeLamports()) continue;
      if (firstBuy > state.maxBuyLamports(t.mint)) continue;
      orders.push({ side: 'buy', mint: t.mint, quote_lamports: firstBuy.toString(), max_slippage_bps: params.slippageBps });
      t.entered = true;
      t.entrySlot = now;
      t.entryPrice = price;
      reserved += solLamports(params.addOnSol);
    }

    return orders;
  }

  return { onBatch };
}
