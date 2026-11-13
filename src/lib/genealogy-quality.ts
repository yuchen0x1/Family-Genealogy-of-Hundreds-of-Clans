/** 资料体检：只报告可解释的异常，不改写史料、不推断亲属关系。 */
export type QualityPerson = {
  id: string; surnameText: string; givenName: string;
  birthYear: number | null; deathYear: number | null; isLiving: boolean;
  deathDateText: string | null; generationNumber: number | null; generationConfirmed: boolean;
};
export type QualityRelation = {
  id: string; fromPersonId: string; toPersonId: string;
  type: string; subtype: string; verification: string;
};
export type QualitySeverity = "ERROR" | "WARNING" | "INFO";
export type QualityIssue = {
  id: string; code: string; severity: QualitySeverity; message: string;
  people: Array<{ id: string; name: string }>; relationId?: string;
};
export type QualityReport = {
  scanned: { members: number; relationships: number; rejectedRelationships: number };
  counts: Record<QualitySeverity, number>; totalIssues: number;
  issues: QualityIssue[]; truncated: boolean; issueLimit: number; checkedAt: string;
};
export const QUALITY_MEMBER_LIMIT = 10_000;
export const QUALITY_RELATION_LIMIT = 30_000;

export function inspectGenealogy(
  people: QualityPerson[], relations: QualityRelation[], now = new Date(), issueLimit = 500,
): QualityReport {
  const limit = Math.max(1, Math.min(500, Math.floor(issueLimit) || 500));
  const byId = new Map(people.map((p) => [p.id, p]));
  const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
  const buckets: Record<QualitySeverity, QualityIssue[]> = { ERROR: [], WARNING: [], INFO: [] };
  const add = (code: string, severity: QualitySeverity, message: string, ids: string[], relationId?: string) => {
    counts[severity]++;
    if (buckets[severity].length >= limit) return;
    buckets[severity].push({
      id: `${code}:${relationId ?? ids[0]}`, code, severity, message, relationId,
      people: [...new Set(ids)].slice(0, 10).flatMap((id) => {
        const p = byId.get(id);
        return p ? [{ id, name: `${p.surnameText}${p.givenName}` }] : [];
      }),
    });
  };
  const year = now.getUTCFullYear();
  for (const p of people) {
    if (p.birthYear !== null && p.deathYear !== null && p.deathYear < p.birthYear)
      add("BIRTH_AFTER_DEATH", "WARNING", `登记卒年 ${p.deathYear} 早于生年 ${p.birthYear}，请核对原始纪年与换算。`, [p.id]);
    if (p.isLiving && (p.deathYear !== null || p.deathDateText?.trim()))
      add("LIVING_WITH_DEATH", "WARNING", "标记为在世，但已登记去世资料；请核对在世状态与卒年文本。", [p.id]);
    if ((p.birthYear !== null && p.birthYear > year) || (p.deathYear !== null && p.deathYear > year))
      add("FUTURE_YEAR", "WARNING", `生卒年份晚于检查年份 ${year}，请核对公历换算与录入值。`, [p.id]);
  }
  const keys = new Set<string>();
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Array<{ to: string; relationId: string }>>();
  let rejectedRelationships = 0;
  for (const r of relations) {
    if (r.verification === "REJECTED") { rejectedRelationships++; continue; }
    const ids = [r.fromPersonId, r.toPersonId];
    const from = byId.get(r.fromPersonId), to = byId.get(r.toPersonId);
    if (!from || !to) {
      add("MISSING_PERSON", "ERROR", "关系引用了不在当前有效人物列表中的记录，请在关系管理中核对。", ids, r.id);
      continue;
    }
    if (from.id === to.id) {
      add("SELF_RELATION", "ERROR", "关系两端为同一人物，请核对记录与方向。", ids, r.id);
      continue;
    }
    const symmetric = r.type === "SPOUSE" || r.type === "SIBLING";
    const key = JSON.stringify([r.type, r.subtype, ...(symmetric ? [...ids].sort() : ids)]);
    if (keys.has(key)) add("DUPLICATE_RELATION", "WARNING", "同类型、同子类型的关系重复登记（已考虑对称关系的反向写法）。", ids, r.id);
    keys.add(key);
    if (r.verification !== "VERIFIED")
      add("UNVERIFIED_RELATION", "INFO", "该关系尚未核实，不参与亲属称谓计算；请依据族谱或其他资料核对。", ids, r.id);
    if (r.type !== "PARENT_CHILD" || r.subtype !== "BIOLOGICAL") continue;
    const set = parents.get(to.id) ?? new Set<string>();
    set.add(from.id); parents.set(to.id, set);
    const edges = children.get(from.id) ?? [];
    edges.push({ to: to.id, relationId: r.id }); children.set(from.id, edges);
    if (from.birthYear !== null && to.birthYear !== null && from.birthYear >= to.birthYear)
      add("PARENT_BIRTH_ORDER", "WARNING", `登记父母生年 ${from.birthYear} 不早于子女生年 ${to.birthYear}，请核对人物与年代。`, ids, r.id);
    if (from.generationConfirmed && to.generationConfirmed && from.generationNumber !== null && to.generationNumber !== null && to.generationNumber !== from.generationNumber + 1)
      add("GENERATION_GAP", "WARNING", `双方已确认世代为 ${from.generationNumber} / ${to.generationNumber}，与直接亲子相邻世代不符；不同支系可能有不同编号，请人工核对。`, ids, r.id);
  }
  for (const [child, ids] of parents) {
    if (ids.size > 2) add("TOO_MANY_PARENTS", "ERROR", `登记了 ${ids.size} 位生物学父母，请核对关系类型；尚未核实的关系也计入检查。`, [child, ...ids]);
  }
  // 显式栈 DFS：长世系不依赖 JavaScript 调用栈；只将真正的回边报告为环。
  const color = new Map<string, number>();
  for (const person of people) {
    if (color.has(person.id)) continue;
    color.set(person.id, 1);
    const stack = [{ id: person.id, index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edge = children.get(frame.id)?.[frame.index++];
      if (!edge) { color.set(frame.id, 2); stack.pop(); continue; }
      if (color.get(edge.to) === 1) {
        add("BLOOD_CYCLE", "ERROR", "登记的生物学亲子关系形成循环，请核对关系方向。此提示不认定血缘事实。", [frame.id, edge.to], edge.relationId);
      } else if (!color.has(edge.to)) {
        color.set(edge.to, 1); stack.push({ id: edge.to, index: 0 });
      }
    }
  }
  const totalIssues = counts.ERROR + counts.WARNING + counts.INFO;
  return {
    scanned: { members: people.length, relationships: relations.length, rejectedRelationships },
    counts, totalIssues, issues: [...buckets.ERROR, ...buckets.WARNING, ...buckets.INFO].slice(0, limit),
    truncated: totalIssues > limit, issueLimit: limit, checkedAt: now.toISOString(),
  };
}
