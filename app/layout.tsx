import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "新浪启皓、五栋物业日报",
  description: "物业部门快捷填报、管理员审核发布和甲方日报看板",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
