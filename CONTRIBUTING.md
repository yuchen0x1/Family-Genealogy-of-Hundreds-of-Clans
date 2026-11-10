# 贡献指南

感谢你愿意参与「中华寻根 · 百家族谱」。本项目对**数据真实性**的要求高于功能数量，
提交前请先读完下面三条纪律。

## 三条纪律

1. **不编造史料。** 新增姓氏源流、历史人物、迁徙记录必须附可核验来源（书名、作者、
   版本、卷次/页码或可信数字资源）。没有来源的条目只能作为 `UNVERIFIED` 字典型条目，
   不得编造源流。
2. **不混淆两类数据。** 史料库（`Surname` / `HistoricalFigure` / `MigrationRecord` 等）
   与用户族谱（`Family` / `FamilyMember` / `FamilyRelationship`）物理分表。
   任何"根据同姓自动合并族谱""自动把历史人物加为家族成员"的逻辑都不会被接受。
3. **不夸大完成度。** 未验证的功能请在 `docs/COMPLETION.md` 标记为未验证，
   不要在 README 或 PR 描述里写成已完成。

## 开发环境

```bash
# Node.js >= 22，pnpm 11
pnpm install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
pnpm db:pg                    # 启动项目内置 PostgreSQL 17
pnpm db:migrate
pnpm db:seed
pnpm dev                      # http://localhost:3000
```

## 提交前必须通过

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest，当前 225 通过 / 2 跳过
```

改动涉及 API、权限、加密、上传、导入导出时，请另外启动站点并跑对应冒烟：

```bash
pnpm test:smoke            # 核心后端
pnpm test:smoke:ui         # 族谱前端接口
pnpm test:smoke:archive    # 档案与导入导出
pnpm test:smoke:community  # 社区与用户中心
pnpm test:smoke:admin      # 管理后台与隐私边界
pnpm test:e2e              # Playwright
pnpm test:security         # 安全审计
```

冒烟与审计脚本需要站点已在 `http://localhost:3000` 运行（可用 `SMOKE_BASE_URL` 指到其他环境）。
连续运行测试之间如遇限流报错，先执行 `pnpm test:reset-limits`。

## 代码约定

- 数据库访问统一走 Prisma，不写裸 SQL 拼接；需要 `pg_trgm`/`unaccent` 时在迁移里显式建扩展与索引。
- 所有写操作先过 `assertSameOrigin`、Zod schema 校验与权限判定，再落库，并写审计日志。
- 涉及人物敏感字段时使用 `src/lib/crypto.ts` 的字段加密，不要在业务层手写加解密。
- 接口错误用 `ApiError(code, message)` 抛出，让统一错误处理返回结构化 JSON。
- 新增环境变量必须同步写入 `.env.example` 并加注释。

## Pull Request

1. Fork 并从 `main` 切出分支，分支名建议 `feat/xxx`、`fix/xxx`。
2. 提交信息用 `type(scope): 摘要`，例如 `fix(kinship): 收养关系不再当作血缘`。
3. PR 描述请包含：改动动机、影响范围、验证方式（跑了哪些命令、结果如何）。
4. CI 全绿后由维护者 review。涉及隐私边界的改动会额外要求补充冒烟断言。

## 报告安全问题

请**不要**公开提交 Issue。按 [SECURITY.md](SECURITY.md) 的方式私下报告。

## 许可证

提交即表示同意你的贡献以 [MIT License](LICENSE) 授权。
