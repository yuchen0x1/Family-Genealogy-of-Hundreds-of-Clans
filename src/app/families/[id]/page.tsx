import type { Metadata } from "next";
import { FamilyWorkspace } from "@/components/family/family-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "家族族谱 · 中华寻根",
  description: "查看家族关系图谱、人物档案、亲属关系、字辈分支与版本历史。",
};

export default async function FamilyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FamilyWorkspace familyId={id} />;
}
