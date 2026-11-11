/**
 * 《百家姓》通行本姓氏全表（504 姓：单姓 444、复姓 60）
 *
 * 数据纪律（与 seed-data.ts 一致，务必遵守）：
 * - 本模块只生成「字典型基础条目」：姓氏字形、繁体写法、姓氏专用读音、《百家姓》序位。
 *   这些是《百家姓》文本本身与通行字书可核验的客观信息，来源明确且唯一：
 *   宋·佚名《百家姓》通行本（公有领域），序位「赵钱孙李」起首，非现代人口排名。
 * - 不生成任何得姓源流、郡望、堂号、历史人物或迁徙叙述。无可靠史料宁可不写，
 *   详见 README「三条不可逾越的数据边界」与 seed-data.ts 顶部说明。
 * - 因此字典项 credibility = UNVERIFIED、origins = []、reviewStatus = PENDING；
 *   页面会明确显示「源流待补录」，绝不会被误认为「史料明确记载」。
 * - 已有的 38 条详细源流条目（seed-data.ts / detailedSurnames）在合并时原样保留，优先级更高。
 *
 * 切分与自洽校验：
 *   通行本四字一句共 142 句 568 字；去掉末句「百家姓终」为 141 句 564 字。
 *   前 102 句 = 408 个单姓（序位 1..408）。
 *   后 39 句 = 156 字，含 60 个复姓（120 字）与 36 个单姓，序位 409..504。
 *   合计 444 单姓 + 60 复姓 = 504 姓；444 + 60*2 = 564 字 ✓
 *   复姓名单据《百家姓》通行本及中文维基百科「复姓」条目所载 60 个复姓逐句切分，
 *   「仉督子车」「晋楚闫法」「呼延归海」「伯赏南宫」「第五言福」等句为单姓/复姓混排。
 *
 * 版本异文处理：底本取简体通行本（「荀羊於惠」「甄曲家封」「甘钭厉戎」「宁仇栾暴」），
 * 繁体写法与少数易混字形（于/於、郁/鬱、后/後、党/黨、锺/钟、谷/穀）在下方注释与映射表中保留说明。
 */

import { pinyin } from "pinyin-pro";

/** 与 seed-data.ts 的 SurnameSeed 结构兼容（不 import，避免循环依赖）。 */
export type BaijiaxingEntry = {
  name: string;
  pinyin: string;
  traditional?: string;
  /** 《百家姓》序位，1..504 */
  rank: number;
  compound?: boolean;
  originSummary: string;
  credibility: "DOCUMENTED" | "TRADITION" | "INFERRED" | "UNVERIFIED";
  origins: Array<{
    title: string;
    content: string;
    era?: string;
    level: "DOCUMENTED" | "TRADITION" | "INFERRED" | "UNVERIFIED";
    sourceTitle?: string;
  }>;
  /** 字典项未补录史料，审核状态保持待审；由 seed.ts 写入数据库。 */
  reviewStatus?: string;
};

/** 前 102 句：每句四个单姓，共 408 个单姓（序位 1..408）。 */
const SINGLE_LINES: string[] = [
  "赵钱孙李", "周吴郑王",
  "冯陈褚卫", "蒋沈韩杨",
  "朱秦尤许", "何吕施张",
  "孔曹严华", "金魏陶姜",
  "戚谢邹喻", "柏水窦章",
  "云苏潘葛", "奚范彭郎",
  "鲁韦昌马", "苗凤花方",
  "俞任袁柳", "酆鲍史唐",
  "费廉岑薛", "雷贺倪汤",
  "滕殷罗毕", "郝邬安常",
  "乐于时傅", "皮卞齐康",
  "伍余元卜", "顾孟平黄",
  "和穆萧尹", "姚邵湛汪",
  "祁毛禹狄", "米贝明臧",
  "计伏成戴", "谈宋茅庞",
  "熊纪舒屈", "项祝董梁",
  "杜阮蓝闵", "席季麻强",
  "贾路娄危", "江童颜郭",
  "梅盛林刁", "钟徐邱骆",
  "高夏蔡田", "樊胡凌霍",
  "虞万支柯", "昝管卢莫",
  "经房裘缪", "干解应宗",
  "丁宣贲邓", "郁单杭洪",
  "包诸左石", "崔吉钮龚",
  "程嵇邢滑", "裴陆荣翁",
  "荀羊於惠", "甄曲家封",
  "芮羿储靳", "汲邴糜松",
  "井段富巫", "乌焦巴弓",
  "牧隗山谷", "车侯宓蓬",
  "全郗班仰", "秋仲伊宫",
  "宁仇栾暴", "甘钭厉戎",
  "祖武符刘", "景詹束龙",
  "叶幸司韶", "郜黎蓟薄",
  "印宿白怀", "蒲邰从鄂",
  "索咸籍赖", "卓蔺屠蒙",
  "池乔阴鬱", "胥能苍双",
  "闻莘党翟", "谭贡劳逄",
  "姬申扶堵", "冉宰郦雍",
  "郤璩桑桂", "濮牛寿通",
  "边扈燕冀", "郏浦尚农",
  "温别庄晏", "柴瞿阎充",
  "慕连茹习", "宦艾鱼容",
  "向古易慎", "戈廖庾终",
  "暨居衡步", "都耿满弘",
  "匡国文寇", "广禄阙东",
  "欧殳沃利", "蔚越夔隆",
  "师巩厍聂", "晁勾敖融",
  "冷訾辛阚", "那简饶空",
  "曾毋沙乜", "养鞠须丰",
  "巢关蒯相", "查后荆红",
  "游竺权逯", "盖益桓公",
];

/**
 * 后 39 句：单姓 / 复姓混排，按 60 个复姓名单显式切分。
 * 每句 4 字，可拆成 2 个复姓、3 个姓（1 单 + 2 单 + 1 复 等）或 4 个单姓。
 */
const TAIL_LINES: string[][] = [
  ["万俟", "司马"],
  ["上官", "欧阳"],
  ["夏侯", "诸葛"],
  ["闻人", "东方"],
  ["赫连", "皇甫"],
  ["尉迟", "公羊"],
  ["澹台", "公冶"],
  ["宗政", "濮阳"],
  ["淳于", "单于"],
  ["太叔", "申屠"],
  ["公孙", "仲孙"],
  ["轩辕", "令狐"],
  ["钟离", "宇文"],
  ["长孙", "慕容"],
  ["鲜于", "闾丘"],
  ["司徒", "司空"],
  ["亓官", "司寇"],
  ["仉", "督", "子车"],
  ["颛孙", "端木"],
  ["巫马", "公西"],
  ["漆雕", "乐正"],
  ["壤驷", "公良"],
  ["拓跋", "夹谷"],
  ["宰父", "谷梁"],
  ["晋", "楚", "闫", "法"],
  ["汝", "鄢", "涂", "钦"],
  ["段干", "百里"],
  ["东郭", "南门"],
  ["呼延", "归", "海"],
  ["羊舌", "微生"],
  ["岳", "帅", "缑", "亢"],
  ["况", "後", "有", "琴"],
  ["梁丘", "左丘"],
  ["东门", "西门"],
  ["商", "牟", "佘", "佴"],
  ["伯", "赏", "南宫"],
  ["墨", "哈", "谯", "笪"],
  ["年", "爱", "阳", "佟"],
  ["第五", "言", "福"],
];

/** 单姓的简体→繁体映射（仅列有差异者，其余繁简同形不写 traditional）。 */
const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  赵: "趙", 钱: "錢", 孙: "孫", 吴: "吳", 郑: "鄭", 冯: "馮", 陈: "陳", 卫: "衛",
  蒋: "蔣", 韩: "韓", 杨: "楊", 许: "許", 吕: "呂", 张: "張", 严: "嚴", 华: "華",
  谢: "謝", 邹: "鄒", 窦: "竇", 云: "雲", 苏: "蘇", 鲁: "魯", 韦: "韋", 马: "馬",
  凤: "鳳", 鲍: "鮑", 费: "費", 贺: "賀", 汤: "湯", 罗: "羅", 毕: "畢", 邬: "鄔",
  乐: "樂", 时: "時", 齐: "齊", 顾: "顧", 黄: "黃", 萧: "蕭", 贝: "貝", 计: "計",
  谈: "談", 庞: "龐", 纪: "紀", 项: "項", 蓝: "藍", 闵: "閔", 强: "強", 贾: "賈",
  娄: "婁", 颜: "顏", 钟: "鍾", 骆: "駱", 万: "萬", 卢: "盧", 经: "經", 缪: "繆",
  应: "應", 贲: "賁", 邓: "鄧", 单: "單", 诸: "諸", 钮: "鈕", 龚: "龔", 陆: "陸",
  荣: "榮", 曲: "麴", 储: "儲", 乌: "烏", 车: "車", 宫: "宮", 宁: "甯", 栾: "欒",
  钭: "鈄", 厉: "厲", 刘: "劉", 龙: "龍", 叶: "葉", 蓟: "薊", 怀: "懷", 从: "從",
  赖: "賴", 蔺: "藺", 乔: "喬", 阴: "陰", 苍: "蒼", 双: "雙", 闻: "聞", 党: "黨",
  谭: "譚", 贡: "貢", 劳: "勞", 郦: "酈", 寿: "壽", 边: "邊", 农: "農", 温: "溫",
  别: "別", 庄: "莊", 阎: "閻", 连: "連", 习: "習", 鱼: "魚", 终: "終", 满: "滿",
  国: "國", 广: "廣", 禄: "祿", 阙: "闕", 东: "東", 欧: "歐", 师: "師", 巩: "鞏",
  厍: "厙", 聂: "聶", 阚: "闞", 简: "簡", 饶: "饒", 须: "須", 丰: "豐", 关: "關",
  荆: "荊", 红: "紅", 权: "權", 盖: "蓋", 养: "養", 闫: "閆",
};

/**
 * 复姓繁体：不能逐字套用单字映射（「万俟」的「万」读 mò，繁体仍写「万」，不可作「萬」；
 * 「谷梁」本字为「穀梁」）。故显式列出有差异的 60 个复姓中的繁体写法。
 */
const COMPOUND_TRADITIONAL: Record<string, string> = {
  司马: "司馬", 欧阳: "歐陽", 诸葛: "諸葛", 闻人: "聞人", 东方: "東方",
  赫连: "赫連", 尉迟: "尉遲", 澹台: "澹臺", 濮阳: "濮陽", 单于: "單于",
  公孙: "公孫", 仲孙: "仲孫", 轩辕: "軒轅", 钟离: "鍾離", 长孙: "長孫",
  鲜于: "鮮于", 闾丘: "閭丘", 子车: "子車", 颛孙: "顓孫", 巫马: "巫馬",
  乐正: "樂正", 壤驷: "壤駟", 夹谷: "夾谷", 谷梁: "穀梁", 东郭: "東郭",
  南门: "南門", 东门: "東門", 西门: "西門", 南宫: "南宮",
};

/**
 * 姓氏专用读音覆盖表（带声调）。依据：
 * - pinyin-pro `mode: "surname"` 已能处理 查 zhā / 解 xiè / 乐 yuè / 单 shàn / 仇 qiú / 区 ōu / 曾 zēng 等；
 * - 其余易错读音参考新华网《一读就错的68个姓氏》、人民日报《防尴尬指南》及通行字书：
 *   万俟 mò qí、尉迟 yù chí、澹台 tán tái、皇甫 huáng fǔ、长孙 zhǎng sūn、
 *   令狐 líng hú、宰父 zǎi fǔ、亓官 qí guān、厍 shè、钭 tǒu、逄 páng、
 *   郗 xī、郤 qiè、郏 jiá、郜 gào、郦 lì、蒯 kuǎi、殳 shū、昝 zǎn、逯 lù、
 *   麴 qū、璩 qú、隗 kuí、能 nài、於 yū、甯 nìng、乜 niè、佴 nài 等。
 * - 全部 60 个复姓显式给出读音，避免按普通词汇逐字误读（如「单于」「乐正」「长孙」）。
 */
const SURNAME_PINYIN: Record<string, string> = {
  // —— 单姓：pinyin-pro 姓氏模式之外仍需人工核定的读音 ——
  华: "huà", 乐: "yuè", 仇: "qiú", 单: "shàn", 解: "xiè", 查: "zhā",
  曾: "zēng", 那: "nā", 宓: "fú", 隗: "kuí", 郗: "xī", 郤: "qiè",
  郏: "jiá", 郜: "gào", 郦: "lì", 逄: "páng", 蒯: "kuǎi", 殳: "shū",
  厍: "shè", 昝: "zǎn", 逯: "lù", 曲: "qū", 璩: "qú", 能: "nài",
  於: "yū", 宁: "nìng", 乜: "niè", 佴: "nài", 钭: "tǒu", 缑: "gōu",
  笪: "dá", 谯: "qiáo", 佘: "shé", 哈: "hǎ", 盖: "gě", 缪: "miào",
  贲: "bēn", 翟: "zhái", 纪: "jǐ", 强: "qiáng", 相: "xiàng", 蔚: "wèi",
  宿: "sù", 薄: "bó", 燕: "yān", 都: "dū", 牟: "móu", 訾: "zī",
  阚: "kàn", 佟: "tóng", 仉: "zhǎng", 鄢: "yān", 亢: "kàng",
  阙: "quē", 鬱: "yù", 後: "hòu", 闫: "yán", 鞠: "jū",
  // —— 60 个复姓（全部显式，避免按普通词汇逐字误读）——
  万俟: "mò qí", 司马: "sī mǎ", 上官: "shàng guān", 欧阳: "ōu yáng",
  夏侯: "xià hóu", 诸葛: "zhū gě", 闻人: "wén rén", 东方: "dōng fāng",
  赫连: "hè lián", 皇甫: "huáng fǔ", 尉迟: "yù chí", 公羊: "gōng yáng",
  澹台: "tán tái", 公冶: "gōng yě", 宗政: "zōng zhèng", 濮阳: "pú yáng",
  淳于: "chún yú", 单于: "chán yú", 太叔: "tài shū", 申屠: "shēn tú",
  公孙: "gōng sūn", 仲孙: "zhòng sūn", 轩辕: "xuān yuán", 令狐: "líng hú",
  钟离: "zhōng lí", 宇文: "yǔ wén", 长孙: "zhǎng sūn", 慕容: "mù róng",
  鲜于: "xiān yú", 闾丘: "lǘ qiū", 司徒: "sī tú", 司空: "sī kōng",
  亓官: "qí guān", 司寇: "sī kòu", 子车: "zǐ jū", 颛孙: "zhuān sūn",
  端木: "duān mù", 巫马: "wū mǎ", 公西: "gōng xī", 漆雕: "qī diāo",
  乐正: "yuè zhèng", 壤驷: "rǎng sì", 公良: "gōng liáng", 拓跋: "tuò bá",
  夹谷: "jiá gǔ", 宰父: "zǎi fǔ", 谷梁: "gǔ liáng", 段干: "duàn gān",
  百里: "bǎi lǐ", 东郭: "dōng guō", 南门: "nán mén", 呼延: "hū yán",
  羊舌: "yáng shé", 微生: "wēi shēng", 梁丘: "liáng qiū", 左丘: "zuǒ qiū",
  东门: "dōng mén", 西门: "xī mén", 南宫: "nán gōng", 第五: "dì wǔ",
};

/** 少数易混字形的客观说明（字形/版本差异，不是得姓源流，不构成史实陈述）。 */
const SHAPE_NOTES: Record<string, string> = {
  郁: "《百家姓》另有『池乔阴鬱』之鬱姓，简化后与「郁」同形，本表保留原字形分列，二者并非同一条目。",
  鬱: "《百家姓》『池乔阴鬱』之鬱姓，今简化字多写作「郁」；与前文『郁单杭洪』之郁姓来源有别，故保留原字形以免混淆。",
  於: "姓氏读 yū，与『乐于时傅』之于姓（yú）为不同字形，不简化为「于」。",
  于: "与『荀羊於惠』之於姓（yū）为不同字形，不可混同。",
  宁: "《百家姓》原文作「甯」，姓读 nìng，与「寧」的简化字「宁」不同源。",
  后: "《百家姓》『查后荆红』之「后」（君后之后）；另有『况後有琴』之「後」姓，简化后同形，本表保留原字形分列。",
  後: "《百家姓》『况後有琴』之「後」姓（原文一作「郈」）；与前文『查后荆红』之「后」姓来源有别，故保留原字形以免混淆。",
  曲: "《百家姓》原文作「麴/麹」，简化后写作「曲」。",
  谷: "与复姓『宰父穀梁』之「穀」为不同字，简化后同形。",
  钟: "《百家姓》原文作「鍾」；复姓『鍾離』同用此字。",
  党: "《百家姓》原文作「黨」，简化后写作「党」。",
  万: "单姓读 wàn；复姓『万俟』读 mò qí，二者不同。",
  单: "单姓读 shàn；复姓『单于』读 chán yú，二者不同。",
  乐: "单姓读 yuè；复姓『乐正』读 yuè zhèng。",
  燕: "姓读 yān，不读 yàn。",
  盖: "姓读 gě（如盖叫天），不读 gài。",
  能: "姓读 nài，不读 néng。",
  那: "姓读 nā，不读 nà。",
  亓官: "《百家姓》原文或作「丌官」，孔子夫人亓官氏，读 qí guān。",
  子车: "《诗经·秦风·黄鸟》「子车奄息」，复姓读 zǐ jū。",
  第五: "汉有「第五」氏（如第五伦），以排行次序为氏。",
};

function traditionalOf(name: string, compound: boolean): string | undefined {
  // 复姓一律走显式表：表中未列出即繁简同形。
  // 不能逐字套单字映射，例如「万俟」的「万」读 mò 且繁体仍作「万」，转成「萬俟」是错的。
  if (compound) return COMPOUND_TRADITIONAL[name];
  const mapped = SIMPLIFIED_TO_TRADITIONAL[name] ?? name;
  return mapped === name ? undefined : mapped;
}

function pinyinOf(name: string): string {
  const override = SURNAME_PINYIN[name];
  if (override) return override;
  // 未被覆盖的单姓交给 pinyin-pro 的姓氏模式（已正确处理绝大多数多音姓氏）
  return pinyin(name, { mode: "surname", toneType: "symbol" });
}

function originSummaryOf(rank: number, compound: boolean, name: string): string {
  const kind = compound ? "复姓" : "单姓";
  const note = SHAPE_NOTES[name];
  const base =
    `《百家姓》通行本第 ${rank} 位（${kind}）。本条目仅收录可核验的字形、繁体写法、姓氏读音与《百家姓》序位，` +
    `资料来源：宋·佚名《百家姓》通行本。得姓源流、郡望堂号、历史人物及卷次页码等史料出处尚待补录，` +
    `暂不作任何史实陈述，请以平台后续审定的史料条目为准。`;
  return note ? `${base}【字形说明】${note}` : base;
}

/** 生成 504 条字典项，并在模块加载时做完整性自校验（任一不成立立即抛错，避免脏数据入库）。 */
function buildBaijiaxingEntries(): BaijiaxingEntry[] {
  const singleNames: string[] = [];
  for (const line of SINGLE_LINES) {
    if ([...line].length !== 4) throw new Error(`[百家姓] 单姓句字数异常: ${line}`);
    singleNames.push(...[...line]);
  }

  const tailNames: Array<{ name: string; compound: boolean }> = [];
  for (const line of TAIL_LINES) {
    const chars = line.join("");
    if ([...chars].length !== 4) throw new Error(`[百家姓] 尾段句字数异常: ${chars}`);
    for (const name of line) {
      tailNames.push({ name, compound: [...name].length === 2 });
    }
  }

  const all = [
    ...singleNames.map((name) => ({ name, compound: false })),
    ...tailNames,
  ];

  // 自洽校验：字符数、单/复姓数量、总数、序位唯一、姓名唯一
  const singleCount = all.filter((x) => !x.compound).length;
  const compoundCount = all.filter((x) => x.compound).length;
  const charCount = singleCount + compoundCount * 2;
  if (SINGLE_LINES.length !== 102) throw new Error("[百家姓] 前段应为 102 句");
  if (TAIL_LINES.length !== 39) throw new Error("[百家姓] 尾段应为 39 句");
  if (singleCount !== 444) throw new Error(`[百家姓] 单姓应为 444，实为 ${singleCount}`);
  if (compoundCount !== 60) throw new Error(`[百家姓] 复姓应为 60，实为 ${compoundCount}`);
  if (all.length !== 504) throw new Error(`[百家姓] 姓氏总数应为 504，实为 ${all.length}`);
  if (charCount !== 564) throw new Error(`[百家姓] 全文应为 564 字，实为 ${charCount}`);

  const seen = new Set<string>();
  for (const { name } of all) {
    if (seen.has(name)) throw new Error(`[百家姓] 姓氏重复: ${name}`);
    seen.add(name);
  }

  return all.map(({ name, compound }, index) => {
    const rank = index + 1;
    return {
      name,
      pinyin: pinyinOf(name),
      traditional: traditionalOf(name, compound),
      rank,
      compound: compound || undefined,
      originSummary: originSummaryOf(rank, compound, name),
      credibility: "UNVERIFIED" as const,
      origins: [],
      reviewStatus: "PENDING",
    };
  });
}

export const baijiaxingEntries: BaijiaxingEntry[] = buildBaijiaxingEntries();
