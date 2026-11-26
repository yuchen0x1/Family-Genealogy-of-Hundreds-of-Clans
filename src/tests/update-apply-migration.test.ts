import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];
const JOB = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function runInstaller(failMigration: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), "xungen-install-"));
  fixtures.push(root);
  const staging = path.join(root, ".storage", "update", "staging-1.1.0");
  const bin = path.join(root, "bin");
  const pg = path.join(root, "node_modules", "pg");
  for (const dir of [staging, bin, pg, path.join(root, "scripts"), path.join(root, "src"), path.join(root, ".next"), path.join(staging, "src")]) {
    await mkdir(dir, { recursive: true });
  }
  for (const name of ["update-apply.mjs", "update-apply-safety.mjs"]) {
    await writeFile(path.join(root, "scripts", name), await readFile(path.resolve("scripts", name)));
  }
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0", type: "module" }));
  await writeFile(path.join(root, "src", "marker.txt"), "old-source");
  await writeFile(path.join(root, ".next", "marker.txt"), "old-build");
  await writeFile(path.join(staging, "package.json"), JSON.stringify({ version: "1.1.0", type: "module" }));
  await writeFile(path.join(staging, "src", "marker.txt"), "new-source");
  await writeFile(path.join(pg, "package.json"), JSON.stringify({ name: "pg", type: "module", exports: "./index.js" }));
  await writeFile(path.join(pg, "index.js"), `
    import { appendFileSync } from "node:fs";
    export default { Client: class {
      async connect() {}
      async end() {}
      async query(sql, values) {
        appendFileSync(process.env.FIXTURE_DB_LOG, JSON.stringify({ sql, values }) + "\\n");
        return { rows: sql.startsWith("SELECT") ? [{ log: [] }] : [] };
      }
    } };
  `);
  const fakePnpm = path.join(bin, "fake-pnpm.cjs");
  await writeFile(fakePnpm, `
    const fs = require("node:fs");
    const path = require("node:path");
    const command = process.argv.slice(2).join(" ");
    fs.appendFileSync(process.env.FIXTURE_COMMAND_LOG, command + "\\n");
    if (command.startsWith("install ")) {
      fs.mkdirSync("node_modules", { recursive: true });
      fs.writeFileSync(path.join("node_modules", "new-marker.txt"), "new-dependencies");
    }
    if (command === "build") {
      fs.mkdirSync(".next", { recursive: true });
      fs.writeFileSync(path.join(".next", "marker.txt"), "new-build");
    }
    if (command === "exec prisma migrate deploy" && process.env.FIXTURE_FAIL_MIGRATION === "1") {
      process.stderr.write("fixture migration failure");
      process.exit(19);
    }
  `);
  if (process.platform === "win32") {
    await writeFile(path.join(bin, "pnpm.cmd"), `@"${process.execPath}" "${fakePnpm}" %*\r\n`);
  } else {
    await writeFile(path.join(bin, "pnpm"), `#!/bin/sh\nexec '${process.execPath}' '${fakePnpm}' "$@"\n`, { mode: 0o755 });
  }
  const commandLog = path.join(root, "commands.log");
  const dbLog = path.join(root, "queries.log");
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "update-apply.mjs"), "--job", JOB, "--staging", staging, "--target", "1.1.0", "--commit", "a".repeat(40)], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        APP_UPDATE_RESTART_CMD: "",
        PM2_HOME: "",
        pm_id: "",
        INVOCATION_ID: "",
        DATABASE_URL: "postgresql://fixture/fixture",
        FIXTURE_COMMAND_LOG: commandLog,
        FIXTURE_DB_LOG: dbLog,
        FIXTURE_FAIL_MIGRATION: failMigration ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const timer = setTimeout(() => { child.kill(); reject(new Error("fixture installer timed out")); }, 20_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
  return { root, ...result, commands: (await readFile(commandLog, "utf8")).trim().split(/\r?\n/), queries: await readFile(dbLog, "utf8") };
}

describe("源码更新数据库迁移", () => {
  it("构建通过后执行迁移，再进入重启或手动重启阶段", async () => {
    const result = await runInstaller(false);
    expect(result.code, result.output).toBe(0);
    expect(result.commands).toEqual([
      "install --frozen-lockfile --prefer-offline",
      "exec prisma generate",
      "build",
      "exec prisma migrate deploy",
    ]);
    expect(JSON.parse(await readFile(path.join(result.root, "package.json"), "utf8")).version).toBe("1.1.0");
    expect(await readFile(path.join(result.root, ".next", "marker.txt"), "utf8")).toBe("new-build");
  }, 30_000);

  it("迁移失败不重启，恢复旧源码、依赖和构建，并警告数据库需人工确认", async () => {
    const result = await runInstaller(true);
    expect(result.code, result.output).toBe(1);
    expect(result.commands.at(-1)).toBe("exec prisma migrate deploy");
    expect(result.output).not.toContain("重启方式：");
    expect(result.output).toContain("数据库迁移可能部分应用");
    expect(result.queries).toContain("FAILED");
    expect(result.queries).toContain("文件已回滚；数据库迁移需人工确认");
    expect(JSON.parse(await readFile(path.join(result.root, "package.json"), "utf8")).version).toBe("1.0.0");
    expect(await readFile(path.join(result.root, "src", "marker.txt"), "utf8")).toBe("old-source");
    expect(await readFile(path.join(result.root, ".next", "marker.txt"), "utf8")).toBe("old-build");
    expect(JSON.parse(await readFile(path.join(result.root, "node_modules", "pg", "package.json"), "utf8")).name).toBe("pg");
    await expect(readFile(path.join(result.root, "node_modules", "new-marker.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);
});
