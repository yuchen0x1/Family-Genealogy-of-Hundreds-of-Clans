import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  db: {
    familyRelationship: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    familyDocument: { findFirst: vi.fn(), create: vi.fn() },
    documentVersion: { findFirst: vi.fn(), create: vi.fn() },
    familyMember: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  read: vi.fn(), write: vi.fn(), user: vi.fn(), snapshot: vi.fn(),
  getObject: vi.fn(), putObject: vi.fn(), deleteObject: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/permissions", async (original) => ({
  ...await original<typeof import("@/lib/permissions")>(),
  assertFamilyRead: mocks.read, assertFamilyWrite: mocks.write,
}));
vi.mock("@/lib/genealogy", async (original) => ({
  ...await original<typeof import("@/lib/genealogy")>(),
  createVersionSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/cache", () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  newStorageKey: () => "test/document/file.pdf",
  getObject: mocks.getObject, putObject: mocks.putObject, deleteObject: mocks.deleteObject,
}));

import { GET as relationshipDetail } from "@/app/api/families/[id]/relationships/[relationId]/route";
import { GET as relationshipList } from "@/app/api/families/[id]/relationships/route";
import { GET as download } from "@/app/api/families/[id]/documents/[docId]/download/route";
import { POST as upload } from "@/app/api/families/[id]/documents/route";
import { POST as createMember } from "@/app/api/families/[id]/members/route";
import { PATCH as updateMember } from "@/app/api/families/[id]/members/[memberId]/route";

const familyId = "11111111-1111-4111-8111-111111111111";
const entityId = "22222222-2222-4222-8222-222222222222";
const context = () => ({ params: Promise.resolve({ id: familyId, relationId: entityId, docId: entityId, memberId: entityId }) });
const access = { level: null, isOwner: false, visibility: "PUBLIC", isDemo: false };
const collaborator = { ...access, level: "EDITOR" };
const request = (path: string, method = "GET", body?: object) => new NextRequest(`http://localhost/api/families/${familyId}/${path}`, {
  method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
});
const document = {
  id: entityId, familyId, fileName: "archive.pdf", mimeType: "application/pdf", storageKey: "current.pdf",
  currentVersion: 3, visibility: "PUBLIC", reviewStatus: "APPROVED", deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(access);
  mocks.write.mockResolvedValue(collaborator);
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.db.familyDocument.findFirst.mockResolvedValue(document);
  mocks.getObject.mockResolvedValue({ bytes: Buffer.from("%PDF-current"), size: 12 });
  mocks.putObject.mockResolvedValue({ size: 9, checksum: "checksum" });
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.db) => unknown) => callback(mocks.db));
});

describe("relationship public metadata boundary", () => {
  const relation = {
    id: entityId, familyId, type: "SPOUSE", notes: "private source notes", sourceId: "source",
    documentId: "private-doc", createdById: "creator", document: null,
  };
  beforeEach(() => {
    mocks.db.familyRelationship.findFirst.mockResolvedValue(relation);
    mocks.db.familyRelationship.findMany.mockResolvedValue([relation]);
    mocks.db.familyRelationship.count.mockResolvedValue(1);
  });

  it("detail and list both hide internal notes, source, document and author IDs from visitors", async () => {
    const detail = (await (await relationshipDetail(request(`relationships/${entityId}`), context())).json()).data;
    const list = (await (await relationshipList(request("relationships"), context())).json()).data.items[0];
    for (const item of [detail, list]) {
      for (const field of ["notes", "sourceId", "documentId", "createdById"]) expect(item).not.toHaveProperty(field);
      expect(item.type).toBe("SPOUSE");
    }
  });

  it("collaborators retain editable relationship metadata", async () => {
    mocks.read.mockResolvedValue(collaborator);
    const detail = (await (await relationshipDetail(request(`relationships/${entityId}`), context())).json()).data;
    expect(detail.notes).toBe(relation.notes);
    expect(detail.documentId).toBe(relation.documentId);
  });
});

describe("document file boundaries", () => {
  it("visitors cannot download an older file using the current version's approval", async () => {
    const result = await download(request(`documents/${entityId}/download?version=1`), context());
    expect(result.status).toBe(404);
    expect(mocks.db.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("visitors can download the current approved version", async () => {
    mocks.db.documentVersion.findFirst.mockResolvedValue({ storageKey: "current.pdf" });
    const result = await download(request(`documents/${entityId}/download?version=3`), context());
    expect(result.status).toBe(200);
    expect(mocks.getObject).toHaveBeenCalledWith("current.pdf");
  });

  it("collaborators can still download historical versions", async () => {
    mocks.read.mockResolvedValue(collaborator);
    mocks.db.documentVersion.findFirst.mockResolvedValue({ storageKey: "old.pdf" });
    const result = await download(request(`documents/${entityId}/download?version=1`), context());
    expect(result.status).toBe(200);
    expect(mocks.getObject).toHaveBeenCalledWith("old.pdf");
  });

  it("a failed initial document transaction removes the newly written file", async () => {
    mocks.db.$transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = new FormData();
    body.set("title", "test archive");
    body.set("file", new File(["%PDF-test"], "test.pdf", { type: "application/pdf" }));
    try {
      const result = await upload(new NextRequest(`http://localhost/api/families/${familyId}/documents`, { method: "POST", body }), context());
      expect(result.status).toBe(500);
      expect(mocks.putObject).toHaveBeenCalledOnce();
      expect(mocks.deleteObject).toHaveBeenCalledWith("test/document/file.pdf");
    } finally { log.mockRestore(); }
  });
});

describe("member verification persists", () => {
  const member = { id: entityId, surnameText: "陈", givenName: "测试", gender: "UNKNOWN", isLiving: false, visibility: "PRIVATE", verification: "VERIFIED" };
  beforeEach(() => {
    mocks.db.familyMember.findFirst.mockResolvedValue(member);
    mocks.db.familyMember.create.mockImplementation(async ({ data }) => ({ ...member, ...data }));
    mocks.db.familyMember.update.mockImplementation(async ({ data }) => ({ ...member, ...data }));
  });

  it("creation stores the selected verification status", async () => {
    const result = await createMember(request("members", "POST", { surnameText: "陈", givenName: "测试", verification: "VERIFIED" }), context());
    expect(result.status).toBe(201);
    expect((await result.json()).data.verification).toBe("VERIFIED");
    expect(mocks.db.familyMember.create.mock.calls[0][0].data.verification).toBe("VERIFIED");
  });

  it("editing changes verification without overwriting omitted fields", async () => {
    const result = await updateMember(request(`members/${entityId}`, "PATCH", { verification: "DISPUTED" }), context());
    expect(result.status).toBe(200);
    expect((await result.json()).data.verification).toBe("DISPUTED");
    const patch = mocks.db.familyMember.update.mock.calls[0][0].data;
    expect(patch.verification).toBe("DISPUTED");
    expect(patch).not.toHaveProperty("surnameText");
    expect(patch).not.toHaveProperty("visibility");
    expect(patch).not.toHaveProperty("gender");
    expect(patch).not.toHaveProperty("isLiving");
  });
});
