import type { GameState, MaterialId, ProductDef, ProductId, QuarterStats, TrendDir } from './types';
import { LOAN_PER_MACHINE, MATERIALS, catalogOf, isPremiumProduct, isVolumeProduct, unlockedCatalog } from './data';
import { priceDelta } from './format';

export type ClimateId = 'steel' | 'channel' | 'chip' | 'priceWar';
export type GoalKind = 'basic' | 'challenge';
export type GoalAxis =
  | 'cash'
  | 'net'
  | 'volume'
  | 'stock'
  | 'staff'
  | 'product'
  | 'machine'
  | 'debt'
  | 'card'
  | 'rd'
  | 'sales'
  | 'cover'
  | 'leverage';

export const BASIC_PENALTY = 5;
export const CHALLENGE_POINTS = 5;
export const CHALLENGE_PICK = 1;

export interface ClimateDef {
  id: ClimateId;
  name: string;
  headline: string;
  briefing: string;
  eventIds: string[];
  materialTrend: Partial<Record<MaterialId, TrendDir>>;
  productTrend: Partial<Record<ProductId, TrendDir>>;
}

export interface GoalDef {
  id: string;
  quarter: 1 | 2 | 3 | 4;
  kind: GoalKind;
  name: string;
  desc: string;
  axis: GoalAxis;
  climateAffinity?: ClimateId[];
  reached: (state: GameState) => boolean;
  progress: (state: GameState) => string;
}

export const CLIMATES: ClimateDef[] = [
  {
    id: 'steel',
    name: '钢材紧缺',
    headline: '北方钢厂惜售，现货偏紧。',
    briefing: '本季市场：钢材紧缺。钢价易涨，吃钢的走量货料本会被抬上去。',
    eventIds: ['steelSpike', 'plasticSpike', 'moldWear', 'traderDump'],
    materialTrend: { a: 1 },
    productTrend: { basic: 1, economy: 1 },
  },
  {
    id: 'channel',
    name: '渠道要量',
    headline: '经销商在锁货，走量订单更密。',
    briefing: '本季市场：渠道要量。需求偏高，交不齐单会被追责。走量货报价偏强。',
    eventIds: ['bigOrder', 'rushOrder', 'rushStandard', 'channelHold', 'arDelay', 'customerBreak', 'priceRally'],
    materialTrend: {},
    productTrend: { basic: 1, economy: 1 },
  },
  {
    id: 'chip',
    name: '芯片交期紧张',
    headline: '分销商收紧配额，中高端更吃力。',
    briefing: '本季市场：芯片交期紧张。芯片易涨，标准款和旗舰款售价也容易跟涨。',
    eventIds: ['chipSqueeze', 'chipAlloc'],
    materialTrend: { c: 1 },
    productTrend: { standard: 1, premium: 1 },
  },
  {
    id: 'priceWar',
    name: '价格战',
    headline: '同行在清库存，标价承压。',
    briefing: '本季市场：价格战。成品报价偏弱，毛利容易被压薄。',
    eventIds: ['dump', 'quality', 'stockAge', 'dampStock', 'idleSeason', 'inspectBonus'],
    materialTrend: {},
    productTrend: { basic: -1, standard: -1, premium: -1, economy: -1, special: -1 },
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

export function trendWord(dir: TrendDir): string {
  if (dir > 0) return '看涨';
  if (dir < 0) return '看跌';
  return '持稳';
}

function demandWord(dir: TrendDir): string {
  if (dir > 0) return '偏旺';
  if (dir < 0) return '偏弱';
  return '持稳';
}

function quotaWord(dir: TrendDir): string {
  if (dir > 0) return '偏紧';
  if (dir < 0) return '偏松';
  return '持稳';
}

function clampTrend(dir: number): TrendDir {
  if (dir > 0) return 1;
  if (dir < 0) return -1;
  return 0;
}

function collapseTrend(parts: { name: string; dir: TrendDir }[], word: (dir: TrendDir) => string): string {
  if (parts.length === 0) return '暂无';
  const first = parts[0]!.dir;
  if (parts.every((item) => item.dir === first)) return word(first);
  return parts.map((item) => `${item.name}${word(item.dir)}`).join(' · ');
}

function demandDirOf(climateId: ClimateId, product: ProductDef): TrendDir {
  if (climateId === 'channel' && isVolumeProduct(product)) return 1;
  if (climateId === 'chip' && (isPremiumProduct(product) || (product.bom.c ?? 0) > 0 || product.id === 'standard')) {
    return -1;
  }
  return 0;
}

function quotaDirOf(climateId: ClimateId, materialId: MaterialId, priceTrend: TrendDir): TrendDir {
  let dir = 0;
  if (materialId === 'a' && climateId === 'steel') dir += 1;
  if ((materialId === 'a' || materialId === 'b') && climateId === 'channel') dir -= 1;
  if (materialId === 'c' && climateId === 'chip') dir += 1;
  if (priceTrend > 0) dir += 1;
  if (priceTrend < 0) dir -= 1;
  return clampTrend(dir);
}

export function emptyMarketTrend() {
  return {
    materials: { a: 0, b: 0, c: 0, d: 0 } as Record<MaterialId, TrendDir>,
    products: {} as Partial<Record<ProductId, TrendDir>>,
  };
}

export function dealMarketTrend(
  climateId: ClimateId,
  unlockedProducts: ProductId[],
  materialDUnlocked: boolean,
  catalog = catalogOf({ unlockedProducts }),
) {
  const climate = climateById(climateId);
  const materials: Record<MaterialId, TrendDir> = { a: 0, b: 0, c: 0, d: 0 };
  for (const id of Object.keys(climate.materialTrend) as MaterialId[]) {
    materials[id] = climate.materialTrend[id] ?? 0;
  }
  const products: Partial<Record<ProductId, TrendDir>> = {};
  for (const id of unlockedProducts) {
    const fromClimate = climate.productTrend[id];
    if (fromClimate != null) {
      products[id] = fromClimate;
      continue;
    }
    const def = catalog.find((item) => item.id === id);
    if (def && isVolumeProduct(def)) products[id] = climate.productTrend.basic ?? climate.productTrend.economy ?? 0;
    else if (def && isPremiumProduct(def)) products[id] = climate.productTrend.premium ?? climate.productTrend.special ?? 0;
    else products[id] = climate.productTrend.standard ?? 0;
  }
  const idle = (['a', 'b', 'c', 'd'] as MaterialId[]).filter((id) => {
    if (id === 'd' && !materialDUnlocked) return false;
    return materials[id] === 0;
  });
  if (idle.length > 0 && Math.random() < 0.7) {
    materials[idle[Math.floor(Math.random() * idle.length)]!] = Math.random() < 0.5 ? 1 : -1;
  }
  return { materials, products };
}

export function marketToneLine(state: GameState): string {
  const trend = state.marketTrend ?? emptyMarketTrend();
  const mats: string[] = [];
  for (const mat of MATERIALS) {
    if (mat.id === 'd' && !state.materialDUnlocked) continue;
    mats.push(`${mat.name}${trendWord(trend.materials[mat.id] ?? 0)}`);
  }
  const unlocked = unlockedCatalog(state);
  const dirs = unlocked.map((item) => trend.products[item.id] ?? 0);
  const productLine =
    unlocked.length > 0 && dirs.every((dir) => dir === dirs[0])
      ? `成品${trendWord(dirs[0]!)}`
      : unlocked.map((item) => `${item.name}${trendWord(trend.products[item.id] ?? 0)}`).join(' · ');
  return [...mats, productLine].filter(Boolean).join(' · ');
}

export function quotedMoves(state: GameState): { materials: string[]; products: string[] } {
  const materials: string[] = [];
  for (const mat of MATERIALS) {
    if (mat.id === 'd' && !state.materialDUnlocked) continue;
    const price = state.materialPrices[mat.id];
    const prev = state.prevMaterialPrices?.[mat.id] ?? mat.basePrice;
    const delta = priceDelta(price, prev);
    if (delta.tone === 'flat') continue;
    materials.push(`${mat.name}较上月${delta.text}`);
  }

  const products: string[] = [];
  for (const product of unlockedCatalog(state)) {
    const price = state.productPrices[product.id] ?? product.basePrice;
    const prev = state.prevProductPrices?.[product.id] ?? product.basePrice;
    const delta = priceDelta(price, prev);
    if (delta.tone === 'flat') continue;
    products.push(`${product.name}较上月${delta.text}`);
  }
  return { materials, products };
}

export function marketTrendLog(state: GameState): string {
  const climate = climateById(state.climateId);
  return `${climate.name}。${climate.headline} ${marketToneLine(state)}。`;
}

export function quotedMoveLog(state: GameState): string {
  const { materials, products } = quotedMoves(state);
  const parts = [
    materials.length > 0 ? `原料方面，${materials.join('，')}。` : '原料报价较上月没有明显台阶。',
    products.length > 0 ? `成品这边，${products.join('，')}。` : '成品市价较上月没有明显台阶。',
  ];
  return parts.join('');
}

export function monthMarketLog(state: GameState): string {
  return `${state.month} 月行情：${marketTrendLog(state)}${quotedMoveLog(state)}`;
}

export function quarterOutlook(state: GameState): {
  materials: string;
  products: string;
  demand: string;
  quota: string;
} {
  const trend = state.marketTrend ?? emptyMarketTrend();
  const climateId = state.climateId;
  const materials = MATERIALS.filter((mat) => mat.id !== 'd' || state.materialDUnlocked);
  const unlocked = unlockedCatalog(state);
  return {
    materials: collapseTrend(
      materials.map((mat) => ({ name: mat.name, dir: trend.materials[mat.id] ?? 0 })),
      trendWord,
    ),
    products: collapseTrend(
      unlocked.map((item) => ({ name: item.name, dir: trend.products[item.id] ?? 0 })),
      trendWord,
    ),
    demand: collapseTrend(
      unlocked.map((item) => ({ name: item.name, dir: demandDirOf(climateId, item) })),
      demandWord,
    ),
    quota: collapseTrend(
      materials.map((mat) => ({
        name: mat.name,
        dir: quotaDirOf(climateId, mat.id, trend.materials[mat.id] ?? 0),
      })),
      quotaWord,
    ),
  };
}

export function emptyQuarterStats(
  startStaff: number,
  startDebt: number,
  startCash = 0,
  startMachines = 1,
): QuarterStats {
  return {
    sold: 0,
    peakCash: 0,
    coveringMonth: false,
    coveringMonths: 0,
    repaid: false,
    borrowed: false,
    playedCard: false,
    nonBasic: false,
    nonBasicSold: 0,
    stockoutAB: false,
    stockoutA: false,
    stockoutB: false,
    premiumOrSpecial: false,
    startStaff,
    startDebt,
    startCash,
    startMachines,
    hired: 0,
    boughtQty: 0,
  };
}

function staffOf(state: GameState): number {
  return (
    state.staff.production +
    state.staff.management +
    state.staff.sales +
    state.staff.rd +
    (state.staff.procurement ?? 0)
  );
}

function netOf(state: GameState): number {
  return state.lastReport?.netAssets ?? 0;
}

function coveringCount(state: GameState): number {
  return state.quarterStats.coveringMonths ?? (state.quarterStats.coveringMonth ? 1 : 0);
}

function pickItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function shuffleItems<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i]!;
    next[i] = next[j]!;
    next[j] = current;
  }
  return next;
}

export const GOALS: GoalDef[] = [
  {
    id: 'q1-net20',
    quarter: 1,
    kind: 'basic',
    name: '守住净资产垫',
    desc: '第一季度结束时，净资产不低于 20 万。',
    axis: 'net',
    reached: (state) => netOf(state) >= 20,
    progress: (state) =>
      state.lastReport ? `最近结算净资产 ${state.lastReport.netAssets}万 / 20万` : '待第一次月度结算后对照',
  },
  {
    id: 'q1-cash10',
    quarter: 1,
    kind: 'basic',
    name: '账上留住现金',
    desc: '第一季度结束时，现金不低于 10 万。',
    axis: 'cash',
    climateAffinity: ['steel', 'priceWar'],
    reached: (state) => state.cash >= 10,
    progress: (state) => `现金 ${state.cash}万 / 10万`,
  },
  {
    id: 'q1-sold18',
    quarter: 1,
    kind: 'basic',
    name: '产线先转起来',
    desc: '本季累计售出不少于 18 件。',
    axis: 'volume',
    climateAffinity: ['channel'],
    reached: (state) => state.quarterStats.sold >= 18,
    progress: (state) => `已售 ${state.quarterStats.sold} / 18 件`,
  },
  {
    id: 'q1-sold30',
    quarter: 1,
    kind: 'challenge',
    name: '本季走量达标',
    desc: '本季累计售出不少于 30 件。',
    axis: 'volume',
    climateAffinity: ['channel'],
    reached: (state) => state.quarterStats.sold >= 30,
    progress: (state) => `已售 ${state.quarterStats.sold} / 30 件`,
  },
  {
    id: 'q1-stock',
    quarter: 1,
    kind: 'challenge',
    name: '钢材与塑料不断档',
    desc: '本季钢材和塑料从未同时见底。',
    axis: 'stock',
    climateAffinity: ['steel'],
    reached: (state) => !state.quarterStats.stockoutAB,
    progress: (state) => (state.quarterStats.stockoutAB ? '已同时见底' : '尚未同时见底'),
  },
  {
    id: 'q1-steel',
    quarter: 1,
    kind: 'challenge',
    name: '钢材不断档',
    desc: '本季钢材库存从未见底。',
    axis: 'stock',
    climateAffinity: ['steel'],
    reached: (state) => !state.quarterStats.stockoutA,
    progress: (state) => (state.quarterStats.stockoutA ? '钢材已见底' : '钢材尚未见底'),
  },
  {
    id: 'q1-crew',
    quarter: 1,
    kind: 'challenge',
    name: '编制不缩',
    desc: '季末编制不少于开季人数。',
    axis: 'staff',
    reached: (state) => staffOf(state) >= state.quarterStats.startStaff,
    progress: (state) => `编制 ${staffOf(state)} / 开季 ${state.quarterStats.startStaff}`,
  },
  {
    id: 'q1-mix',
    quarter: 1,
    kind: 'challenge',
    name: '试产非基础款',
    desc: '本季至少交付一次非基础款订单。',
    axis: 'product',
    climateAffinity: ['chip'],
    reached: (state) => state.quarterStats.nonBasic,
    progress: (state) => (state.quarterStats.nonBasic ? '已完成一次' : '尚未交付非基础款'),
  },
  {
    id: 'q1-cash16',
    quarter: 1,
    kind: 'challenge',
    name: '现金留到 16 万',
    desc: '第一季度结束时，现金不低于 16 万。',
    axis: 'cash',
    climateAffinity: ['priceWar'],
    reached: (state) => state.cash >= 16,
    progress: (state) => `现金 ${state.cash}万 / 16万`,
  },
  {
    id: 'q1-nodebt',
    quarter: 1,
    kind: 'challenge',
    name: '本季不举债',
    desc: '开季至今未新增短期借款，且季末无债。',
    axis: 'debt',
    reached: (state) => !state.quarterStats.borrowed && state.debt <= 0,
    progress: (state) =>
      state.quarterStats.borrowed || state.debt > 0 ? '本季已动用借款' : '尚未举债',
  },
  {
    id: 'q2-payroll',
    quarter: 2,
    kind: 'basic',
    name: '工资备付充足',
    desc: '第二季度结束时，现金不低于应付职工薪酬。',
    axis: 'cash',
    reached: (state) => state.cash >= state.wagesPayable,
    progress: (state) => `现金 ${state.cash}万 / 应付职工薪酬 ${state.wagesPayable}万`,
  },
  {
    id: 'q2-cash12',
    quarter: 2,
    kind: 'basic',
    name: '现金不低于 12 万',
    desc: '第二季度结束时，现金不低于 12 万。',
    axis: 'cash',
    climateAffinity: ['steel', 'priceWar'],
    reached: (state) => state.cash >= 12,
    progress: (state) => `现金 ${state.cash}万 / 12万`,
  },
  {
    id: 'q2-sold24',
    quarter: 2,
    kind: 'basic',
    name: '本季走量不断',
    desc: '本季累计售出不少于 24 件。',
    axis: 'volume',
    climateAffinity: ['channel'],
    reached: (state) => state.quarterStats.sold >= 24,
    progress: (state) => `已售 ${state.quarterStats.sold} / 24 件`,
  },
  {
    id: 'q2-machine',
    quarter: 2,
    kind: 'challenge',
    name: '完成第二台设备安装',
    desc: '设备达到 2 台。',
    axis: 'machine',
    reached: (state) => state.machines >= 2,
    progress: (state) => `设备 ${state.machines} / 2 台`,
  },
  {
    id: 'q2-staff6',
    quarter: 2,
    kind: 'challenge',
    name: '编制扩到 6 人',
    desc: '在岗编制达到 6 人。',
    axis: 'staff',
    reached: (state) => staffOf(state) >= 6,
    progress: (state) => `编制 ${staffOf(state)} / 6 人`,
  },
  {
    id: 'q2-hire2',
    quarter: 2,
    kind: 'challenge',
    name: '本季招满两人',
    desc: '本季至少完成 2 次招聘。',
    axis: 'staff',
    reached: (state) => (state.quarterStats.hired ?? 0) >= 2,
    progress: (state) => `本季招聘 ${state.quarterStats.hired ?? 0} / 2 人`,
  },
  {
    id: 'q2-debt',
    quarter: 2,
    kind: 'challenge',
    name: '本季完成一次还款或全程无债',
    desc: '本季还过一次短期借款，或开季至今未新增负债且季末无债。',
    axis: 'debt',
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
    name: '提案落地一次',
    desc: '本季至少落地 1 份提案。',
    axis: 'card',
    reached: (state) => state.quarterStats.playedCard,
    progress: (state) => (state.quarterStats.playedCard ? '已落地提案' : '尚未落地'),
  },
  {
    id: 'q2-cash20',
    quarter: 2,
    kind: 'challenge',
    name: '现金峰值到 20 万',
    desc: '本季现金峰值达到 20 万。',
    axis: 'cash',
    climateAffinity: ['priceWar'],
    reached: (state) => state.quarterStats.peakCash >= 20,
    progress: (state) => `本季现金峰值 ${state.quarterStats.peakCash} / 20 万`,
  },
  {
    id: 'q2-standard',
    quarter: 2,
    kind: 'challenge',
    name: '标准款交过货',
    desc: '本季至少售出 1 件非基础款。',
    axis: 'product',
    climateAffinity: ['chip', 'channel'],
    reached: (state) => state.quarterStats.nonBasic,
    progress: (state) => (state.quarterStats.nonBasic ? '已交付非基础款' : '尚未交付非基础款'),
  },
  {
    id: 'q3-profit',
    quarter: 3,
    kind: 'basic',
    name: '至少一个月覆盖费用',
    desc: '本季至少有一个月，营业收入覆盖当月薪酬与厂区维护。',
    axis: 'cover',
    climateAffinity: ['priceWar'],
    reached: (state) => state.quarterStats.coveringMonth,
    progress: (state) => (state.quarterStats.coveringMonth ? '已有一个月覆盖费用' : '尚未出现覆盖月'),
  },
  {
    id: 'q3-sold36',
    quarter: 3,
    kind: 'basic',
    name: '本季出货不断',
    desc: '本季累计售出不少于 36 件。',
    axis: 'volume',
    climateAffinity: ['channel'],
    reached: (state) => state.quarterStats.sold >= 36,
    progress: (state) => `已售 ${state.quarterStats.sold} / 36 件`,
  },
  {
    id: 'q3-cashWages',
    quarter: 3,
    kind: 'basic',
    name: '薪酬备付有余',
    desc: '第三季度结束时，现金不低于应付职工薪酬加 5 万。',
    axis: 'cash',
    climateAffinity: ['steel'],
    reached: (state) => state.cash >= state.wagesPayable + 5,
    progress: (state) => `现金 ${state.cash}万 / 应付职工薪酬+5 ${state.wagesPayable + 5}万`,
  },
  {
    id: 'q3-rd',
    quarter: 3,
    kind: 'challenge',
    name: '研发交付第一档',
    desc: '产品实验室完成至少一档交付。',
    axis: 'rd',
    climateAffinity: ['chip'],
    reached: (state) => state.rdUnlockIndex >= 1,
    progress: (state) => `研发交付 ${state.rdUnlockIndex} / 1 档`,
  },
  {
    id: 'q3-sales',
    quarter: 3,
    kind: 'challenge',
    name: '销售编制到 2 人',
    desc: '销售人员达到 2 人。',
    axis: 'sales',
    climateAffinity: ['channel'],
    reached: (state) => state.staff.sales >= 2,
    progress: (state) => `销售 ${state.staff.sales} / 2 人`,
  },
  {
    id: 'q3-line',
    quarter: 3,
    kind: 'challenge',
    name: '产线扩到 3 台设备',
    desc: '设备达到 3 台。',
    axis: 'machine',
    reached: (state) => state.machines >= 3,
    progress: (state) => `设备 ${state.machines} / 3 台`,
  },
  {
    id: 'q3-cash',
    quarter: 3,
    kind: 'challenge',
    name: '现金一度达到 30 万',
    desc: '本季现金峰值达到 30 万。',
    axis: 'cash',
    reached: (state) => state.quarterStats.peakCash >= 30,
    progress: (state) => `本季现金峰值 ${state.quarterStats.peakCash} / 30 万`,
  },
  {
    id: 'q3-cover2',
    quarter: 3,
    kind: 'challenge',
    name: '两个月覆盖费用',
    desc: '本季至少有两个月，营业收入覆盖当月薪酬与厂区维护。',
    axis: 'cover',
    climateAffinity: ['priceWar'],
    reached: (state) => coveringCount(state) >= 2,
    progress: (state) => `覆盖月 ${coveringCount(state)} / 2`,
  },
  {
    id: 'q3-mix8',
    quarter: 3,
    kind: 'challenge',
    name: '中高端走量',
    desc: '本季非基础款累计售出不少于 8 件。',
    axis: 'product',
    climateAffinity: ['chip'],
    reached: (state) => (state.quarterStats.nonBasicSold ?? 0) >= 8,
    progress: (state) => `非基础款已售 ${state.quarterStats.nonBasicSold ?? 0} / 8 件`,
  },
  {
    id: 'q3-nodebt',
    quarter: 3,
    kind: 'challenge',
    name: '季末无短期借款',
    desc: '第三季度结束时账上无短期借款。',
    axis: 'debt',
    reached: (state) => state.debt <= 0,
    progress: (state) => (state.debt <= 0 ? '当前无债' : '负债仍在'),
  },
  {
    id: 'q4-leverage',
    quarter: 4,
    kind: 'basic',
    name: '负债可控、净资产达标',
    desc: '季末短期借款不超过设备抵押上限，且净资产不低于 30 万。',
    axis: 'leverage',
    reached: (state) => state.debt <= state.machines * LOAN_PER_MACHINE && netOf(state) >= 30,
    progress: (state) => {
      const net = netOf(state);
      return `负债 ${state.debt}万 / 上限 ${state.machines * LOAN_PER_MACHINE}万，净资产 ${net}万 / 30万`;
    },
  },
  {
    id: 'q4-net40',
    quarter: 4,
    kind: 'basic',
    name: '净资产做到 40 万',
    desc: '季末净资产不低于 40 万。',
    axis: 'net',
    climateAffinity: ['priceWar'],
    reached: (state) => netOf(state) >= 40,
    progress: (state) => (state.lastReport ? `最近结算净资产 ${state.lastReport.netAssets}万 / 40万` : '待结算后对照'),
  },
  {
    id: 'q4-cash18',
    quarter: 4,
    kind: 'basic',
    name: '现金与杠杆都守住',
    desc: '季末现金不低于 18 万，且短期借款不超过设备抵押上限。',
    axis: 'cash',
    climateAffinity: ['steel'],
    reached: (state) => state.cash >= 18 && state.debt <= state.machines * LOAN_PER_MACHINE,
    progress: (state) => `现金 ${state.cash}万 / 18万，负债 ${state.debt}万 / 上限 ${state.machines * LOAN_PER_MACHINE}万`,
  },
  {
    id: 'q4-flagship',
    quarter: 4,
    kind: 'challenge',
    name: '旗舰或高端款出货',
    desc: '本季以旗舰款或高端自研款完成一次结算。',
    axis: 'product',
    climateAffinity: ['chip'],
    reached: (state) => state.quarterStats.premiumOrSpecial,
    progress: (state) => (state.quarterStats.premiumOrSpecial ? '已出货' : '尚未出货'),
  },
  {
    id: 'q4-clear',
    quarter: 4,
    kind: 'challenge',
    name: '借过债并全部还清',
    desc: '本局出现过负债，且季末已还清。',
    axis: 'debt',
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
    axis: 'debt',
    reached: (state) => state.debt <= 0,
    progress: (state) => (state.debt <= 0 ? '当前无债' : '负债仍在'),
  },
  {
    id: 'q4-net80',
    quarter: 4,
    kind: 'challenge',
    name: '净资产做到 80 万',
    desc: '季末净资产达到 80 万。',
    axis: 'net',
    reached: (state) => netOf(state) >= 80,
    progress: (state) =>
      state.lastReport ? `最近结算净资产 ${state.lastReport.netAssets}万 / 80万` : '待结算后对照',
  },
  {
    id: 'q4-rd2',
    quarter: 4,
    kind: 'challenge',
    name: '研发交付第二档',
    desc: '产品实验室完成两档交付。',
    axis: 'rd',
    climateAffinity: ['chip'],
    reached: (state) => state.rdUnlockIndex >= 2,
    progress: (state) => `研发交付 ${state.rdUnlockIndex} / 2 档`,
  },
  {
    id: 'q4-sold50',
    quarter: 4,
    kind: 'challenge',
    name: '本季走量冲 50',
    desc: '本季累计售出不少于 50 件。',
    axis: 'volume',
    climateAffinity: ['channel'],
    reached: (state) => state.quarterStats.sold >= 50,
    progress: (state) => `已售 ${state.quarterStats.sold} / 50 件`,
  },
  {
    id: 'q4-cash40',
    quarter: 4,
    kind: 'challenge',
    name: '现金峰值到 40 万',
    desc: '本季现金峰值达到 40 万。',
    axis: 'cash',
    climateAffinity: ['priceWar'],
    reached: (state) => state.quarterStats.peakCash >= 40,
    progress: (state) => `本季现金峰值 ${state.quarterStats.peakCash} / 40 万`,
  },
];

export function goalById(id: string): GoalDef {
  const found = GOALS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown goal ${id}`);
  return found;
}

export function basicCandidatesOf(quarter: 1 | 2 | 3 | 4): GoalDef[] {
  return GOALS.filter((item) => item.quarter === quarter && item.kind === 'basic');
}

export function challengeCandidatesOf(quarter: 1 | 2 | 3 | 4): GoalDef[] {
  return GOALS.filter((item) => item.quarter === quarter && item.kind === 'challenge');
}

export function basicGoalOf(quarter: 1 | 2 | 3 | 4): GoalDef {
  return basicCandidatesOf(quarter)[0]!;
}

export function challengePoolOf(quarter: 1 | 2 | 3 | 4): GoalDef[] {
  return challengeCandidatesOf(quarter);
}

export function dealBasicGoal(quarter: 1 | 2 | 3 | 4, climateId: ClimateId): GoalDef {
  const candidates = basicCandidatesOf(quarter);
  const weighted = candidates.flatMap((goal) => {
    const extra = goal.climateAffinity?.includes(climateId) ? 2 : 0;
    return Array.from({ length: 1 + extra }, () => goal);
  });
  return pickItem(weighted);
}

export function dealChallengePool(quarter: 1 | 2 | 3 | 4, climateId: ClimateId): GoalDef[] {
  const candidates = challengeCandidatesOf(quarter);
  const ranked = [...candidates].sort((a, b) => {
    const aw = (a.climateAffinity?.includes(climateId) ? 2 : 0) + Math.random();
    const bw = (b.climateAffinity?.includes(climateId) ? 2 : 0) + Math.random();
    return bw - aw;
  });
  const picked: GoalDef[] = [];
  const usedAxes = new Set<GoalAxis>();
  for (const goal of ranked) {
    if (usedAxes.has(goal.axis)) continue;
    picked.push(goal);
    usedAxes.add(goal.axis);
    if (picked.length === 4) break;
  }
  if (picked.length < 4) {
    for (const goal of ranked) {
      if (picked.some((item) => item.id === goal.id)) continue;
      picked.push(goal);
      if (picked.length === 4) break;
    }
  }
  return shuffleItems(picked);
}

export function currentBasicGoal(state: GameState): GoalDef {
  return state.basicGoalId ? goalById(state.basicGoalId) : basicGoalOf(state.quarter);
}

export function currentChallengePool(state: GameState): GoalDef[] {
  const ids = state.challengePoolIds ?? [];
  if (ids.length > 0) return ids.map((id) => goalById(id));
  return challengeCandidatesOf(state.quarter).slice(0, 4);
}

export function q3ProcurementFree(month: number): boolean {
  return month >= 7;
}
