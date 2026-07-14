# ruletrace

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node >=22.13](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen) [![Version 0.1.0](https://img.shields.io/badge/version-0.1.0-blue)](CHANGELOG.md) ![Tests](https://img.shields.io/badge/tests-92%20passed-brightgreen) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

**ruletrace：开源的 AI 编码代理规则文件只读解析器与调试器 — 精确打印任意路径实际得到的指令栈：嵌套 CLAUDE.md、@ 导入、Cursor glob、Copilot applyTo。**

![Demo](docs/assets/demo.svg)

```bash
git clone https://github.com/JaydenCJ/ruletrace.git && cd ruletrace && npm install && npm run build
node dist/cli.js --help   # or: npm link && ruletrace --help
```

> 预发布：v0.1.0 尚未发布到 npm；请按上述方式从源码安装。零运行时依赖 — `typescript` 是唯一的 devDependency。

## 为什么选 ruletrace？

代理规则文件已悄然变成一门没有调试器的配置语言。一个仓库可以同时携带根 `CLAUDE.md`、每个子目录的嵌套版本、展开五跳深的 `@` 导入、个人的 `CLAUDE.local.md`、四种挂载模式加作用域 glob 的 Cursor `.mdc` 规则、Copilot 的 `applyTo` 指令，以及只有最近文件生效的 `AGENTS.md` 链 — 而"代理编辑*这个*文件时到底看到什么？"这个问题，除了在脑中模拟每个工具的加载器之外别无答案。现有工具攻的是相反的问题：rulesync、Ruler 这类生成器从母本*写出*规则文件，能帮你编写，却完全不告诉你它们如何解析 — 当文件是手写的、出自三位同事之手、沿用去年的惯例时更是无能为力。ruletrace 补上了缺失的读取路径：一条命令，按每个工具各自的方式解析嵌套、导入、作用域与 glob，说明每一层*为什么*挂载，并且永远不写一个字节。

| | ruletrace | rulesync | Ruler | grep + 肉眼 |
| --- | --- | --- | --- | --- |
| 方向 | 只读：解释解析结果 | 生成/转换规则文件 | 从母本生成 | 读，很慢 |
| 按路径回答（"src/a.ts 适用什么？"） | 是 — 一条命令，按工具分列 | 否 | 否 | 手工爬目录树 |
| `@` 导入展开（环/深度/缺失） | 是，完整树带行号 | 否 | 否 | 靠手 |
| Cursor 挂载模式（always/auto/agent/manual） | 逐规则分类，glob 实际求值 | 写出 .mdc 文件 | 写出 .mdc 文件 | 自己读 frontmatter |
| 失效引用检查（`check`，exit 1） | 是 — 导入、死 glob、frontmatter | 输出间漂移 | 输出间漂移 | 无 |
| 精确拼装的上下文（`--content`） | 是，带来源横幅 | 否 | 否 | cat，顺序碰运气 |
| 运行时依赖 | 无（Node 标准库） | npm 依赖树 | npm 依赖树 | 无 |

<sub>对比基于 2026-07 各上游文档。rulesync 与 Ruler 解决的是编写 — 让多种规则格式与单一源保持同步；ruletrace 解决的是审视，并且对那些工具从未碰过的仓库同样有效。</sub>

## 特性

- **四个生态，一份追踪** — Claude Code（`CLAUDE.md`、`CLAUDE.local.md`）、Cursor（`.cursor/rules/*.mdc`、遗留 `.cursorrules`）、GitHub Copilot（`copilot-instructions.md`、`*.instructions.md`）与 `AGENTS.md`，各按其工具自身语义解析，并排呈现。
- **真实的导入解析** — `@path` 导入按文档规则递归展开：跳过代码块与行内代码、五跳上限、检出并标注循环，`@~/` 个人导入默认保持不透明，除非用 `--home` 显式开启。
- **不止是什么，还有为什么** — 每一层都写明理由：`ancestor directory src/`、`glob src/**/*.ts matched`、`nearest AGENTS.md — takes precedence`、`model decides from description`。
- **逐字拼出的上下文** — `--content` 打印路径实际收到的完整拼接指令文本，导入按深度优先内联，每一段之上都有来源横幅。
- **规则腐化的 linter** — `ruletrace check` 找出缺失与循环导入、死 glob、坏 frontmatter 与已废弃格式，出错时 exit 1（`--strict` 连警告一起算），`--json` 可直接喂给脚本。
- **What-if 模式** — 目标路径不必已经存在：在创建之前就能问一个计划中的文件*将会*得到什么。
- **只读、离线、零依赖** — ruletrace 只读文件；无网络、无遥测、运行时零包，相同的树产生逐字节一致的输出。

## 快速上手

问一个深嵌套文件实际得到什么（先运行一次 `bash examples/setup-demo.sh` 生成被 gitignore 的 Copilot fixture，再在 [`examples/demo-project`](examples/demo-project) 内运行）：

```bash
ruletrace src/parser/lexer.ts
```

真实捕获的输出：

```text
ruletrace 0.1.0 — effective instruction stack
root:   /work/demo-project
target: src/parser/lexer.ts

claude-code — 3 layers (read shallow to deep; deeper files are more specific and read later)
  1. CLAUDE.md        nesting          project root memory
       -> @docs/style.md  [ok]  docs/style.md (line 6)
          -> @naming.md  [ok]  docs/naming.md (line 3)
       -> @docs/release.md  [ok]  docs/release.md (line 7)
  2. CLAUDE.local.md  local            personal memory at project root (not shared)
  3. src/CLAUDE.md    nesting          ancestor directory src/

cursor — 2 layers (always + matching-glob rules are injected; agent-requested rules depend on the model)
  1. .cursor/rules/base.mdc        always           alwaysApply: true
  2. .cursor/rules/typescript.mdc  auto             glob src/**/*.ts matched
  ~  .cursor/rules/reviews.mdc     agent-requested  model decides from description

copilot — 2 layers (repository instructions first, then every matching .instructions.md)
  1. .github/copilot-instructions.md              always           applies to every request in this repository
  2. .github/instructions/parser.instructions.md  auto             applyTo src/parser/**/*.ts matched

agents.md — 2 layers (nearest file wins on conflicts; some agents read only the nearest one)
  1. AGENTS.md             nesting          ancestor AGENTS.md — overridden where they conflict
  2. src/parser/AGENTS.md  nesting          nearest AGENTS.md — takes precedence
```

然后对整个仓库做规则腐化检查 — 失效的导入会让运行失败（删除 `docs/naming.md` 后的真实输出）：

```text
note    local-memory            CLAUDE.local.md: CLAUDE.local.md is personal memory; collaborators do not see it
error   import-missing          docs/style.md:3: @naming.md does not resolve to a file
1 error, 0 warnings, 1 note
```

`ruletrace tree` 列出每个规则文件及其类别，`--content` 打印各工具注入的拼装文本。三条命令都支持 `--json`。

## 命令与选项

| 命令 / 标志 | 默认值 | 效果 |
| --- | --- | --- |
| `ruletrace <path>` | — | explain：哪些规则文件适用于 `<path>`、按工具分列、为什么 |
| `ruletrace tree` | — | 根目录下发现的全部规则文件清单 |
| `ruletrace check` | — | 诊断；有错误时 exit 1，`--strict` 将警告升级 |
| `--root <dir>` | 最近的 `.git` 祖先，否则 cwd | 解析所依据的项目根目录 |
| `--tool <list>` | `all` | 限定为 `claude`、`cursor`、`copilot`、`agents`（CSV，可重复） |
| `--json` | 关 | 机器可读输出，`schema_version: 1` |
| `--content` | 关 | 仅 explain：带来源横幅的拼装指令文本 |
| `--home <dir>` | 未设置 | 让 `@~/` 导入基于 `<dir>` 解析，而非保持不透明 |

退出码：`0` 正常，`1` check 发现问题，`2` 用法或 I/O 错误。完整的逐工具语义 — 挂载模式、作用域、glob 方言、确定性保证 — 详见 [docs/resolution.md](docs/resolution.md)。

## 架构

```mermaid
flowchart LR
    CLI[cli<br/>argv, exit codes] --> DISC[discover<br/>one-pass walk]
    DISC --> FM[frontmatter<br/>mdc + applyTo]
    DISC --> T[tools/*<br/>claude · cursor · copilot · agents]
    T --> IMP[imports<br/>@-tree, cycles, depth]
    T --> GLOB[glob<br/>*, **, braces, classes]
    T --> TRACE[resolve<br/>Trace + content view]
    TRACE --> REP[report<br/>text · json]
    DISC --> CHK[check<br/>diagnostics]
    CHK --> REP
```

`explain`、`tree` 与 `check` 共用同一份单趟扫描的清单；解析器与匹配器都是纯函数，因此每次调用只触碰文件系统一次。

## 路线图

- [x] v0.1.0 — 覆盖 Claude Code、Cursor、Copilot 与 AGENTS.md 的 explain/tree/check；递归 `@` 导入树；挂载模式分类；`--content` 拼装；`--json`；零依赖；92 个测试 + smoke 脚本
- [ ] 更多生态：Windsurf `.windsurf/rules`、Cline `.clinerules`、Codex 配置
- [ ] `--why <rule-file>` — 反向提问：这条规则能触达哪些路径？
- [ ] Diff 模式：指令栈在两个 git 版本之间如何变化
- [ ] 重叠报告：可能互相矛盾的层对
- [ ] 编辑会话的 watch 模式

完整列表见 [open issues](https://github.com/JaydenCJ/ruletrace/issues)。

## 贡献

欢迎 bug 报告、解析器修正与 PR — 本地流程见 [CONTRIBUTING.md](CONTRIBUTING.md)（`npm test` 加上打印 `SMOKE OK` 的 `scripts/smoke.sh`；本仓库有意不带 CI）。入门任务标为 [good first issue](https://github.com/JaydenCJ/ruletrace/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)，设计讨论在 [Discussions](https://github.com/JaydenCJ/ruletrace/discussions)。

## 许可证

[MIT](LICENSE)
