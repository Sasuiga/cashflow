import type { CardDef, EventDef, MaterialDef, MaterialId, ProductDef, Role } from './types';

export const TOTAL_MONTHS = 12;
export const HAND_LIMIT = 5;
export const BASE_AP = 3;
export const MACHINE_COST = 100;
export const MACHINE_BOOK = 60;
export const MACHINE_BASE_CAP = 10;
export const WORKERS_PER_MACHINE = 4;
export const CAP_PER_WORKER = 5;
export const CAP_OVERFLOW = 2;
export const FACTORY_COST = 180;
export const FACTORY_BOOK = 110;
export const SLOTS_PER_FACTORY = 3;
export const FACTORY_UPKEEP = 6;
export const LOAN_PER_MACHINE = 80;
export const INTEREST_RATE = 0.02;
export const HIRE_COST = 12;
export const SALARY: Record<Role, number> = {
  production: 6,
  management: 10,
  sales: 8,
  rd: 12,
};
export const RD_THRESHOLD = 2;

export const MATERIALS: MaterialDef[] = [
  { id: 'a', name: '钢材', short: 'A', basePrice: 2 },
  { id: 'b', name: '塑料', short: 'B', basePrice: 3 },
  { id: 'c', name: '芯片', short: 'C', basePrice: 8 },
  { id: 'd', name: '特种合金', short: 'D', basePrice: 11 },
];

export const PRODUCTS: ProductDef[] = [
  {
    id: 'basic',
    name: '基础款',
    tier: '低端',
    bom: { a: 2, b: 1 },
    basePrice: 14,
    baseDemand: 48,
    blurb: '走量产品。BOM 简单，需求稳定，适合开局回血。',
  },
  {
    id: 'standard',
    name: '标准款',
    tier: '普通',
    bom: { a: 1, b: 2, c: 1 },
    basePrice: 28,
    baseDemand: 26,
    blurb: '利润更厚，但吃芯片。需求随销售扩张。',
  },
  {
    id: 'premium',
    name: '旗舰款',
    tier: '高端',
    bom: { b: 1, c: 2 },
    basePrice: 38,
    baseDemand: 12,
    blurb: '高单价、低需求。芯片行情好时是收割窗口。',
  },
  {
    id: 'economy',
    name: '经济款',
    tier: '研发',
    bom: { a: 1, b: 1 },
    basePrice: 11,
    baseDemand: 42,
    blurb: '研发成果：更省料的走量结构，适合产能过剩时。',
  },
  {
    id: 'special',
    name: '特种款',
    tier: '研发',
    bom: { b: 1, d: 1 },
    basePrice: 34,
    baseDemand: 18,
    blurb: '解锁特种合金后的高毛利产品。',
  },
];

export const RD_UNLOCKS: Array<{ product?: 'economy' | 'special'; unlockD?: boolean; note: string }> = [
  { product: 'economy', note: '研发交付：经济款上市，BOM 仅需钢材 + 塑料。' },
  { unlockD: true, product: 'special', note: '研发交付：特种合金开线，特种款可投产。' },
];

export const CARDS: CardDef[] = [
  {
    id: 'overtime',
    name: '加班赶工',
    suit: 'production',
    cost: 8,
    blurb: '本月产能 +12。用库存把行情吃满。',
    playText: '产线灯火通明，本月产能 +12。',
  },
  {
    id: 'kaizen',
    name: '现场改善',
    suit: 'production',
    cost: 6,
    blurb: '本月产能 +6，下一次采购九折。',
    playText: '产线节拍被拧紧，产能 +6，下次采购九折。',
  },
  {
    id: 'lean',
    name: '精益例会',
    suit: 'management',
    cost: 7,
    blurb: '立刻获得 1 点行动点。',
    playText: '会议很短，决定很快。行动点 +1。',
  },
  {
    id: 'bulk',
    name: '集采谈判',
    suit: 'management',
    cost: 9,
    blurb: '下一次原料采购七五折。',
    playText: '供应商松口了。下次采购七五折。',
  },
  {
    id: 'client',
    name: '大客户拜访',
    suit: 'sales',
    cost: 8,
    blurb: '本月所有产品需求 +16。',
    playText: '渠道被打开，本月需求 +16。',
  },
  {
    id: 'premiumPush',
    name: '高端发布',
    suit: 'sales',
    cost: 10,
    blurb: '本月售价 +18%。适合旗舰窗口。',
    playText: '发布会造成短时溢价，本月售价 +18%。',
  },
  {
    id: 'labRush',
    name: '实验室通宵',
    suit: 'rd',
    cost: 9,
    blurb: '立刻推进 1 点研发进度。',
    playText: '样品在天亮前跑通，研发进度 +1。',
  },
  {
    id: 'bridge',
    name: '过桥资金',
    suit: 'management',
    cost: 4,
    blurb: '立刻到账 ¥6.0万，同时增加等额负债。',
    playText: '现金到账，账上也多了一笔债。',
  },
];

export const EVENTS: EventDef[] = [
  {
    id: 'lockPrice',
    title: '钢厂锁价函',
    monthHint: '原料窗口',
    body: '钢材供应商愿意按现价锁一个月，但要预付订金。不锁的话，本月钢材可能继续上蹿。',
    choices: [
      { label: '预付锁价', hint: '支付 ¥4.0万，钢材价格本月下调 20%' },
      { label: '继续观望', hint: '钢材价格立刻上调 15%' },
    ],
  },
  {
    id: 'bigOrder',
    title: '连锁超市询盘',
    monthHint: '需求冲击',
    body: '一家连锁超市要基础款补货。接单能拉高需求，但若本月产不出货，会赔付违约金。',
    choices: [
      { label: '接下订单', hint: '本月需求 +22；若基础款销量低于 16，结算时赔 ¥5.0万' },
      { label: '礼貌拒绝', hint: '无事发生，渠道关系不变' },
    ],
  },
  {
    id: 'resign',
    title: '骨干递交辞呈',
    monthHint: '人事',
    body: '一名熟练生产工被对岸工厂挖走。你可以加薪挽留，或者让他走、省下工资。',
    choices: [
      { label: '加薪挽留', hint: '支付 ¥3.0万，生产人员不变' },
      { label: '放人离开', hint: '若有生产人员，失去 1 名；现金 +¥1.2万遣散结余' },
    ],
  },
  {
    id: 'banker',
    title: '客户经理上门',
    monthHint: '融资',
    body: '银行愿意突破设备抵押上限，提供一笔短贷。钱能救急，也会抬高利息负担。',
    choices: [
      { label: '接受短贷', hint: '现金与负债各 +¥8.0万' },
      { label: '维持稳健', hint: '无变化' },
    ],
  },
  {
    id: 'quality',
    title: '抽检通知',
    monthHint: '合规',
    body: '市监局要来抽检成品。花钱过检最稳；赌一把可能省钱，也可能被罚。',
    choices: [
      { label: '补检过关', hint: '支付 ¥2.5万' },
      { label: '赌抽不到', hint: '50% 无事，50% 罚款 ¥7.0万' },
    ],
  },
  {
    id: 'dump',
    title: '竞品低价倾销',
    monthHint: '价格战',
    body: '隔壁厂在清库存。跟进会伤毛利，不跟可能丢掉货架。',
    choices: [
      { label: '跟进降价', hint: '本月售价 -12%，需求 +10' },
      { label: '守住定位', hint: '本月需求 -8' },
    ],
  },
  {
    id: 'subsidy',
    title: '园区技改补贴',
    monthHint: '政策',
    body: '经开区发了一笔补贴名额。你可以贴设备，也可以贴招聘。',
    choices: [
      { label: '设备补贴', hint: '现金 +¥6.0万，仅可视为技改到账' },
      { label: '招聘补贴', hint: '现金 +¥3.0万，并立刻免费入职 1 名销售' },
    ],
  },
  {
    id: 'blackout',
    title: '限电通知',
    monthHint: '产能',
    body: '本周工业用电错峰。租发电机能保住排期，硬扛则产线停半拍。',
    choices: [
      { label: '租发电机', hint: '支付 ¥3.5万，产能不受影响' },
      { label: '接受限产', hint: '本月产能 -10' },
    ],
  },
  {
    id: 'influencer',
    title: '探厂直播邀约',
    monthHint: '品牌',
    body: '一位产业博主要来拍产线。投入接待能换来一波需求，拒绝则风平浪静。',
    choices: [
      { label: '投入接待', hint: '支付 ¥2.0万，本月需求 +14，售价 +6%' },
      { label: '婉拒拍摄', hint: '无变化' },
    ],
  },
  {
    id: 'tax',
    title: '税务约谈',
    monthHint: '现金流',
    body: '金税系统标红了进项波动。补税最快；请顾问更贵，但能保住账面。',
    choices: [
      { label: '直接补税', hint: '支付 ¥4.0万' },
      { label: '请顾问周旋', hint: '支付 ¥1.5万，下一次采购九折' },
    ],
  },
  {
    id: 'poach',
    title: '研发被挖角',
    monthHint: '研发',
    body: '猎头盯上了你的实验室。你可以加码留下团队，或者用项目奖金换进度。',
    choices: [
      { label: '加码留人', hint: '支付 ¥3.0万；若已有研发，进度 +1' },
      { label: '发项目奖', hint: '支付 ¥1.0万，研发进度 +1（无需现有研发人员）' },
    ],
  },
  {
    id: 'yearEnd',
    title: '渠道压货',
    monthHint: '旺季',
    body: '经销商希望提前锁货。答允能抬需求，也意味着你得真的产得出来。',
    choices: [
      { label: '答应压货', hint: '本月需求 +18，售价 -5%' },
      { label: '按单生产', hint: '无变化' },
    ],
  },
];

export const MATERIAL_IDS: MaterialId[] = ['a', 'b', 'c', 'd'];

export function productById(id: string): ProductDef {
  const found = PRODUCTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown product ${id}`);
  return found;
}

export function cardById(id: string): CardDef {
  const found = CARDS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
}

export function eventById(id: string): EventDef {
  const found = EVENTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown event ${id}`);
  return found;
}

export function materialById(id: MaterialId): MaterialDef {
  return MATERIALS.find((item) => item.id === id)!;
}
