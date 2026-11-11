/**
 * 副作用导入的样式类型声明。
 *
 * TypeScript 6 起，`import "./globals.css"` 这类仅副作用的导入同样要求模块
 * 可解析（TS2882: Cannot find module or type declarations for side-effect
 * import）。Next.js 生成的 next-env.d.ts 只引用 next 与 image-types，不含
 * 样式模块声明；而该文件被 .gitignore 排除、由 dev/build 生成，`pnpm typecheck`
 * 又在构建之前独立运行，CI 环境中便缺少这条声明。
 *
 * 本项目只使用全局样式（src/app/globals.css），不涉及 CSS Modules，
 * 因此统一声明为副作用模块即可，不影响类型安全。
 */
declare module "*.css";

