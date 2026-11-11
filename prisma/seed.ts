import { existsSync } from "node:fs";
import {
  PrismaClient,
  Prisma,
  PlaceType,
  EvidenceLevel,
  ReviewStatus,
  SourceType,
  SourceCredibility,
  Gender,
  Visibility,
  RelationType,
  RelationSubtype,
  VerificationStatus,
  FamilyPermissionCode,
  CollaboratorStatus,
  PostType,
  PostStatus,
} from "@prisma/client";
import { hashPassword, sha256 } from "../src/lib/crypto";
import { buildPinyinKeys } from "../src/lib/surname-pinyin";
import { sources, surnames, places, migrations } from "./seed-data";

if (existsSync(".env")) process.loadEnvFile(".env");

const prisma = new PrismaClient();

const ev = (v: string): EvidenceLevel => v as EvidenceLevel;
const st = (v: string): SourceType => v as SourceType;
const cr = (v: string): SourceCredibility => v as SourceCredibility;

async function main() {
  console.log("[seed] 开始写入基础数据…");

  // ---------------- 角色与权限 ----------------
  const roleDefs = [
    { key: "user", name: "普通用户", description: "注册用户的默认角色", permissions: ["profile:read", "family:create", "post:create", "document:upload"] },
    { key: "editor", name: "资料编辑", description: "可录入姓氏与史料，需审核后发布", permissions: ["surname:edit", "source:edit", "content:review"] },
    { key: "moderator", name: "内容审核", description: "审核史料、举报与社区内容", permissions: ["content:review", "report:handle", "post:moderate"] },
    { key: "admin", name: "系统管理员", description: "平台全量管理权限；不得绕过家族隐私读取私有族谱", permissions: ["*"] },
  ];
  for (const r of roleDefs) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, description: r.description },
      create: { key: r.key, name: r.name, description: r.description },
    });
    for (const code of r.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionCode: { roleId: (await prisma.role.findUniqueOrThrow({ where: { key: r.key } })).id, permissionCode: code } },
        update: {},
        create: { roleId: (await prisma.role.findUniqueOrThrow({ where: { key: r.key } })).id, permissionCode: code },
      });
    }
  }
  console.log(`[seed] 角色/权限 ${roleDefs.length} 组`);

  // ---------------- 用户 ----------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@xungen.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe_Admin_2026";
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      status: "ACTIVE",
      profile: { create: { displayName: "平台管理员", bio: "初始管理员账号，请在部署后立即修改密码。" } },
    },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  const demoEmail = "demo@xungen.local";
  const demoPassword = "Demo_Xungen_2026";
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      email: demoEmail,
      passwordHash: hashPassword(demoPassword),
      status: "ACTIVE",
      profile: { create: { displayName: "演示账号", bio: "仅用于体验演示族谱，非真实人物资料。" } },
    },
  });
  const userRole = await prisma.role.findUniqueOrThrow({ where: { key: "user" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: demoUser.id, roleId: userRole.id } },
    update: {},
    create: { userId: demoUser.id, roleId: userRole.id },
  });

  // ---------------- 系统配置 ----------------
  const settings = [
    { key: "site.name", value: "中华寻根 · 百家族谱", description: "站点名称" },
    { key: "privacy.family_default_visibility", value: "PRIVATE", description: "新建族谱默认隐私级别" },
    { key: "privacy.living_member_default_visibility", value: "PRIVATE", description: "在世人物默认隐私级别" },
    { key: "search.provider", value: "postgres_pgtrgm", description: "当前搜索实现（可升级为 meilisearch / opensearch）" },
    { key: "history.review_required", value: true, description: "历史资料录入后需审核才标记已审定" },
    { key: "clan.auto_merge_enabled", value: false, description: "禁止按同姓自动合并家族（恒为 false）" },
    { key: "kinship.require_verified_relations", value: true, description: "亲属称谓计算仅使用已核实关系" },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { description: s.description },
      create: { key: s.key, value: { value: s.value }, description: s.description },
    });
  }

  // ---------------- 史料来源 ----------------
  const sourceMap = new Map<string, string>();
  for (const s of sources) {
    const row = await prisma.historicalSource.upsert({
      where: { id: (await prisma.historicalSource.findFirst({ where: { title: s.title }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000" },
      update: {},
      create: {
        title: s.title,
        author: s.author ?? null,
        edition: s.edition ?? null,
        publishYear: s.publishYear ?? null,
        sourceType: st(s.sourceType),
        credibility: cr(s.credibility),
        reviewStatus: ReviewStatus.PENDING,
        notes: s.notes ?? null,
        enteredById: admin.id,
      },
    });
    sourceMap.set(s.title, row.id);
  }
  console.log(`[seed] 史料来源 ${sourceMap.size} 条`);

  // ---------------- 地名 ----------------
  const placeMap = new Map<string, string>();
  for (const p of places) {
    let row = await prisma.historicalPlace.findFirst({ where: { historicalName: p.historicalName }, select: { id: true } });
    if (!row) {
      row = await prisma.historicalPlace.create({
        data: {
          historicalName: p.historicalName,
          modernName: p.modernName,
          longitude: p.lng,
          latitude: p.lat,
          placeType: p.type as PlaceType,
          evidenceLevel: EvidenceLevel.INFERRED, // 坐标为近似示意值
          reviewStatus: ReviewStatus.PENDING,
          notes: `${p.note ?? ""}${p.note ? " " : ""}坐标为现代地名治所近似位置，仅供地图示意，非考古定点。`,
        },
        select: { id: true },
      });
      for (const alias of p.aliases ?? []) {
        await prisma.placeAlias.upsert({
          where: { placeId_alias: { placeId: row.id, alias } },
          update: {},
          create: { placeId: row.id, alias },
        });
      }
    }
    placeMap.set(p.historicalName, row.id);
  }
  console.log(`[seed] 历史地名 ${placeMap.size} 条`);

  // ---------------- 姓氏知识库 ----------------
  let figureCount = 0;
  for (const s of surnames) {
    // 检索键：pinyin-pro 姓氏模式生成无音调全拼与首字母，并补入人工核定读音的无音调形式。
    // 带声调元音开头的姓（安 ān、欧 ōu、艾 ài …）无法被 startsWith("a"/"o") 命中，
    // 故额外写入单个 ASCII 首字母，供 A-Z 筛选与拼音检索使用。
    // 抽成纯函数后可由单测直接验证「带声调元音开头姓氏」的 ASCII 首字母键，
    // 不必连库重跑 seed；逻辑与 src/lib/surname-pinyin.ts 单一来源。
    const pinyinKeys = buildPinyinKeys(s.name, s.pinyin, s.traditional);
    const surname = await prisma.surname.upsert({
      where: { name: s.name },
      // 有意不覆盖 reviewStatus：后台人工审定 / 退回待审的结论优先级高于种子脚本，
      // 重跑 seed 不应把管理员的审核结果重置。字典项首次创建时的 PENDING 由下方 create 设置。
      update: {
        pinyin: s.pinyin, pinyinKeys, traditional: s.traditional ?? null,
        category: s.compound ? "COMPOUND" : "SINGLE",
        popularityRank: s.rank, originSummary: s.originSummary, credibility: ev(s.credibility),
      },
      create: {
        name: s.name,
        pinyin: s.pinyin,
        pinyinKeys,
        traditional: s.traditional ?? null,
        category: s.compound ? "COMPOUND" : "SINGLE",
        popularityRank: s.rank,
        originSummary: s.originSummary,
        credibility: ev(s.credibility),
        // 38 条带史料出处（surname_origins 关联）的详细条目首次写入即标为 APPROVED；
        // 其余 466 条字典型条目仅含字形/繁体/读音/序位、源流待补录，保持 PENDING，
        // 避免把没有任何史料引用的条目显示为「已审定史料」。
        // 注意：update 分支有意不覆盖 reviewStatus，后台人工审核结论优先于 seed。
        reviewStatus: s.reviewStatus ? (s.reviewStatus as ReviewStatus) : ReviewStatus.APPROVED,
      },
    });

    for (const o of s.origins) {
      const exists = await prisma.surnameOrigin.findFirst({ where: { surnameId: surname.id, title: o.title }, select: { id: true } });
      if (!exists) {
        await prisma.surnameOrigin.create({
          data: {
            surnameId: surname.id,
            title: o.title,
            content: o.content,
            era: o.era ?? null,
            evidenceLevel: ev(o.level),
            reviewStatus: ReviewStatus.PENDING, // 未补录卷次/页码/原文，不得显示「已审定」
            sourceId: o.sourceTitle ? sourceMap.get(o.sourceTitle) ?? null : null,
            createdBy: admin.id,
          },
        });
        await prisma.sourceCitation.create({
          data: {
            sourceId: (o.sourceTitle && sourceMap.get(o.sourceTitle)) || sourceMap.get("元和姓纂")!,
            entityType: "surname_origin",
            entityId: surname.id,
            quote: o.content.slice(0, 500),
            createdById: admin.id,
          },
        });
      }
    }

    for (const c of s.commanderies ?? []) {
      await prisma.surnameCommandery.upsert({
        where: { surnameId_name: { surnameId: surname.id, name: c } },
        update: {},
        create: { surnameId: surname.id, name: c, reviewStatus: ReviewStatus.PENDING, sourceId: sourceMap.get("元和姓纂") ?? null },
      });
    }
    for (const h of s.hallNames ?? []) {
      await prisma.surnameHallName.upsert({
        where: { surnameId_name: { surnameId: surname.id, name: h.name } },
        update: {},
        create: { surnameId: surname.id, name: h.name, origin: h.origin ?? null, location: h.location ?? null, reviewStatus: ReviewStatus.PENDING, sourceId: sourceMap.get("元和姓纂") ?? null },
      });
    }
    const variantList = [
      ...(s.traditional && s.traditional !== s.name ? [{ variant: s.traditional!, type: "繁体字", note: "繁体写法" }] : []),
      ...(s.variants ?? []),
    ];
    for (const v of variantList) {
      await prisma.surnameVariant.upsert({
        where: { surnameId_variant: { surnameId: surname.id, variant: v.variant } },
        update: {},
        create: { surnameId: surname.id, variant: v.variant, variantType: v.type, note: v.note ?? null },
      });
    }
    for (const f of s.figures ?? []) {
      const exists = await prisma.historicalFigure.findFirst({ where: { name: f.name, dynasty: f.dynasty ?? null }, select: { id: true } });
      if (!exists) {
        await prisma.historicalFigure.create({
          data: {
            name: f.name,
            surnameId: surname.id,
            dynasty: f.dynasty ?? null,
            biography: `${f.note ?? ""}${f.note ? " " : ""}（人物条目待补录卷次、页码与原文引用）`,
            evidenceLevel: EvidenceLevel.DOCUMENTED,
            reviewStatus: ReviewStatus.PENDING,
            sourceId: sourceMap.get("辞海（历史人物条目）") ?? null,
          },
        });
        figureCount++;
      }
    }
  }
  console.log(`[seed] 姓氏 ${surnames.length} 个，历史人物 ${figureCount} 位`);

  // ---------------- 宏观迁徙记录（非具体家族路线） ----------------
  for (const m of migrations) {
    const exists = await prisma.migrationRecord.findFirst({ where: { reason: m.reason } });
    if (!exists) {
      const fromId = placeMap.get(m.from) ?? null;
      const toId = placeMap.get(m.to) ?? null;
      const from = places.find((p) => p.historicalName === m.from);
      const to = places.find((p) => p.historicalName === m.to);
      await prisma.migrationRecord.create({
        data: {
          fromPlaceId: fromId,
          toPlaceId: toId,
          dynasty: m.dynasty,
          startYear: m.startYear,
          endYear: m.endYear,
          reason: m.reason,
          narrative: m.narrative,
          routePoints: [
            ...(from ? [{ name: from.historicalName, lng: from.lng, lat: from.lat }] : []),
            ...(to ? [{ name: to.historicalName, lng: to.lng, lat: to.lat }] : []),
          ] as Prisma.InputJsonArray,
          evidenceLevel: ev(m.level),
          reviewStatus: ReviewStatus.PENDING,
          verification: VerificationStatus.UNVERIFIED,
          sourceId: sourceMap.get(m.sourceTitle) ?? null,
          createdBy: admin.id,
        },
      });
    }
  }
  console.log(`[seed] 宏观迁徙记录 ${migrations.length} 条（不含任何虚构家族祖先路线）`);

  // ---------------- 演示族谱（明确标记为演示数据） ----------------
  const demoFamilyName = "【演示】颍川陈氏·示例族谱";
  let family = await prisma.family.findFirst({ where: { name: demoFamilyName } });
  if (!family) {
    family = await prisma.family.create({
      data: {
        name: demoFamilyName,
        surnameText: "陈",
        surnameId: (await prisma.surname.findUnique({ where: { name: "陈" } }))?.id ?? null,
        hallName: "颍川堂",
        ancestralHome: "河南省许昌市禹州一带（演示数据）",
        description: "【演示数据】本族谱内所有人物、关系、字辈均为虚构示例，仅用于展示关系图谱、亲属称谓与导入导出功能，不代表任何真实家族。",
        visibility: Visibility.PUBLIC,
        isDemo: true,
        ownerId: demoUser.id,
      },
    });
    await prisma.familyCollaborator.create({
      data: { familyId: family.id, userId: demoUser.id, permission: FamilyPermissionCode.OWNER, status: CollaboratorStatus.ACTIVE, acceptedAt: new Date() },
    });
  }

  const demoMembers = [
    { key: "g1m", surnameText: "陈", givenName: "演示·守业", gender: Gender.MALE, birthYear: 1900, deathYear: 1980, isLiving: false, generationNumber: 1, generationChar: "守" },
    { key: "g1f", surnameText: "王", givenName: "演示·素芬", gender: Gender.FEMALE, birthYear: 1903, deathYear: 1985, isLiving: false, generationNumber: 1 },
    { key: "g2a", surnameText: "陈", givenName: "演示·建国", gender: Gender.MALE, birthYear: 1928, deathYear: 2005, isLiving: false, generationNumber: 2, generationChar: "建" },
    { key: "g2b", surnameText: "陈", givenName: "演示·建平", gender: Gender.MALE, birthYear: 1932, deathYear: 2010, isLiving: false, generationNumber: 2, generationChar: "建" },
    { key: "g2as", surnameText: "赵", givenName: "演示·秀兰", gender: Gender.FEMALE, birthYear: 1930, deathYear: 2012, isLiving: false, generationNumber: 2 },
    { key: "g3a", surnameText: "陈", givenName: "演示·晓明", gender: Gender.MALE, birthYear: 1955, isLiving: true, generationNumber: 3, generationChar: "晓" },
    { key: "g3b", surnameText: "陈", givenName: "演示·晓红", gender: Gender.FEMALE, birthYear: 1958, isLiving: true, generationNumber: 3, generationChar: "晓" },
    { key: "g3as", surnameText: "林", givenName: "演示·婉", gender: Gender.FEMALE, birthYear: 1957, isLiving: true, generationNumber: 3 },
    { key: "g4a", surnameText: "陈", givenName: "演示·念祖", gender: Gender.MALE, birthYear: 1980, isLiving: true, generationNumber: 4, generationChar: "念" },
    { key: "g3adopt", surnameText: "陈", givenName: "演示·继业", gender: Gender.MALE, birthYear: 1960, isLiving: true, generationNumber: 3 },
  ];
  const memberIds = new Map<string, string>();
  for (const m of demoMembers) {
    let row = await prisma.familyMember.findFirst({ where: { familyId: family.id, givenName: m.givenName } });
    if (!row) {
      row = await prisma.familyMember.create({
        data: {
          familyId: family.id,
          surnameText: m.surnameText,
          givenName: m.givenName,
          gender: m.gender,
          birthYear: m.birthYear,
          birthDateText: `${m.birthYear} 年`,
          birthPrecision: "YEAR",
          deathYear: m.deathYear ?? null,
          deathDateText: m.deathYear ? `${m.deathYear} 年` : null,
          deathPrecision: m.deathYear ? "YEAR" : "UNKNOWN",
          isLiving: m.isLiving,
          generationNumber: m.generationNumber,
          generationChar: m.generationChar ?? null,
          generationConfirmed: true,
          visibility: Visibility.PUBLIC, // 演示数据；真实用户在世人物默认 PRIVATE
          verification: VerificationStatus.VERIFIED,
          createdById: demoUser.id,
          biography: "【演示数据】虚构人物。",
        },
      });
    }
    memberIds.set(m.key, row.id);
  }

  const id = (k: string) => memberIds.get(k)!;
  const relDefs: Array<[string, string, RelationType, RelationSubtype]> = [
    ["g1m", "g1f", RelationType.SPOUSE, RelationSubtype.MARRIAGE],
    ["g1m", "g2a", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g1f", "g2a", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g1m", "g2b", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g1f", "g2b", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g2a", "g2as", RelationType.SPOUSE, RelationSubtype.MARRIAGE],
    ["g2a", "g3a", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g2as", "g3a", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g2a", "g3b", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g2as", "g3b", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g3a", "g3as", RelationType.SPOUSE, RelationSubtype.MARRIAGE],
    ["g3a", "g4a", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g3as", "g4a", RelationType.PARENT_CHILD, RelationSubtype.BIOLOGICAL],
    ["g3a", "g3b", RelationType.SIBLING, RelationSubtype.FULL],
    // 收养关系：与生物学血缘明确区分
    ["g2b", "g3adopt", RelationType.ADOPTION, RelationSubtype.ADOPTIVE],
  ];
  for (const [from, to, type, subtype] of relDefs) {
    const exists = await prisma.familyRelationship.findFirst({
      where: { fromPersonId: id(from), toPersonId: id(to), type, subtype, deletedAt: null },
    });
    if (!exists) {
      await prisma.familyRelationship.create({
        data: {
          familyId: family.id,
          fromPersonId: id(from),
          toPersonId: id(to),
          type,
          subtype,
          directional: type !== RelationType.SPOUSE && type !== RelationType.SIBLING,
          verification: VerificationStatus.VERIFIED,
          evidenceLevel: EvidenceLevel.UNVERIFIED,
          notes: "【演示数据】虚构关系",
          createdById: demoUser.id,
        },
      });
    }
  }

  const poem = await prisma.generationPoem.findFirst({ where: { familyId: family.id, title: "演示字辈（虚构）" } });
  if (!poem) {
    await prisma.generationPoem.create({
      data: {
        familyId: family.id,
        title: "演示字辈（虚构）",
        content: "守建晓念，忠厚传家。【演示数据，非真实字辈】",
        characters: ["守", "建", "晓", "念", "忠", "厚", "传", "家"],
        sourceText: "无史料来源，仅用于功能演示",
        reviewStatus: ReviewStatus.PENDING,
      },
    });
    for (let i = 1; i <= 4; i++) {
      await prisma.familyGeneration.upsert({
        where: { familyId_generationNumber: { familyId: family.id, generationNumber: i } },
        update: {},
        create: { familyId: family.id, generationNumber: i, generationChar: ["守", "建", "晓", "念"][i - 1], notes: "演示数据" },
      });
    }
  }

  const branchA = await prisma.familyBranch.findFirst({ where: { familyId: family.id, name: "长房（演示）" } });
  if (!branchA) {
    const b1 = await prisma.familyBranch.create({ data: { familyId: family.id, name: "长房（演示）", rootPersonId: id("g2a"), color: "#B08D57" } });
    await prisma.familyBranch.create({ data: { familyId: family.id, name: "二房（演示）", rootPersonId: id("g2b"), parentId: b1.id, color: "#3E6B6B" } });
    await prisma.familyMember.update({ where: { id: id("g2a") }, data: { branchId: b1.id } });
    await prisma.familyMember.update({ where: { id: id("g3a") }, data: { branchId: b1.id } });
  }

  const version = await prisma.genealogyVersion.findFirst({ where: { familyId: family.id, versionNumber: 1 } });
  if (!version) {
    const snapshot = {
      members: demoMembers.map((m) => ({ ...m })),
      relationships: relDefs.map(([f, t, ty, su]) => ({ from: f, to: t, type: ty, subtype: su })),
      note: "演示数据初始版本",
    };
    await prisma.genealogyVersion.create({
      data: {
        familyId: family.id,
        versionNumber: 1,
        label: "初始演示版本",
        changeSummary: "创建演示族谱",
        snapshot: snapshot as Prisma.InputJsonObject,
        checksum: sha256(JSON.stringify(snapshot)),
        createdById: demoUser.id,
      },
    });
  }

  // ---------------- 演示社区内容 ----------------
  const demoPosts = [
    {
      title: "【演示】寻同宗线索：颍川陈氏字辈核对",
      content: "【演示数据】这是一条用于展示寻亲大厅功能的示例信息。真实寻亲请填写可核验的祖籍、字辈与族谱来源；同姓不代表同宗，平台不会依据姓氏自动认定血缘关系。",
      type: PostType.SEEK_RELATIVE,
      clues: { ancestralHome: "河南许昌（演示）", generationPoem: "守建晓念（演示）", surname: "陈" } as Prisma.InputJsonObject,
    },
    {
      title: "【演示】如何理解「郡望」与「堂号」",
      content: "【演示数据】郡望指某一姓氏在历史上较为显赫的地域性家族，堂号多为家族祠堂或支系的标识。二者都不能作为判断两人存在血缘关系的依据。",
      type: PostType.DISCUSSION,
      clues: {} as Prisma.InputJsonObject,
    },
  ];
  for (const p of demoPosts) {
    const exists = await prisma.post.findFirst({ where: { title: p.title } });
    if (!exists) {
      await prisma.post.create({
        data: { authorId: demoUser.id, title: p.title, content: p.content, type: p.type, clues: p.clues, visibility: Visibility.PUBLIC, status: PostStatus.PUBLISHED, tags: ["演示"] },
      });
    }
  }

  await prisma.auditLog.create({
    data: { actorId: admin.id, action: "seed.run", entityType: "system", entityId: null, after: { surnames: surnames.length, places: places.length, sources: sources.length, note: "演示数据已明确标记" } as Prisma.InputJsonObject },
  });

  console.log("[seed] 完成。");
  console.log(`[seed] 管理员: ${adminEmail} / ${adminPassword}（部署后请立即修改）`);
  console.log(`[seed] 演示账号: ${demoEmail} / ${demoPassword}`);
}

main()
  .catch((e) => {
    console.error("[seed] 失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
