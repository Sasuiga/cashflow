import type { GameState } from './types';
import { MATERIALS, PRODUCTS } from './data';

export type ClimateId = 'steel' | 'channel' | 'chip' | 'priceWar';
export type GoalKind = 'basic' | 'challenge';

export const BASIC_PENALTY = 5;
export const CHALLENGE_POINTS = 5;

export interface ClimateDef {
  id: ClimateId;
  name: string;
  headline: string;
  briefing: string;
  eventIds: string[];
}

export interface GoalDef {
  id: string;
  quarter: 1 | 2 | 3 | 4;
  kind: GoalKind;
  name: string;
  desc: string;
  reached: (state: GameState) => boolean;
  progress: (state: GameState) => string;
}

export const CLIMATES: ClimateDef[] = [
  {
    id: 'steel',
    name: '钢材紧缺',
    headline: '北方钢厂惜售，现货偏紧。',
    briefing: '本季市场：钢材紧缺。钢价易涨，基础款料本会被抬上去。',
    eventIds: ['steelSpike'],
  },
  {
    id: 'channel',
    name: '渠道要量',
    headline: '经销商在锁货，走量订单更密。',
    briefing: '本季市场：渠道要量。需求偏高，交不齐单会被追责。',
    eventIds: ['bigOrder', 'rushOrder', 'channelHold', 'arDelay', 'customerBreak'],
  },
  {
    id: 'chip',
    name: '芯片交期紧张',
    headline: '分销商收紧配额，中高端更吃力。',
    briefing: '本季市场：芯片交期紧张。标准款和旗舰款的料更贵、更少。',
    eventIds: ['chipSqueeze'],
  },
  {
    id: 'priceWar',
    name: '价格战',
    headline: '同行在清库存，标价承压。',
    briefing: '本季市场：价格战。售价容易被压，毛利变薄。',
    eventIds: ['dump', 'quality', 'stockAge', 'dampStock'],
  },
];

export const QUARTER_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: '第一季度',
  2: '第二季度',
  3: '第三季度',
  4: '第四季度',
};

export function quarterOf(month: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, Math.ceil(month / 3))) as 1 | 2 | 3 | 4;
}

export function climateById(id: ClimateId): ClimateDef {
  return CLIMATES.find((item) => item.id === id) ?? CLIMATES[0]!;
}

export function marketDigest(state: GameState): string {
  const climate = climateById(state.climateId);
  if (state.month === 1) {
    return `本月开盘，报价贴近基准。${climate.briefing}`;
  }

  const matMoves: string[] = [];
  for (const mat of MATERIALS) {
    if (mat.id === 'd' && !state.materialDUnlocked) continue;
    const price = state.materialPrices[mat.id];
    const pct = (price - mat.basePrice) / mat.basePrice;
    if (Math.abs(pct) < 0.05) continue;
    matMoves.push(`${mat.name}较基准${pct > 0 ? '上涨' : '回落'} ${Math.round(Math.abs(pct) * 100)}%`);
  }

  const productMoves: string[] = [];
  for (const product of PRODUCTS) {
    if (!state.unlockedProducts.includes(product.id)) continue;
    const price = state.productPrices[product.id] ?? product.basePrice;
    const pct = (price - product.basePrice) / product.basePrice;
    const demand = state.demand[product.id] ?? product.baseDemand;
    if (Math.abs(pct) >= 0.08) {
      productMoves.push(`${product.name}售价${pct > 0 ? '上浮' : '下压'} ${Math.round(Math.abs(pct) * 100)}%`);
    } else if (demand !== product.baseDemand) {
      productMoves.push(`${product.name}需求${demand > product.baseDemand ? '放到' : '收到'} ${demand} 件`);
    }
  }

  const parts = [climate.briefing];
  parts.push(matMoves.length > 0 ? `原料方面，${matMoves.join('，')}。` : '原料报价大体贴近基准，现货还算平稳。');
  parts.push(productMoves.length > 0 ? `成品这边，${productMoves.join('，')}。` : '成品市价和需求没有大幅偏离基准。');
  return parts.join('');
}

export function emptyQuarterStats(startStaff: number, startDebt: number) {
  return {
    sold: 0,
    peakCash: 0,
    coveringMonth: false,
    repaid: false,
    borrowed: false,
    playedCard: false,
    nonBasic: false,
    stockoutAB: false,
    premiumOrSpecial: false,
    startStaff,
    startDebt,
  };
}

function staffOf(state: GameState): number {
  return state.staff.production + state.staff.management + state.staff.sales + state.staff.rd;
}

export const GOALS: GoalDef[] = [
  {
    id: 'q1-net20',
    quarter: 1,
    kind: 'basic',
    name: '守住净资产垫',
    desc: '第一季度结束时，净资产不低于 20 万。',
    reached: (state) => (state.lastReport?.netAssets ?? 0) >= 20,
    progress: (state) =>
      state.lastReport ? `最近结算净资产 ${state.lastReport.netAssets}万 / 20万` : '待第一次月度结算后对照',
  },
  {
    id: 'q1-sold30',
    quarter: 1,
    kind: 'challenge',
    name: '本季走量达标',
    desc: '本季累计售出不少于 30 件。',
    reached: (state) => state.quarterStats.sold >= 30,
    progress: (state) => `已售 ${state.quarterStats.sold} / 30 件`,
  },
  {
    id: 'q1-stock',
    quarter: 1,
    kind: 'challenge',
    name: '钢材与塑料不断档',
    desc: '本季钢材和塑料从未同时见底。',
    reached: (state) => !state.quarterStats.stockoutAB,
    progress: (state) => (state.quarterStats.stockoutAB ? '已同时见底' : '尚未同时见底'),
  },
  {
    id: 'q1-crew',
    quarter: 1,
    kind: 'challenge',
    name: '编制不缩',
    desc: '季末编制不少于开季人数。',
    reached: (state) => staffOf(state) >= state.quarterStats.startStaff,
    progress: (state) => `编制 ${staffOf(state)} / 开季 ${state.quarterStats.startStaff}`,
  },
  {
    id: 'q1-mix',
    quarter: 1,
    kind: 'challenge',
    name: '试产非基础款',
    desc: '本季至少交付一次非基础款订单。',
    reached: (state) => state.quarterStats.nonBasic,
    progress: (state) => (state.quarterStats.nonBasic ? '已完成一次' : '尚未交付非基础款'),
  },
  {
    id: 'q2-payroll',
    quarter: 2,
    kind: 'basic',
    name: '工资备付充足',
    desc: '第二季度结束时，现金不低于应付职工薪酬。',
    reached: (state) => state.cash >= state.wagesPayable,
    progress: (state) => `现金 ${state.cash}万 / 应付职工薪酬 ${state.wagesPayable}万`,
  },
  {
    id: 'q2-machine',
    quarter: 2,
    kind: 'challenge',
    name: '完成第二台设备安装',
    desc: '设备达到 2 台。',
    reached: (state) => state.machines >= 2,
    progress: (state) => `设备 ${state.machines} / 2 台`,
  },
  {
    id: 'q2-staff6',
    quarter: 2,
    kind: 'challenge',
    name: '编制扩到 6 人',
    desc: '在岗编制达到 6 人。',
    reached: (state) => staffOf(state) >= 6,
    progress: (state) => `编制 ${staffOf(state)} / 6 人`,
  },
  {
    id: 'q2-debt',
    quarter: 2,
    kind: 'challenge',
    name: '本季完成一次还款或全程无债',
    desc: '本季还过一次短期借款，或开季至今未新增负债且季末无债。',
    reached: (state) =>
      state.quarterStats.repaid || (state.quarterStats.startDebt <= 0 && !state.quarterStats.borrowed && state.debt <= 0),
    progress: (state) => {
      if (state.quarterStats.repaid) return '本季已还款';
      if (state.quarterStats.startDebt <= 0 && !state.quarterStats.borrowed && state.debt <= 0) return '全程无债';
      return '仍有负债待处理';
    },
  },
  {
    id: 'q2-card',
    quarter: 2,
    kind: 'challenge',
    name: '决策卡投入使用',
    desc: '本季打出至少 1 张决策卡。',
    reached: (state) => state.quarterStats.playedCard,
    progress: (state) => (state.quarterStats.playedCard ? '已打出决策卡' : '尚未打牌'),
  },
  {
    id: 'q3-profit',
    quarter: 3,
    kind: 'basic',
    name: '至少一个月覆盖费用',
    desc: '本季至少有一个月，营业收入覆盖当月薪酬与厂区维护。',
    reached: (state) => state.quarterStats.coveringMonth,
    progress: (state) => (state.quarterStats.coveringMonth ? '已有一个月覆盖费用' : '尚未出现覆盖月'),
  },
  {
    id: 'q3-rd',
    quarter: 3,
    kind: 'challenge',
    name: '研发交付第一档',
    desc: '完成至少一档研发交付。',
    reached: (state) => state.rdUnlockIndex >= 1,
    progress: (state) => `研发交付 ${state.rdUnlockIndex} / 1 档`,
  },
  {
    id: 'q3-sales',
    quarter: 3,
    kind: 'challenge',
    name: '销售编制到 2 人',
    desc: '销售人员达到 2 人。',
    reached: (state) => state.staff.sales >= 2,
    progress: (state) => `销售 ${state.staff.sales} / 2 人`,
  },
  {
    id: 'q3-line',
    quarter: 3,
    kind: 'challenge',
    name: '产线扩到 3 台设备',
    desc: '设备达到 3 台。',
    reached: (state) => state.machines >= 3,
    progress: (state) => `设备 ${state.machines} / 3 台`,
  },
  {
    id: 'q3-cash',
    quarter: 3,
    kind: 'challenge',
    name: '现金一度达到 30 万',
    desc: '本季现金峰值达到 30 万。',
    reached: (state) => state.quarterStats.peakCash >= 30,
    progress: (state) => `本季现金峰值 ${state.quarterStats.peakCash} / 30 万`,
  },
  {
    id: 'q4-leverage',
    quarter: 4,
    kind: 'basic',
    name: '负债可控、净资产达标',
    desc: '季末短期借款不超过设备抵押上限，且净资产不低于 30 万。',
    reached: (state) => state.debt <= state.machines * 5 && (state.lastReport?.netAssets ?? 0) >= 30,
    progress: (state) => {
      const net = state.lastReport?.netAssets ?? 0;
      return `负债 ${state.debt}万 / 上限 ${state.machines * 5}万，净资产 ${net}万 / 30万`;
    },
  },
  {
    id: 'q4-flagship',
    quarter: 4,
    kind: 'challenge',
    name: '旗舰或特种款出货',
    desc: '本季以旗舰款或特种款完成一次结算。',
    reached: (state) => state.quarterStats.premiumOrSpecial,
    progress: (state) => (state.quarterStats.premiumOrSpecial ? '已出货' : '尚未出货'),
  },
  {
    id: 'q4-clear',
    quarter: 4,
    kind: 'challenge',
    name: '借过债并全部还清',
    desc: '本局出现过负债，且季末已还清。',
    reached: (state) => state.everDebt && state.debt <= 0,
    progress: (state) => {
      if (!state.everDebt) return '尚未借过债';
      return state.debt <= 0 ? '已还清' : '仍有负债';
    },
  },
  {
    id: 'q4-nodebt',
    quarter: 4,
    kind: 'challenge',
    name: '季末无短期借款',
    desc: '第四季度结束时账上无短期借款。',
    reached: (state) => state.debt <= 0,
    progress: (state) => (state.debt <= 0 ? '当前无债' : `负债仍在`),
  },
  {
    id: 'q4-net80',
    quarter: 4,
    kind: 'challenge',
    name: '净资产做到 80 万',
    desc: '季末净资产达到 80 万。',
    reached: (state) => (state.lastReport?.netAssets ?? 0) >= 80,
    progress: (state) =>
      state.lastReport ? `最近结算净资产 ${state.lastReport.netAssets}万 / 80万` : '待结算后对照',
  },
];

export function goalById(id: string): GoalDef {
  const found = GOALS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown goal ${id}`);
  return found;
}

export function basicGoalOf(quarter: 1 | 2 | 3 | 4): GoalDef {
  return GOALS.find((item) => item.quarter === quarter && item.kind === 'basic')!;
}

export function challengePoolOf(quarter: 1 | 2 | 3 | 4): GoalDef[] {
  return GOALS.filter((item) => item.quarter === quarter && item.kind === 'challenge');
}

export function q3ProcurementFree(month: number): boolean {
  return month >= 7;
}
