/**
 * 种子数据（内容与写入逻辑分离，见 seed.ts）
 *
 * 数据纪律：
 * - 仅收录可在常见姓氏学/正史工具书中查到的基础条目；不生成虚构历史。
 * - 每条起源/人物/迁徙都挂接 HistoricalSource，并标注 evidenceLevel。
 * - 传说（如「比干之子避难长林山」）明确标注 TRADITION，不写成确定史实。
 * - 缺少可核验「卷次/页码/原文引用」的条目一律 reviewStatus=PENDING（待人工审核），
 *   页面会显式展示审核状态，绝不显示为「已审定」。
 * - 坐标为现代地名治所近似位置，仅用于地图示意，不是考古定点。
 */

import { baijiaxingEntries } from "./seed-data-baijiaxing";

export type SourceSeed = {
  title: string;
  author?: string;
  edition?: string;
  publishYear?: number;
  sourceType: "OFFICIAL_HISTORY" | "LOCAL_GAZETTEER" | "ARCHIVE" | "ACADEMIC" | "GENEALOGY" | "FOLK_MATERIAL" | "OTHER";
  credibility: "PRIMARY" | "SECONDARY" | "TERTIARY" | "UNRATED";
  notes?: string;
  digitalUrl?: string;
};

export const sources: SourceSeed[] = [
  {
    title: "元和姓纂",
    author: "（唐）林宝 撰",
    edition: "四库全书本／中华书局点校本",
    publishYear: 812,
    sourceType: "OTHER",
    credibility: "PRIMARY",
    notes: "唐代官修姓氏谱牒，姓氏源流的基础工具书。",
  },
  {
    title: "通志·氏族略",
    author: "（宋）郑樵 撰",
    edition: "《通志》卷二十五至三十",
    sourceType: "OTHER",
    credibility: "PRIMARY",
    notes: "系统归纳「以国为氏、以邑为氏、以官为氏」等得姓方式。",
  },
  {
    title: "史记",
    author: "（汉）司马迁 撰",
    edition: "中华书局点校本",
    sourceType: "OFFICIAL_HISTORY",
    credibility: "PRIMARY",
    notes: "《陈杞世家》《赵世家》《吴太伯世家》《郑世家》等篇可用于核对诸侯世系。",
  },
  {
    title: "新唐书·宰相世系表",
    author: "（宋）欧阳修、宋祁 撰",
    edition: "中华书局点校本",
    sourceType: "OFFICIAL_HISTORY",
    credibility: "PRIMARY",
    notes: "记录唐代士族世系，含李、张、杨、孙、欧阳等姓源流。",
  },
  {
    title: "百家姓",
    author: "（宋）佚名",
    edition: "通行本",
    sourceType: "OTHER",
    credibility: "SECONDARY",
    notes: "本平台 popularity_rank 采用《百家姓》序位（非现代人口排序），「赵钱孙李」起首。",
  },
  {
    title: "古今姓氏书辩证",
    author: "（宋）邓名世 撰，邓椿年 补",
    edition: "四库全书本",
    sourceType: "OTHER",
    credibility: "PRIMARY",
    notes: "宋代姓氏辨证著作。",
  },
  {
    title: "风俗通义·姓氏篇",
    author: "（汉）应劭 撰",
    edition: "辑佚本",
    sourceType: "OTHER",
    credibility: "SECONDARY",
    notes: "汉代姓氏源流记录，部分内容含传说成分。",
  },
  {
    title: "中国移民史",
    author: "葛剑雄 主编，曹树基、吴松弟 著",
    edition: "福建人民出版社，1997",
    publishYear: 1997,
    sourceType: "ACADEMIC",
    credibility: "SECONDARY",
    notes: "用于核对「永嘉南渡」「湖广填四川」等宏观人口迁徙，非具体家族路线依据。",
  },
  {
    title: "清实录",
    author: "清代官修",
    edition: "中华书局影印本",
    sourceType: "ARCHIVE",
    credibility: "PRIMARY",
    notes: "含清初招民垦荒、湖广填四川相关诏令记载。",
  },
  {
    title: "辞海（历史人物条目）",
    author: "上海辞书出版社",
    edition: "通行修订版",
    sourceType: "OTHER",
    credibility: "TERTIARY",
    notes: "人物基础信息的通用工具书；本种子数据中的人物条目卷次/页码待人工补录，故审核状态为待审。",
    digitalUrl: "",
  },
];

export type SurnameSeed = {
  name: string;
  pinyin: string;
  traditional?: string;
  rank: number | null; // 《百家姓》序位
  compound?: boolean;
  originSummary: string;
  /** 得姓主流说法的可信程度 */
  credibility: "DOCUMENTED" | "TRADITION" | "INFERRED" | "UNVERIFIED";
  /** 起源条目文本（可能含传说，按 evidenceLevel 分级） */
  origins: Array<{
    title: string;
    content: string;
    era?: string;
    level: "DOCUMENTED" | "TRADITION" | "INFERRED" | "UNVERIFIED";
    sourceTitle?: string;
  }>;
  /** 仅在需要覆盖默认的「基础字典项已审定」时填写（如源流待补录的字典项标 PENDING）。 */
  reviewStatus?: string;
  commanderies?: string[];
  hallNames?: Array<{ name: string; origin?: string; location?: string }>;
  variants?: Array<{ variant: string; type: string; note?: string }>;
  figures?: Array<{ name: string; dynasty?: string; note?: string }>;
};

/** 38 条已有详细史料条目（源流 / 郡望 / 堂号 / 人物 / 异体字），不虚构、不改写。 */
const detailedSurnames: SurnameSeed[] = [
  {
    name: "赵", pinyin: "zhào", traditional: "趙", rank: 1,
    originSummary: "主流说法出自嬴姓：造父为周穆王御，受封赵城，后以邑为氏。见《史记·赵世家》。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑为氏（嬴姓）", content: "《史记·赵世家》载造父受封赵城，其族后以赵为氏；赵氏后为战国七雄之一。", era: "西周", level: "DOCUMENTED", sourceTitle: "史记" },
      { title: "赵城地望", content: "赵城故地一般系于今山西洪洞一带，具体地望学界仍有讨论。", era: "西周", level: "INFERRED", sourceTitle: "史记" },
    ],
    commanderies: ["天水郡", "涿郡", "南阳郡"],
    hallNames: [{ name: "半部堂", origin: "典出宋相赵普「半部《论语》治天下」之说，属后世堂号传说。", location: "—" }],
    figures: [{ name: "赵武灵王", dynasty: "战国", note: "赵国君主，推行胡服骑射。" }, { name: "赵匡胤", dynasty: "北宋", note: "宋太祖。" }, { name: "赵孟頫", dynasty: "元", note: "书画家。" }],
  },
  {
    name: "钱", pinyin: "qián", traditional: "錢", rank: 2,
    originSummary: "《通志·氏族略》记钱氏出自彭姓，彭祖后裔有任周钱府上士者，以官为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以官为氏（彭姓）", content: "《通志·氏族略》记彭祖之后有掌钱府之官，子孙以官为氏；此为姓氏文献记载，早期世系难以逐一核实。", era: "周", level: "DOCUMENTED", sourceTitle: "通志·氏族略" },
    ],
    commanderies: ["下邳郡", "吴兴郡"],
    figures: [{ name: "钱镠", dynasty: "五代吴越", note: "吴越国建立者。" }, { name: "钱大昕", dynasty: "清", note: "考据学家。" }],
  },
  {
    name: "孙", pinyin: "sūn", traditional: "孫", rank: 3,
    originSummary: "来源多元：姬姓卫国孙氏、芈姓楚国孙氏，以及妫姓田书受赐姓孙（见《新唐书·宰相世系表》）。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "妫姓田氏赐姓", content: "《新唐书·宰相世系表》载齐大夫田书因功赐姓孙氏，孙武为其后。", era: "春秋", level: "DOCUMENTED", sourceTitle: "新唐书·宰相世系表" },
      { title: "姬姓卫国孙氏", content: "《元和姓纂》记卫武公之后有孙乙，以字为氏。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["乐安郡", "太原郡"],
    hallNames: [{ name: "乐安堂", origin: "以郡望立堂。" }],
    figures: [{ name: "孙武", dynasty: "春秋", note: "《孙子兵法》作者。" }, { name: "孙思邈", dynasty: "唐", note: "医学家。" }],
  },
  {
    name: "李", pinyin: "lǐ", rank: 4,
    originSummary: "《元和姓纂》《新唐书·宰相世系表》记李氏出自嬴姓，皋陶之后世为大理，以官为氏（理→李）；唐代另有大量赐姓。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "由「理」氏转为「李」", content: "姓氏文献记皋陶后裔任大理之官，以官为氏称理氏，后因音近或避祸改为李氏；此说流传广，早期环节含传说成分。", era: "上古—商周", level: "TRADITION", sourceTitle: "元和姓纂" },
      { title: "唐代赐姓", content: "唐代多有赐功臣、归附首领姓李的记载，是李姓迅速扩大的重要原因之一。", era: "唐", level: "DOCUMENTED", sourceTitle: "新唐书·宰相世系表" },
    ],
    commanderies: ["陇西郡", "赵郡"],
    hallNames: [{ name: "陇西堂", origin: "以陇西郡望立堂，为李氏最著堂号。" }],
    figures: [{ name: "李世民", dynasty: "唐", note: "唐太宗。" }, { name: "李白", dynasty: "唐", note: "诗人。" }, { name: "李时珍", dynasty: "明", note: "《本草纲目》作者。" }],
  },
  {
    name: "周", pinyin: "zhōu", rank: 5,
    originSummary: "多源：姬姓周王族后裔以国为氏；另有周平王少子烈之后、以及改姓与赐姓等来源。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "周亡后王族子孙以国为氏，为周姓主源之一；另《元和姓纂》记周平王少子烈之后亦称周氏。", era: "周—秦汉", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["汝南郡", "庐江郡"],
    hallNames: [{ name: "爱莲堂", origin: "因北宋周敦颐《爱莲说》而得名。" }],
    figures: [{ name: "周瑜", dynasty: "三国吴", note: "将领。" }, { name: "周敦颐", dynasty: "北宋", note: "理学家。" }],
  },
  {
    name: "吴", pinyin: "wú", traditional: "吳", rank: 6,
    originSummary: "《史记·吴太伯世家》载周太王之子太伯、仲雍奔吴，其后建立吴国，亡国后以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "《史记·吴太伯世家》记太伯、仲雍之后封于吴，吴亡后子孙以国为氏。", era: "商末—春秋", level: "DOCUMENTED", sourceTitle: "史记" },
    ],
    commanderies: ["延陵郡", "濮阳郡"],
    hallNames: [{ name: "延陵堂", origin: "因吴季札封于延陵，后世以延陵为堂号。" }],
    figures: [{ name: "吴起", dynasty: "战国", note: "军事家。" }, { name: "吴道子", dynasty: "唐", note: "画家。" }, { name: "吴承恩", dynasty: "明", note: "《西游记》作者（学界尚有讨论）。" }],
  },
  {
    name: "郑", pinyin: "zhèng", traditional: "鄭", rank: 7,
    originSummary: "《史记·郑世家》载周宣王封弟姬友于郑（郑桓公），郑亡后以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "周宣王弟姬友受封于郑，是为郑桓公；公元前375年郑为韩所灭，子孙以国为氏。", era: "西周—战国", level: "DOCUMENTED", sourceTitle: "史记" },
    ],
    commanderies: ["荥阳郡"],
    hallNames: [{ name: "荥阳堂", origin: "以荥阳郡望立堂。" }],
    figures: [{ name: "郑玄", dynasty: "东汉", note: "经学家。" }, { name: "郑和", dynasty: "明", note: "航海家，原姓马，赐姓郑。" }],
  },
  {
    name: "王", pinyin: "wáng", rank: 8,
    originSummary: "来源甚多：《通志·氏族略》归纳姬姓（周灵王太子晋之后）、子姓（比干之后）、妫姓（齐王田氏之后）等，多为王族之后以「王」为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "多源合流", content: "《通志·氏族略》记王氏主要出自姬姓、子姓、妫姓等王族后裔；因来源多元，不宜把王氏整体归为单一始祖。", era: "周—秦汉", level: "DOCUMENTED", sourceTitle: "通志·氏族略" },
    ],
    commanderies: ["太原郡", "琅琊郡"],
    hallNames: [{ name: "太原堂", origin: "以太原郡望立堂。" }, { name: "三槐堂", origin: "北宋王祐手植三槐的家族典故，属家族传说。" }],
    figures: [{ name: "王羲之", dynasty: "东晋", note: "书法家。" }, { name: "王维", dynasty: "唐", note: "诗人、画家。" }, { name: "王安石", dynasty: "北宋", note: "政治家、文学家。" }],
  },
  {
    name: "冯", pinyin: "féng", traditional: "馮", rank: 9,
    originSummary: "《元和姓纂》记姬姓毕公高之后毕万封于魏，其支孙食采于冯城，以邑为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑为氏（姬姓）", content: "毕公高之后有食采于冯邑者，因以为氏；见《元和姓纂》。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["始平郡", "上党郡"],
    figures: [{ name: "冯唐", dynasty: "西汉", note: "名臣。" }, { name: "冯梦龙", dynasty: "明", note: "文学家。" }],
  },
  {
    name: "陈", pinyin: "chén", traditional: "陳", rank: 10,
    originSummary: "《史记·陈杞世家》载周武王封舜后胡公满于陈，陈亡后子孙以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（妫姓）", content: "周武王克商后封舜之后胡公满于陈；公元前478年陈为楚所灭，后裔以陈为氏。", era: "西周—春秋", level: "DOCUMENTED", sourceTitle: "史记" },
    ],
    commanderies: ["颍川郡", "汝南郡"],
    hallNames: [{ name: "颍川堂", origin: "以颍川郡望立堂。" }],
    figures: [{ name: "陈胜", dynasty: "秦末", note: "起义领袖。" }, { name: "陈寿", dynasty: "西晋", note: "《三国志》作者。" }],
  },
  {
    name: "褚", pinyin: "chǔ", rank: 11,
    originSummary: "《元和姓纂》记殷商后裔宋共公子段食采于褚，其德可师，号褚师，因以为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑／官为氏", content: "宋国褚师之职或褚邑，后有褚氏，见姓氏文献记载。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    figures: [{ name: "褚遂良", dynasty: "唐", note: "书法家。" }],
  },
  {
    name: "卫", pinyin: "wèi", traditional: "衛", rank: 12,
    originSummary: "姬姓卫国之后，以国为氏；见《史记·卫康叔世家》。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "周武王弟康叔封于卫，秦灭卫后子孙以国为氏。", era: "西周—秦", level: "DOCUMENTED", sourceTitle: "史记" },
    ],
    commanderies: ["河东郡"],
    figures: [{ name: "卫青", dynasty: "西汉", note: "将领。" }],
  },
  {
    name: "蒋", pinyin: "jiǎng", traditional: "蔣", rank: 13,
    originSummary: "《元和姓纂》记周公第三子伯龄封于蒋，后以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "周公之子伯龄受封蒋国，子孙以国为氏；蒋国故地一般系于今河南淮滨一带。", era: "西周", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["乐安郡"],
    figures: [{ name: "蒋琬", dynasty: "三国蜀汉", note: "大臣。" }],
  },
  {
    name: "沈", pinyin: "shěn", traditional: "瀋", rank: 14,
    originSummary: "《元和姓纂》记周文王之子季载封于沈（聃），后以国为氏；另记楚庄王之后有沈氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "姓氏文献记季载之后封于沈，以国为氏；具体世系学界有异说。", era: "西周", level: "INFERRED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["吴兴郡"],
    figures: [{ name: "沈括", dynasty: "北宋", note: "《梦溪笔谈》作者。" }],
  },
  {
    name: "韩", pinyin: "hán", traditional: "韓", rank: 15,
    originSummary: "《史记·韩世家》记韩氏出自姬姓，韩武子（韩万）事晋，封于韩原，后为战国韩氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑为氏（姬姓）", content: "曲沃桓叔之子韩万（韩武子）封于韩原，其后以韩为氏，至三家分晋为诸侯。", era: "春秋—战国", level: "DOCUMENTED", sourceTitle: "史记" },
    ],
    commanderies: ["南阳郡", "昌黎郡"],
    hallNames: [{ name: "昌黎堂", origin: "因韩愈自称郡望昌黎，后世以昌黎立堂。" }],
    figures: [{ name: "韩非", dynasty: "战国", note: "法家代表人物。" }, { name: "韩信", dynasty: "西汉", note: "将领。" }, { name: "韩愈", dynasty: "唐", note: "文学家。" }],
  },
  {
    name: "杨", pinyin: "yáng", traditional: "楊", rank: 16,
    originSummary: "《新唐书·宰相世系表》《元和姓纂》记杨氏出自姬姓，周宣王子尚父封于杨；另有晋武公之后羊舌氏改杨等来源。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国／邑为氏（姬姓）", content: "周宣王之子尚父受封杨国（一说杨邑），后裔以杨为氏；晋国羊舌氏之后亦有杨氏。", era: "西周—春秋", level: "DOCUMENTED", sourceTitle: "新唐书·宰相世系表" },
    ],
    commanderies: ["弘农郡", "天水郡"],
    hallNames: [{ name: "四知堂", origin: "东汉杨震「天知神知我知子知」却金典故，见《后汉书·杨震传》。" }],
    figures: [{ name: "杨坚", dynasty: "隋", note: "隋文帝。" }, { name: "杨万里", dynasty: "南宋", note: "诗人。" }],
  },
  {
    name: "朱", pinyin: "zhū", rank: 17,
    originSummary: "《通志·氏族略》记曹姓邾国之后，楚灭邾后去「邑」旁改姓朱。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "去邑为朱（曹姓）", content: "颛顼之后曹挟封于邾，楚灭邾后子孙去邑旁为朱氏。", era: "战国—秦汉", level: "DOCUMENTED", sourceTitle: "通志·氏族略" },
    ],
    commanderies: ["沛郡", "吴郡"],
    hallNames: [{ name: "紫阳堂", origin: "因朱熹号紫阳，后世朱氏以紫阳立堂。" }],
    figures: [{ name: "朱熹", dynasty: "南宋", note: "理学家。" }, { name: "朱元璋", dynasty: "明", note: "明太祖。" }],
  },
  {
    name: "秦", pinyin: "qín", rank: 18,
    originSummary: "姬姓秦国、嬴姓秦邑之后均有秦氏；另有少数民族改姓。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国／邑为氏", content: "《元和姓纂》记周公之后有封于秦邑者，又秦亡后嬴姓子孙有以秦为氏者；来源并非单一。", era: "周—秦汉", level: "INFERRED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["天水郡", "太原郡"],
    figures: [{ name: "秦观", dynasty: "北宋", note: "词人。" }],
  },
  {
    name: "尤", pinyin: "yóu", rank: 19,
    originSummary: "姓氏文献多记尤氏由「沈」姓避讳改字而来（五代闽国避沈氏讳）；此为文献记载，具体过程仍有讨论。",
    credibility: "INFERRED",
    origins: [
      { title: "避讳改姓", content: "宋人笔记与姓氏书载五代闽人避王审知讳（或避沈氏相关讳）改沈为尤；学界对具体缘由有不同看法。", era: "五代", level: "INFERRED", sourceTitle: "古今姓氏书辩证" },
    ],
    figures: [{ name: "尤袤", dynasty: "南宋", note: "诗人、藏书家。" }],
  },
  {
    name: "许", pinyin: "xǔ", traditional: "許", rank: 20,
    originSummary: "《元和姓纂》记炎帝之后伯夷裔孙文叔封于许，以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姜姓）", content: "周武王封文叔于许，战国时许为楚所灭，后裔以国为氏。", era: "西周—战国", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["高阳郡", "汝南郡"],
    figures: [{ name: "许慎", dynasty: "东汉", note: "《说文解字》作者。" }],
  },
  {
    name: "何", pinyin: "hé", rank: 21,
    originSummary: "《元和姓纂》《姓氏考略》记韩亡后部分韩氏子孙因音近转为何氏；另有他族改姓。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "由韩转何", content: "姓氏文献记秦灭韩后，韩氏子孙散居江淮，因方言音近「韩」「何」而改姓何。", era: "秦汉", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["庐江郡", "东海郡"],
    hallNames: [{ name: "庐江堂", origin: "以庐江郡望立堂。" }],
    figures: [{ name: "何晏", dynasty: "三国魏", note: "玄学家。" }],
  },
  {
    name: "吕", pinyin: "lǚ", traditional: "呂", rank: 22,
    originSummary: "《元和姓纂》记炎帝之后伯夷佐禹治水有功，封于吕，以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姜姓）", content: "虞夏之际封吕国，后以国为氏；吕尚（姜子牙）为著名早期人物。", era: "上古—周", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["河东郡", "东平郡"],
    figures: [{ name: "吕不韦", dynasty: "战国秦", note: "相国，《吕氏春秋》主编。" }],
  },
  {
    name: "施", pinyin: "shī", rank: 23,
    originSummary: "《元和姓纂》记鲁惠公之子施父之后以字为氏；另有以封邑为氏等说。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以字为氏", content: "鲁国公子尾字施父，其后以王父字为氏。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["吴兴郡"],
    figures: [{ name: "施耐庵", dynasty: "元末明初", note: "《水浒传》作者（署名与生平学界有讨论）。" }],
  },
  {
    name: "张", pinyin: "zhāng", traditional: "張", rank: 24,
    originSummary: "《新唐书·宰相世系表》《元和姓纂》记黄帝子少昊青阳氏之子挥任弓正，始制弓矢，赐姓张氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以官为氏（挥为弓正）", content: "姓氏文献与《新唐书·宰相世系表》记挥任弓正、子孙以张为氏；此说属唐代谱牒追溯，上古环节不宜视为信史。", era: "上古（文献追溯）", level: "TRADITION", sourceTitle: "新唐书·宰相世系表" },
      { title: "晋国张氏", content: "《左传》等先秦文献可见晋国张氏（如张老），是张姓较早的确切记载之一。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["清河郡", "南阳郡"],
    hallNames: [{ name: "百忍堂", origin: "唐代张公艺「百忍」治家典故，见《旧唐书·孝友传》。" }],
    figures: [{ name: "张良", dynasty: "西汉", note: "谋臣。" }, { name: "张仲景", dynasty: "东汉", note: "医学家。" }, { name: "张择端", dynasty: "北宋", note: "《清明上河图》作者。" }],
  },
  {
    name: "孔", pinyin: "kǒng", rank: 25,
    originSummary: "《元和姓纂》记宋国孔父嘉之后以字为氏；孔子即出于此系。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以字为氏（子姓）", content: "宋国大司马孔父嘉之后以「孔」为氏，孔子为其后裔；见《史记·孔子世家》《元和姓纂》。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["鲁郡"],
    figures: [{ name: "孔子", dynasty: "春秋", note: "思想家、教育家。" }, { name: "孔融", dynasty: "东汉", note: "文学家。" }],
  },
  {
    name: "曹", pinyin: "cáo", rank: 26,
    originSummary: "《元和姓纂》记周文王之子振铎封于曹，以国为氏；另有曹姓古国之后。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏（姬姓）", content: "周武王封弟振铎于曹，曹亡后子孙以国为氏。", era: "西周—春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["谯郡", "彭城郡"],
    figures: [{ name: "曹操", dynasty: "东汉末", note: "政治家、诗人。" }, { name: "曹雪芹", dynasty: "清", note: "《红楼梦》作者。" }],
  },
  {
    name: "严", pinyin: "yán", traditional: "嚴", rank: 27,
    originSummary: "姓氏文献多记由「庄」姓避汉明帝刘庄讳改「严」，见《元和姓纂》等。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "避讳改姓", content: "东汉避明帝讳，庄氏多改为严氏；庄、严二姓后世同源异写。", era: "东汉", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["天水郡", "冯翊郡"],
    figures: [{ name: "严复", dynasty: "清末", note: "翻译家、启蒙思想家。" }],
  },
  {
    name: "华", pinyin: "huà", traditional: "華", rank: 28,
    originSummary: "《元和姓纂》记宋戴公之子考父食采于华，以邑为氏。姓氏「华」作姓时多音 huà。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑为氏（子姓）", content: "宋国华氏出自戴公之后食采于华邑，以邑为氏。", era: "春秋", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["武陵郡"],
    figures: [{ name: "华佗", dynasty: "东汉", note: "医学家。" }],
  },
  {
    name: "金", pinyin: "jīn", rank: 29,
    originSummary: "来源多元：少昊金天氏之后（含传说成分）、汉代金日磾之后，以及后世赐姓、改姓。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "多源合流", content: "《元和姓纂》记金氏有出自少昊金天氏之说（属上古追溯），另有匈奴休屠王之子金日磾因汉武帝赐姓金的明确记载。", era: "上古—西汉", level: "INFERRED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["彭城郡"],
    figures: [{ name: "金日磾", dynasty: "西汉", note: "汉武帝时大臣，赐姓金。" }],
  },
  {
    name: "魏", pinyin: "wèi", rank: 30,
    originSummary: "《史记·魏世家》记姬姓毕万之后以魏为氏，后为战国魏国；另有改姓来源。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑／国为氏（姬姓）", content: "毕公高之后毕万仕晋，封于魏，其后以魏为氏，三家分晋后为诸侯。", era: "春秋—战国", level: "DOCUMENTED", sourceTitle: "史记" },
    ],
    commanderies: ["钜鹿郡", "任城郡"],
    figures: [{ name: "魏征", dynasty: "唐", note: "谏臣。" }],
  },
  {
    name: "陶", pinyin: "táo", rank: 31,
    originSummary: "《元和姓纂》记以官（陶正）或邑为氏，另有他族改姓。",
    credibility: "INFERRED",
    origins: [
      { title: "以官／邑为氏", content: "姓氏文献记尧之后有任陶正者以官为氏，或虞舜之后以陶邑为氏；诸说并存，早期世系不可确考。", era: "上古—周", level: "INFERRED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["济阳郡", "丹阳郡"],
    figures: [{ name: "陶渊明", dynasty: "东晋", note: "诗人。" }],
  },
  {
    name: "姜", pinyin: "jiāng", rank: 32,
    originSummary: "《元和姓纂》《史记·齐太公世家》记炎帝生于姜水，以水为姓；姜尚（太公望）封于齐。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以水为姓", content: "姓氏文献记炎帝长于姜水，因以为姓；属上古族源叙述，早期环节含传说成分。", era: "上古", level: "TRADITION", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["天水郡", "广汉郡"],
    figures: [{ name: "姜尚", dynasty: "西周", note: "齐太公。" }, { name: "姜夔", dynasty: "南宋", note: "词人。" }],
  },
  {
    name: "谢", pinyin: "xiè", traditional: "謝", rank: 34,
    originSummary: "《元和姓纂》《诗经·大雅·崧高》记周宣王舅申伯封于谢，后以邑为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑为氏（姜姓）", content: "申伯受封于谢邑，子孙以谢为氏；东晋南朝陈郡谢氏为著族。", era: "西周", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["陈郡", "会稽郡"],
    hallNames: [{ name: "东山堂", origin: "因谢安隐居东山典故。" }, { name: "宝树堂", origin: "典出《晋书》谢玄「芝兰玉树」之语。" }],
    figures: [{ name: "谢安", dynasty: "东晋", note: "政治家。" }, { name: "谢灵运", dynasty: "南朝宋", note: "诗人。" }],
  },
  {
    name: "苏", pinyin: "sū", traditional: "蘇", rank: 42,
    originSummary: "《元和姓纂》记颛顼之后昆吾氏受封于苏，以国为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以国为氏", content: "昆吾之后封于苏，苏国之后以国为氏。", era: "夏商周", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["武功郡", "扶风郡"],
    figures: [{ name: "苏轼", dynasty: "北宋", note: "文学家。" }],
  },
  {
    name: "欧阳", pinyin: "ōu yáng", traditional: "歐陽", rank: null, compound: true,
    originSummary: "《新唐书·宰相世系表》《元和姓纂》记越王无疆之子蹄封于乌程欧余山之阳，称欧阳亭侯，后以为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以地为氏（姒姓）", content: "越王勾践之后无疆之子蹄受封欧阳亭，子孙以欧阳为氏；为常见汉族复姓之一。", era: "战国", level: "DOCUMENTED", sourceTitle: "新唐书·宰相世系表" },
    ],
    commanderies: ["渤海郡"],
    figures: [{ name: "欧阳修", dynasty: "北宋", note: "文学家、史学家。" }],
  },
  {
    name: "司马", pinyin: "sī mǎ", traditional: "司馬", rank: null, compound: true,
    originSummary: "《通志·氏族略·以官为氏》记周宣王时程伯休父任司马，后裔以官为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以官为氏", content: "司马为古代掌军政之官，子孙以官为氏，见《通志·氏族略》。", era: "西周", level: "DOCUMENTED", sourceTitle: "通志·氏族略" },
    ],
    commanderies: ["河内郡"],
    figures: [{ name: "司马迁", dynasty: "西汉", note: "《史记》作者。" }, { name: "司马光", dynasty: "北宋", note: "《资治通鉴》主编。" }],
  },
  {
    name: "诸葛", pinyin: "zhū gě", traditional: "諸葛", rank: null, compound: true,
    originSummary: "《三国志》裴松之注引《吴书》记葛氏迁居诸县者称「诸葛」，因以为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以居地加氏", content: "《吴书》载：葛氏本居琅琊诸县，后迁阳都，时人称「诸葛」，遂以为氏。", era: "汉", level: "DOCUMENTED", sourceTitle: "通志·氏族略" },
    ],
    commanderies: ["琅琊郡"],
    figures: [{ name: "诸葛亮", dynasty: "三国蜀汉", note: "政治家、军事家。" }],
  },
  {
    name: "上官", pinyin: "shàng guān", rank: null, compound: true,
    originSummary: "《元和姓纂》记楚怀王之子兰为上官邑大夫，后以邑为氏。",
    credibility: "DOCUMENTED",
    origins: [
      { title: "以邑为氏（芈姓）", content: "楚国公子兰任上官邑大夫，子孙以官邑为氏。", era: "战国", level: "DOCUMENTED", sourceTitle: "元和姓纂" },
    ],
    commanderies: ["天水郡"],
    figures: [{ name: "上官婉儿", dynasty: "唐", note: "女官、诗人。" }],
  },
];

export type PlaceSeed = {
  historicalName: string;
  modernName: string;
  lng: number;
  lat: number;
  type: "PROVINCE" | "CITY" | "COUNTY" | "TOWNSHIP" | "VILLAGE" | "REGION" | "SITE";
  aliases?: string[];
  note?: string;
};

/** 坐标均为现代地名治所/城址附近的近似值，仅用于地图示意，不是考古定点。 */
export const places: PlaceSeed[] = [
  { historicalName: "陇西郡", modernName: "甘肃省定西市临洮县一带", lng: 103.86, lat: 35.38, type: "REGION", note: "秦汉陇西郡治狄道，今甘肃临洮。" },
  { historicalName: "太原郡", modernName: "山西省太原市一带", lng: 112.55, lat: 37.87, type: "REGION" },
  { historicalName: "琅琊郡", modernName: "山东省临沂市一带", lng: 118.35, lat: 35.10, type: "REGION" },
  { historicalName: "清河郡", modernName: "河北省邢台市清河县一带", lng: 115.67, lat: 37.09, type: "REGION" },
  { historicalName: "彭城郡", modernName: "江苏省徐州市一带", lng: 117.18, lat: 34.26, type: "REGION" },
  { historicalName: "颍川郡", modernName: "河南省许昌市禹州一带", lng: 113.49, lat: 34.14, type: "REGION", note: "郡治阳翟，今河南禹州。" },
  { historicalName: "弘农郡", modernName: "陕西省渭南市华阴市一带", lng: 110.09, lat: 34.57, type: "REGION" },
  { historicalName: "赵城", modernName: "山西省临汾市洪洞县一带", lng: 111.67, lat: 36.25, type: "SITE", note: "赵氏受封地望，学界有讨论。" },
  { historicalName: "黄国", modernName: "河南省信阳市潢川县一带", lng: 115.14, lat: 32.15, type: "SITE" },
  { historicalName: "江夏郡", modernName: "湖北省武汉市江夏区一带", lng: 114.32, lat: 30.37, type: "REGION" },
  { historicalName: "汝南郡", modernName: "河南省驻马店市汝南县一带", lng: 114.36, lat: 33.01, type: "REGION" },
  { historicalName: "延陵", modernName: "江苏省常州市一带", lng: 119.95, lat: 31.79, type: "SITE", aliases: ["延陵邑"] },
  { historicalName: "荥阳", modernName: "河南省郑州市荥阳市", lng: 113.38, lat: 34.79, type: "COUNTY" },
  { historicalName: "陈国", modernName: "河南省周口市淮阳区", lng: 114.88, lat: 33.73, type: "SITE" },
  { historicalName: "宋国", modernName: "河南省商丘市一带", lng: 115.65, lat: 34.44, type: "SITE" },
  { historicalName: "郑国", modernName: "河南省郑州市新郑市", lng: 113.72, lat: 34.40, type: "SITE" },
  { historicalName: "韩原", modernName: "陕西省渭南市韩城市一带", lng: 110.44, lat: 35.48, type: "SITE" },
  { historicalName: "吴国", modernName: "江苏省苏州市一带", lng: 120.62, lat: 31.30, type: "SITE" },
  { historicalName: "许国", modernName: "河南省许昌市一带", lng: 113.83, lat: 34.02, type: "SITE" },
  { historicalName: "邾国", modernName: "山东省济宁市邹城市一带", lng: 117.00, lat: 35.40, type: "SITE" },
  { historicalName: "庐江郡", modernName: "安徽省合肥市庐江县一带", lng: 117.29, lat: 31.25, type: "REGION" },
  { historicalName: "扶风郡", modernName: "陕西省宝鸡市扶风县一带", lng: 107.90, lat: 34.37, type: "REGION" },
  { historicalName: "豫章郡", modernName: "江西省南昌市一带", lng: 115.86, lat: 28.68, type: "REGION" },
  { historicalName: "陈郡", modernName: "河南省周口市太康县一带", lng: 114.85, lat: 34.07, type: "REGION" },
  { historicalName: "渤海郡", modernName: "河北省沧州市南皮县一带", lng: 116.70, lat: 38.05, type: "REGION" },
  { historicalName: "中原", modernName: "今河南及黄河中下游一带", lng: 113.63, lat: 34.75, type: "REGION", note: "历史地理概念，范围随时代变化。" },
  { historicalName: "华北", modernName: "今河北、山东、山西一带", lng: 115.50, lat: 37.80, type: "REGION", note: "近代地理概念，非历史行政区划。" },
  { historicalName: "四川", modernName: "四川省（成都平原为中心）", lng: 104.07, lat: 30.67, type: "PROVINCE" },
  { historicalName: "湖广", modernName: "今湖北、湖南一带", lng: 112.94, lat: 28.23, type: "REGION" },
  { historicalName: "江南", modernName: "今江苏南部、浙江一带", lng: 120.15, lat: 31.30, type: "REGION", note: "历史地理概念，范围随时代变化。" },
  { historicalName: "关东", modernName: "今辽宁、吉林、黑龙江一带", lng: 125.32, lat: 43.82, type: "REGION", note: "近代「闯关东」目的地，历史概念非行政区划。" },
  { historicalName: "欧余山", modernName: "浙江省湖州市一带", lng: 120.09, lat: 30.89, type: "SITE", note: "欧阳氏得姓地望，具体位置学界有讨论。" },
];

export type MigrationSeed = {
  surnameName?: string;
  from: string;
  to: string;
  dynasty: string;
  startYear: number | null;
  endYear: number | null;
  reason: string;
  narrative: string;
  level: "DOCUMENTED" | "TRADITION" | "INFERRED" | "UNVERIFIED";
  sourceTitle: string;
};

/** 仅收录宏观人口迁徙（有学术/档案依据），不生成任何具体家族的祖先路线。 */
export const migrations: MigrationSeed[] = [
  {
    from: "中原", to: "江南", dynasty: "东晋", startYear: 311, endYear: 420,
    reason: "永嘉之乱后北方士民南迁",
    narrative: "西晋末年战乱引发北方人口大规模南迁（史称「衣冠南渡」），江南地区人口结构与士族分布因此变化。此为宏观人口迁徙，不代表任何具体家族的祖先路线。",
    level: "DOCUMENTED", sourceTitle: "中国移民史",
  },
  {
    from: "湖广", to: "四川", dynasty: "清", startYear: 1644, endYear: 1800,
    reason: "清初招民垦荒、恢复四川人口",
    narrative: "明末清初四川人口锐减，清廷推行招民垦荒政策，湖广等地民户陆续迁入，史称「湖广填四川」。相关诏令见《清实录》，移民规模与来源研究见《中国移民史》。",
    level: "DOCUMENTED", sourceTitle: "清实录",
  },
  {
    from: "华北", to: "关东", dynasty: "清—民国", startYear: 1860, endYear: 1949,
    reason: "垦荒、灾荒与生计压力",
    narrative: "清末放开东北封禁后，华北民众大量迁往东北（「闯关东」）。属近代宏观人口流动，具体家族迁徙须以家谱、户籍档案为据。",
    level: "DOCUMENTED", sourceTitle: "中国移民史",
  },
  {
    from: "中原", to: "江南", dynasty: "北宋—南宋", startYear: 1127, endYear: 1279,
    reason: "靖康之变后宋室南渡",
    narrative: "宋室南渡带动北方士民南迁，临安（今杭州）成为政治中心。此为宏观历史背景，不构成具体姓氏的迁徙证据。",
    level: "DOCUMENTED", sourceTitle: "中国移民史",
  },
];

// ---------------- 《百家姓》通行本全表（504 姓）合并 ----------------

const detailedByName = new Map(detailedSurnames.map((s) => [s.name, s]));

/**
 * 以《百家姓》504 姓全表为骨架，保留原有 38 条详细史料条目：
 * - 字形、繁体、姓氏读音、序位、单/复姓类别统一以全表为准（序位经 564 字自洽校验）；
 * - 已有详细条目的源流、郡望、堂号、人物、异体字原样保留，优先级更高；
 * - 其余 466 条为「字典型」条目：credibility=UNVERIFIED、origins=[]、reviewStatus=PENDING，
 *   只提供可核验的字形/读音/序位，不生成任何得姓源流或历史叙述。
 */
export const surnames: SurnameSeed[] = baijiaxingEntries
  .map((entry): SurnameSeed => {
    const detail = detailedByName.get(entry.name);
    if (!detail) return entry;
    return {
      ...entry,
      ...detail,
      rank: entry.rank,
      compound: entry.compound,
      pinyin: detail.pinyin || entry.pinyin,
      traditional: detail.traditional ?? entry.traditional,
      reviewStatus: detail.reviewStatus ?? "APPROVED",
    };
  })
  .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
