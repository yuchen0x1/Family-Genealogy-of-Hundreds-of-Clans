import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  family: { findMany: vi.fn() },
  familyCollaborator: { findMany: vi.fn() },
  familyMember: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions", () => ({ visibleFamilyIds: vi.fn().mockResolvedValue([]) }));

import { searchAll } from "@/lib/search";

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
});
