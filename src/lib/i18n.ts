export type Locale = "zh-CN" | "en-US";
export type LocaleSetting = "auto" | Locale;

export const LOCALES: Locale[] = ["zh-CN", "en-US"];

export function resolveLocale(setting: LocaleSetting = "auto", candidates: readonly string[] = []): Locale {
  if (setting === "zh-CN" || setting === "en-US") return setting;
  for (const candidate of candidates.length ? candidates : ["zh-CN"]) {
    const value = String(candidate).toLowerCase();
    if (value === "en" || value.startsWith("en-")) return "en-US";
    if (value === "zh" || value.startsWith("zh-")) return "zh-CN";
  }
  return "zh-CN";
}

function browserStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

export function readLocaleSetting(storage: Storage | undefined = browserStorage()): LocaleSetting {
  try {
    const value = storage?.getItem("family-genealogy:locale");
    return value === "zh-CN" || value === "en-US" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function writeLocaleSetting(value: string, storage: Storage | undefined = browserStorage()): LocaleSetting {
  const setting: LocaleSetting = value === "zh-CN" || value === "en-US" ? value : "auto";
  try { storage?.setItem("family-genealogy:locale", setting); } catch { /* private browsing */ }
  return setting;
}

const CATALOG = {
  "zh-CN": {
    home: "首页", surnames: "百家姓", roots: "历史寻根", families: "族谱中心", community: "宗亲社区",
    search: "搜索姓氏、人物、祖籍、族谱…", searchMobile: "搜索姓氏、人物、祖籍…", searchAria: "全站搜索",
    mainNav: "主导航", userMenu: "用户菜单", profile: "个人中心", myFamilies: "我的族谱", admin: "管理后台",
    login: "登录", register: "注册", logout: "退出登录", closeMenu: "关闭菜单", openMenu: "展开菜单",
    language: "语言 / Language", auto: "自动 / Auto", simplified: "简体中文", english: "English",
  },
  "en-US": {
    home: "Home", surnames: "Surnames", roots: "Roots", families: "Family Trees", community: "Community",
    search: "Search surnames, people, origins, family trees…", searchMobile: "Search surnames, people, origins…", searchAria: "Site search",
    mainNav: "Primary navigation", userMenu: "User menu", profile: "Profile", myFamilies: "My family trees", admin: "Admin console",
    login: "Sign in", register: "Register", logout: "Sign out", closeMenu: "Close menu", openMenu: "Open menu",
    language: "Language / 语言", auto: "Auto / 自动", simplified: "简体中文", english: "English",
  },
} as const;

export type MessageKey = keyof typeof CATALOG["zh-CN"];
export function t(locale: Locale, key: MessageKey): string { return CATALOG[locale][key] || CATALOG["zh-CN"][key]; }
