import { describe, it, expect } from "vitest";
import { Visibility, FamilyPermissionCode } from "@prisma/client";
import { canViewPersonDetails, type FamilyAccess } from "@/lib/permissions";

function access(level: FamilyPermissionCode | null, visibility: Visibility = Visibility.PUBLIC): FamilyAccess {
  return { level, isOwner: level === "OWNER", visibility, isDemo: false };
}

const person = (isLiving: boolean, visibility: Visibility) => ({ isLiving, visibility });

describe("canViewPersonDetails 人物详情可见矩阵", () => {
  it("家族协作者（任意级别）始终可见", () => {
    for (const level of ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as FamilyPermissionCode[]) {
      expect(canViewPersonDetails(access(level, Visibility.PRIVATE), person(true, Visibility.PRIVATE))).toBe(true);
    }
  });

  it("非协作者 + 私有族谱一律不可见", () => {
    expect(canViewPersonDetails(access(null, Visibility.PRIVATE), person(false, Visibility.PUBLIC))).toBe(false);
    expect(canViewPersonDetails(access(null, Visibility.FAMILY), person(false, Visibility.PUBLIC))).toBe(false);
  });

  it("公开族谱 + 人物 PUBLIC 可见", () => {
    expect(canViewPersonDetails(access(null), person(true, Visibility.PUBLIC))).toBe(true);
    expect(canViewPersonDetails(access(null), person(false, Visibility.PUBLIC))).toBe(true);
  });

  it("公开族谱 + 在世且非 PUBLIC 只展示姓名，不展示详情", () => {
    expect(canViewPersonDetails(access(null), person(true, Visibility.FAMILY))).toBe(false);
    expect(canViewPersonDetails(access(null), person(true, Visibility.PRIVATE))).toBe(false);
  });

  it("公开族谱 + 已故 FAMILY 可见（公开族谱读者口径）", () => {
    expect(canViewPersonDetails(access(null), person(false, Visibility.FAMILY))).toBe(true);
  });

  it("公开族谱 + 已故 PRIVATE 不可见（尊重显式 PRIVATE，防止生平/日期泄漏）", () => {
    expect(canViewPersonDetails(access(null), person(false, Visibility.PRIVATE))).toBe(false);
  });
});
