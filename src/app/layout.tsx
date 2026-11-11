import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "中华寻根 · 百家族谱 | 姓氏文化与智能家族族谱平台",
    template: "%s | 中华寻根 · 百家族谱",
  },
  description:
    "查询中华姓氏起源、郡望堂号与历史人物，追溯祖籍与有据可查的迁徙记录；创建私有家族族谱，生成关系图谱，计算已知亲属称谓，管理家族档案。",
  keywords: ["中华姓氏", "百家姓", "族谱", "家谱", "寻根", "祖籍", "郡望", "堂号", "亲属关系"],
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col antialiased">
        <a href="#main-content" className="skip-link">跳到主要内容</a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
