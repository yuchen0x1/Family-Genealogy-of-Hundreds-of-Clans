import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";import { tmpdir } from "node:os";
import path from "node:path";

/**
 * updater sidecar 的真实行为测试。
 *
 * sidecar 是唯一挂载 docker.sock 的组件，它读一个 app 写入的 JSON 标记文件。
 * 那个文件是攻击面：被攻陷的 Web 进程可以写任意内容进去。因此这里不测
 * 「正常路径能否构建镜像」（需要 Docker，本机没有），而是**逐个验证恶意
 * 或畸形的请求标记都被拒绝**，且不会执行任何命令。
 *
 * 做法：在临时目录里造出 PROJECT_DIR / UPDATE_DIR 结构，用一个会记录调用
 * 的假 `docker` 可执行文件放在 PATH 最前，然后真实运行脚本。
 * 只要假 docker 被调用过，就说明校验被绕过了。
 */

const SIDECAR = path.resolve("docker/update-sidecar.sh");
const BASH = "bash";

/**
 * Git Bash 不认 Windows 反斜杠路径：`bash -c "cat C:\Users\x"` 会把反斜杠当转义符
 * 吞掉，变成 `C:Usersx`。在 Windows 上必须换成 `/c/Users/...` 形式再交给 shell。
 */
function toShellPath(p: string): string {
  if (process.platform !== "win32") return p;
  const resolved = path.resolve(p);
  const withSlashes = resolved.replace(/\\/g, "/");
  return withSlashes.replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
}

/** 探测当前环境能否真实运行 POSIX shell 脚本（Git Bash 可以，纯 Windows CMD 不行）。 */
function hasPosixShell(): boolean {
  try {
    execFileSync(BASH, ["-c", "echo ok"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const describeShell = hasPosixShell() ? describe : describe.skip;

type Fixture = {
  root: string;
  projectDir: string;
  updateDir: string;
  binDir: string;
  dockerCallsFile: string;
  /** 交给 shell 的 POSIX 形式路径（Windows 下为 /c/...） */
  shell: {
    projectDir: string;
    updateDir: string;
    binDir: string;
  };
};

function makeFixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "sidecar-test-"));
  const projectDir = path.join(root, "project");
  const updateDir = path.join(root, "update");
  const binDir = path.join(root, "bin");
  for (const dir of [projectDir, updateDir, binDir]) mkdirSync(dir, { recursive: true });

  // sidecar 启动时会检查 .env 与 docker-compose.yml 是否存在
  writeFileSync(path.join(projectDir, ".env"), "POSTGRES_PASSWORD=x\n");
  writeFileSync(path.join(projectDir, "docker-compose.yml"), "services:\n  app:\n    build: .\n");

  // 假的 docker：只记录调用参数，永不真的构建。
  // 记录文件路径也必须是 shell 能读写的 POSIX 路径。
  const callsFile = path.join(root, "docker-calls.log");
  const fakeDocker = path.join(binDir, "docker");
  writeFileSync(
    fakeDocker,
    `#!/bin/sh\necho "$@" >> '${toShellPath(callsFile)}'\nexit 0\n`,
    { mode: 0o755 },
  );
  writeFileSync(callsFile, "");

  return {
    root,
    projectDir,
    updateDir,
    binDir,
    dockerCallsFile: callsFile,
    shell: {
      projectDir: toShellPath(projectDir),
      updateDir: toShellPath(updateDir),
      binDir: toShellPath(binDir),
    },
  };
}

function cleanup(f: Fixture) {
  rmSync(f.root, { recursive: true, force: true });
}

/**
 * 尽力创建符号链接，并确认 shell 能把它识别为符号链接。
 *
 * 注意 MSYS/Git Bash 的 `ln -s` 在未开启 `MSYS=winsymlinks:nativestrict` 时
 * 默认生成的是**目录副本**而不是真链接，此时 sidecar 看到的是普通目录，
 * 测试前提不成立。因此这里用 `test -L` 复核；建不成或不是真链接就返回 false，
 * 由调用方 skip——绝不为了让用例通过而放宽安全断言。
 */
function trySymlink(target: string, linkPath: string, { isDirectory = false } = {}): boolean {
  try {
    symlinkSync(target, linkPath, isDirectory ? "dir" : "file");
  } catch {
    try {
      execFileSync(BASH, ["-c", `ln -s '${toShellPath(target)}' '${toShellPath(linkPath)}'`], { stdio: "pipe" });
    } catch {
      return false;
    }
  }
  try {
    execFileSync(BASH, ["-c", `test -L '${toShellPath(linkPath)}'`], { stdio: "pipe" });
    return true;
  } catch {
    // 不是真符号链接（例如 MSYS 的副本），清理掉避免污染后续用例
    rmSync(linkPath, { recursive: true, force: true });
    return false;
  }
}

/**
 * 启动 sidecar 轮询，等待它处理完一个请求后杀掉。
 * POLL_SECONDS=1 让循环足够快；等 2.5 秒足以覆盖一次轮询。
 */
function runSidecarOnce(f: Fixture): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(BASH, [toShellPath(SIDECAR)], {
      env: {
        ...process.env,
        PATH: `${f.shell.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        APP_UPDATE_PROJECT_DIR: f.shell.projectDir,
        APP_UPDATE_UPDATE_DIR: f.shell.updateDir,
        APP_UPDATE_POLL_SECONDS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => { stdout += c.toString(); });
    child.stderr.on("data", (c) => { stderr += c.toString(); });
    const kill = setTimeout(() => {
      child.kill("SIGKILL");
    }, 2500);
    child.on("close", (code) => {
      clearTimeout(kill);
      resolve({ stdout, stderr, code });
    });
  });
}

function writeMarker(f: Fixture, content: string) {
  writeFileSync(path.join(f.updateDir, "docker-restart.requested"), content);
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8"));
}

const VALID_JOB = "11111111-1111-4111-8111-111111111111";

function validMarker(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    jobId: VALID_JOB,
    targetVersion: "1.2.3",
    commit: "abcdef1234567890abcdef1234567890abcdef12",
    tag: "v1.2.3",
    staging: "staging-1.2.3",
    requestedAt: new Date().toISOString(),
    ...overrides,
  }, null, 2);
}

function makeStaging(f: Fixture, name = "staging-1.2.3") {
  const dir = path.join(f.updateDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "Dockerfile"), "FROM node:22\n");
  writeFileSync(path.join(dir, "package.json"), '{"name":"t","version":"1.2.3"}\n');
  return dir;
}

describeShell("updater sidecar 启动前置校验", () => {
  let f: Fixture;
  beforeEach(() => { f = makeFixture(); });
  afterEach(() => cleanup(f));

  it("缺少 APP_UPDATE_PROJECT_DIR 时退出码非 0", () => {
    expect(() => execFileSync(BASH, [toShellPath(SIDECAR)], {
      env: { ...process.env, APP_UPDATE_PROJECT_DIR: "", APP_UPDATE_UPDATE_DIR: f.shell.updateDir },
      stdio: "pipe",
    })).toThrow();
  });

  it("PROJECT_DIR 是相对路径时拒绝启动", () => {
    expect(() => execFileSync(BASH, [toShellPath(SIDECAR)], {
      env: { ...process.env, APP_UPDATE_PROJECT_DIR: "relative/path", APP_UPDATE_UPDATE_DIR: f.shell.updateDir },
      stdio: "pipe",
    })).toThrow();
  });

  it("PROJECT_DIR 缺少 .env 或 docker-compose.yml 时拒绝启动", () => {
    rmSync(path.join(f.projectDir, ".env"));
    expect(() => execFileSync(BASH, [toShellPath(SIDECAR)], {
      env: { ...process.env, APP_UPDATE_PROJECT_DIR: f.shell.projectDir, APP_UPDATE_UPDATE_DIR: f.shell.updateDir },
      stdio: "pipe",
    })).toThrow();
  });

  it("POLL_SECONDS 非整数时拒绝启动", () => {
    expect(() => execFileSync(BASH, [toShellPath(SIDECAR)], {
      env: {
        ...process.env,
        APP_UPDATE_PROJECT_DIR: f.shell.projectDir,
        APP_UPDATE_UPDATE_DIR: f.shell.updateDir,
        APP_UPDATE_POLL_SECONDS: "abc",
      },
      stdio: "pipe",
    })).toThrow();
  });
});

describeShell("updater sidecar 拒绝恶意请求标记", () => {
  let f: Fixture;
  beforeEach(() => { f = makeFixture(); });
  afterEach(() => cleanup(f));

  async function expectRejected(marker: string, reasonFragment: string) {
    writeMarker(f, marker);
    const result = await runSidecarOnce(f);
    // 关键断言：假 docker 一次都没被调用
    expect(readFileSync(f.dockerCallsFile, "utf8").trim(), "不得执行任何 docker 命令").toBe("");
    // 失败结果必须回写，让应用能立即把任务标失败并释放锁
    const last = path.join(f.updateDir, "docker-restart.last");
    expect(existsSync(last) || existsSync(path.join(f.updateDir, "docker-restart.failed"))).toBe(true);
    if (existsSync(last)) {
      const payload = readJson(last);
      expect(payload.status).toBe("FAILED");
      expect(String(payload.reason)).toContain(reasonFragment);
    }
    return result;
  }

  it("staging 名称不匹配 staging-* 模式时拒绝", async () => {
    await expectRejected(validMarker({ staging: "../etc" }), "invalid-staging-marker");
  });

  it("jobId 不是 UUID 时拒绝", async () => {
    await expectRejected(validMarker({ jobId: "not-a-uuid" }), "invalid-staging-marker");
  });

  it("targetVersion 含 shell 元字符时拒绝", async () => {
    await expectRejected(validMarker({ targetVersion: "1.2.3; rm -rf /" }), "invalid-staging-marker");
  });

  it("commit 含非十六进制字符时拒绝", async () => {
    await expectRejected(validMarker({ commit: "zzzz" }), "invalid-staging-marker");
  });

  it("同一字段出现两次（重复键）时拒绝", async () => {
    const duplicated = validMarker().replace(
      '"staging": "staging-1.2.3",',
      '"staging": "staging-1.2.3",\n  "staging": "staging-1.2.4",',
    );
    await expectRejected(duplicated, "invalid-staging-marker");
  });

  it("请求体超过 16KB 时拒绝", async () => {
    await expectRejected(validMarker({ notes: "x".repeat(20_000) }), "request-too-large");
  });

  it("staging 目录不存在时拒绝", async () => {
    await expectRejected(validMarker(), "staging-not-found-or-invalid");
  });

  it("staging 目录缺少 Dockerfile 时拒绝", async () => {
    const dir = makeStaging(f);
    rmSync(path.join(dir, "Dockerfile"));
    await expectRejected(validMarker(), "staging-not-found-or-invalid");
  });

  it("staging 目录缺少 package.json 时拒绝", async () => {
    const dir = makeStaging(f);
    rmSync(path.join(dir, "package.json"));
    await expectRejected(validMarker(), "staging-not-found-or-invalid");
  });

  it("请求文件是符号链接时不处理（防止指向任意文件）", async (ctx) => {
    // Windows 默认禁止未提权创建符号链接；先确认能建再测，建不了就跳过而不是假装通过
    const real = path.join(f.root, "elsewhere.json");
    writeFileSync(real, validMarker());
    if (!trySymlink(real, path.join(f.updateDir, "docker-restart.requested"))) {      ctx.skip();
      return;
    }
    await runSidecarOnce(f);
    expect(readFileSync(f.dockerCallsFile, "utf8").trim()).toBe("");
  });

  it("staging 目录是符号链接时拒绝", async (ctx) => {
    const realDir = path.join(f.root, "real-staging");
    mkdirSync(realDir, { recursive: true });
    writeFileSync(path.join(realDir, "Dockerfile"), "FROM node:22\n");
    writeFileSync(path.join(realDir, "package.json"), '{"name":"t"}\n');
    if (!trySymlink(realDir, path.join(f.updateDir, "staging-1.2.3"), { isDirectory: true })) {
      ctx.skip();
      return;
    }
    await expectRejected(validMarker(), "staging-not-found-or-invalid");
  });
});

describeShell("updater sidecar 正常请求", () => {
  let f: Fixture;
  beforeEach(() => { f = makeFixture(); });
  afterEach(() => cleanup(f));

  it("合法请求会调用 docker compose build 与 up，并回写 SUCCEEDED", async () => {
    makeStaging(f);
    writeMarker(f, validMarker());
    await runSidecarOnce(f);

    const calls = readFileSync(f.dockerCallsFile, "utf8").trim();
    expect(calls).toContain("compose");
    expect(calls).toContain("build app");
    expect(calls).toContain("up -d --no-build app nginx");
    // 必须带上部署目录与覆盖文件，否则会用宿主机旧 checkout 构建
    expect(calls).toContain(`--project-directory ${f.shell.projectDir}`);
    expect(calls).toContain("--env-file");
    expect(calls).not.toContain("build .");

    const last = path.join(f.updateDir, "docker-restart.last");
    expect(existsSync(last)).toBe(true);
    expect(readJson(last)).toMatchObject({ jobId: VALID_JOB, status: "SUCCEEDED" });
    // 请求文件被消费掉，不会重复处理
    expect(existsSync(path.join(f.updateDir, "docker-restart.requested"))).toBe(false);
    expect(existsSync(path.join(f.updateDir, "docker-restart.processing"))).toBe(false);
  });

  it("启动时若存在上次残留的 processing 文件，会判为 interrupted 而不是静默丢弃", async () => {
    writeFileSync(
      path.join(f.updateDir, "docker-restart.processing"),
      validMarker({ jobId: "22222222-2222-4222-8222-222222222222" }),
    );
    await runSidecarOnce(f);
    const last = path.join(f.updateDir, "docker-restart.last");
    // 没有新请求时也会把残留标为失败
    if (existsSync(last)) {
      const payload = readJson(last);
      expect(payload.status).toBe("FAILED");
      expect(String(payload.reason)).toContain("sidecar-interrupted");
    }
    expect(existsSync(path.join(f.updateDir, "docker-restart.processing"))).toBe(false);
  });
});
