import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ family: { findFirst: vi.fn() }, familyCollaborator: { findUnique: vi.fn() }, familyMember: { findMany: vi.fn() }, familyRelationship: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn().mockResolvedValue(null) }));
import { buildPartialGraph } from "@/lib/genealogy";
import { GET as graph } from "@/app/api/families/[id]/graph/route";
import { GET as duplicates } from "@/app/api/families/[id]/duplicates/route";
import { GET as quality } from "@/app/api/families/[id]/quality/route";
import { GET as imports } from "@/app/api/families/[id]/import/route";
import { GET as importDetail } from "@/app/api/families/[id]/import/[jobId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  db.family.findFirst.mockResolvedValue({ ownerId: "owner", visibility: "PUBLIC", isDemo: false });
  db.familyRelationship.findMany.mockResolvedValue([]);
});
describe("公开访客隐私边界", () => {
  it.each([[true, "PRIVATE", false], [true, "FAMILY", false], [false, "PRIVATE", false], [false, "FAMILY", true], [true, "PUBLIC", true]])("图谱在世 %s / 可见性 %s 年代可读 %s", async (isLiving, visibility, visible) => {
    db.familyMember.findMany.mockResolvedValue([{ id: "a", surnameText: "陈", givenName: "甲", gender: "MALE", birthYear: 1950, deathYear: 2000, isLiving, visibility }]);
    const result = await buildPartialGraph("f", "a", 0, 0, false);
    expect(result.nodes[0].birthYear).toBe(visible ? 1950 : null);
    expect(result.nodes[0].deathYear).toBe(visible ? 2000 : null);
    expect((await buildPartialGraph("f", "a", 0, 0, true)).nodes[0].birthYear).toBe(1950);
  });
  it("图谱 up/down=0 保留零层语义且禁止缓存隐私响应", async () => {
    db.familyMember.findMany.mockResolvedValue(["a", "b"].map((id) => ({ id, surnameText: "陈", givenName: id, gender: "MALE", visibility: "PUBLIC", isLiving: false })));
    db.familyRelationship.findMany.mockResolvedValue([{ id: "r", fromPersonId: "a", toPersonId: "b", type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED" }]);
    const response = await graph(new NextRequest("http://localhost/api/families/f/graph?focus=a&up=0&down=0"), { params: Promise.resolve({ id: "f" }) });
    expect((await response.json()).data.nodes).toHaveLength(1);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("体检、重复核对、导入报告在读取人物之前拒绝公开访客", async () => {
    for (const handler of [duplicates, quality, imports, importDetail]) {
      const response = await handler(new NextRequest("http://localhost/api/families/f/quality"), { params: Promise.resolve({ id: "f", jobId: "j" }) });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("REVIEW_FORBIDDEN");
    }
    expect(db.familyMember.findMany).not.toHaveBeenCalled();
  });
});
