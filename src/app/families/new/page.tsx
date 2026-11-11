import type { Metadata } from "next";
import { FamilyCreateForm } from "@/components/family/family-create-form";
import { SectionTitle } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "创建族谱 · 中华寻根" };

export default function NewFamilyPage() {
  return (
    <div className="paper-bg">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <SectionTitle eyebrow="NEW GENEALOGY" title="创建家族族谱" description="为你的家族建立一份独立族谱。创建后即可添加人物、登记关系、维护字辈与分支。" />
        <FamilyCreateForm />
      </div>
    </div>
  );
}
