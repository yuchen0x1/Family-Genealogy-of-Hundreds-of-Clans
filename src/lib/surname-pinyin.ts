/**
 * 姓氏检索键生成（纯函数，不依赖数据库）。
 *
 * `pinyinKeys` 同时服务于汉字 / 繁体 / 带调拼音 / 无调全拼 / 首字母 / 单个 ASCII 首字母
 * 多种检索方式。其中「单个 ASCII 首字母」是 A–Z 筛选的判据：姓氏读音常以带声调元音开头
 * （安 ān、鄂 è、欧 ōu、欧阳 ōu yáng），若直接对 `pinyin` 字段做 startsWith("a"/"e"/"o")
 * 会漏掉这些姓，因此这里显式写入去声调后的首字母。
 *
 * 从 `prisma/seed.ts` 抽出为纯函数后，可由单元测试直接验证该修复，无需连库重跑 seed。
 */
import { pinyin } from "pinyin-pro";

export function buildPinyinKeys(
  name: string,
  displayPinyin: string,
  traditional?: string | null,
): string[] {
  const plain = pinyin(name, { mode: "surname", toneType: "none", type: "array" })
    .join("").toLowerCase();
  const initials = pinyin(name, { mode: "surname", pattern: "first", toneType: "none", type: "array" })
    .join("").toLowerCase();
  const pinyinPlain = displayPinyin
    .replace(/[üǖǘǚǜ]/g, "v")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return Array.from(new Set([
    plain,
    initials,
    pinyinPlain,
    pinyinPlain.charAt(0),
    displayPinyin.replace(/\s+/g, ""),
    name,
    traditional ?? undefined,
  ].filter((v): v is string => Boolean(v))));
}
