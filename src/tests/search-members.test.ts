import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  family: { findMany: vi.fn() },
  familyCollaborator: { findMany: vi.fn() },
  familyMember: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions", () => ({ visibleFamilyIds: vi.fn().mockResolvedValue([]) }));

import { searchAll } from "@/lib/search";
import { visibleFamilyIds } from "@/lib/permissions";

const user = {
  id: "user-1",
  email: "user@example.com",
  displayName: "测试用户",
  roles: [],
  permissions: [],
  isAdmin: false,
};

describe("全站人物搜索", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.family.findMany.mockResolvedValue([]);
    db.familyMember.findMany.mockResolvedValue([]);
    db.familyMember.count.mockResolvedValue(0);
  });

  it("按姓氏检索时包含 surnameText 条件", async () => {
    await searchAll("陈", null, { categories: ["members"] });
    const where = db.familyMember.findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual(expect.arrayContaining([
      { surnameText: { contains: "陈", mode: "insensitive" } },
    ]));
  });

  it("匿名搜索只返回公开人物或家族可见的已故人物", async () => {
    await searchAll("陈", null, { categories: ["members"] });
    const where = db.familyMember.findMany.mock.calls[0]?.[0]?.where;
    expect(where.AND).toEqual([{
      OR: [
        { visibility: "PUBLIC" },
        { isLiving: false, visibility: "FAMILY" },
      ],
    }]);
  });

  it("已登录且拥有家族时仍不会越权看到其他公开族谱的在世受限人物", async () => {
    vi.mocked(visibleFamilyIds).mockResolvedValueOnce(["own-family"]);
    await searchAll("陈", user, { categories: ["members"] });
    const where = db.familyMember.findMany.mock.calls[0]?.[0]?.where;
    // 自己的家族可看全部；其他公开族谱仍需 visibility=PUBLIC 或已故 FAMILY
    expect(where.AND).toEqual([{
      OR: [
        { visibility: "PUBLIC" },
        { isLiving: false, visibility: "FAMILY" },
        { familyId: { in: ["own-family"] } },
      ],
    }]);
  });
});
