# 本地 PR 检查与打包校验

NEXT-02 采用本地检查和 GitHub 提交状态。自动审查与本地检查都通过后再合并。这个流程产出可核对的候选包，GitHub Actions 和 GitHub Release 另行安排。宿主交互、后台与性能沿用对应里程碑的验收范围。 [验收方法](acceptance.md)

## 复跑候选提交

准备 Node.js 24、npm、Git 和可读取 gzip tar 的 `tar`。从可信工作树启动脚本，只验证维护者自己编写或已审阅并信任的完整提交。执行前确认该 SHA 的脚本和锁文件改动，`trusted-commit` 表示确认可以在本机执行该提交的代码。工作树隔离的是文件，构建和测试使用当前用户权限。不可信的提交须先在一次性沙箱中验证，沙箱应无本机凭据、写权限令牌或个人目录挂载。GitHub 状态由可信进程另行登记。

```powershell
npm run verify:local -- trusted-commit <PR-head-SHA> .cache/local-verification
```

脚本建立两份以 LF 检出的独立工作树，使用同一 Node 与 npm 版本，各自运行 `npm ci --ignore-scripts` 从锁文件安装依赖。第一份运行 `typecheck`、`lint` 和现有测试，打包时两份都执行构建。产物包括引擎 tarball、当前 11 款内置皮肤的 ZIP 样例、静墨、暖暮、三套场景、轻量视差、Starter、三套人物模板和三套独立人物 ZIP。脚本核对包内条目、素材字节和样例 ID，再比较两份产物的大小和 SHA-256，退出前移除临时工作树。需要核对历史字节时，使用对应提交的验证脚本、工具链和平台。

若检出的提交含根目录 `README.md`，引擎归档清单也应包含该文件，npm 会在打包时自动收录。正式候选使用本流程生成的 LF 归档。在 Windows 工作树中直接运行 `npm pack` 时，CRLF 可能改变归档摘要，宿主测试记录应引用实际安装的摘要。

每次运行创建唯一的 `verify-*` 目录。`result.json` 记录 Git 提交和树、平台、工具版本、插件及宿主版本、各检查结果和产物摘要。`first/` 和 `rebuilt/` 各保留候选包及完整 `SHA256SUMS.txt`，其中包括浮光深境 VI 独立 ZIP。GitHub Release 的校验文件从中提取实际随发行上传的安装包和皮肤 ZIP 两行。失败时按报告和对应日志定位。 [Engine API 定义](../src/core/manifest.ts)

## 登记真实 PR 的检查结果

在 PR 记录提交 SHA、执行环境、通过或失败的检查、引擎 tarball 摘要和本地报告路径。拥有提交状态写权限时，可把已通过的报告登记为 `local/verify`。以下示例先核对报告对应的是当前 PR head。

```powershell
$number = <PR-number>
$report = Get-Content .cache/local-verification/<verify-directory>/result.json -Raw | ConvertFrom-Json
$pr = gh pr view $number --json headRefOid,url | ConvertFrom-Json
if (!$report.passed -or $report.commit -ne $pr.headRefOid) { throw 'Current PR head needs a passing report' }
gh api --method POST "repos/Activer007/dsh-skin-engine/statuses/$($pr.headRefOid)" `
  -f state=success -f context=local/verify `
  -f description="Local checks and $($report.first.artifacts.Count) reproducible archives" `
  -f "target_url=$($pr.url)"
gh pr checks $number
```

Auto Review 单独检查。PR 有新提交时，应核对新的 head 和审查回执。常规 PR 按改动范围选择检查，打包基线和主线迁移使用上面的完整命令。

## 从维护分支迁移到 main

1. 本地检查流程先通过一张真实 PR 合入 `codex/v1-maintenance`。
2. 更新远端引用，确认 `origin/main` 是 `origin/codex/v1-maintenance` 的祖先。单开 `codex/v1-maintenance` 到 `main` 的 PR，对其实际 head 执行本地检查并等待 Auto Review。
3. 用 merge commit 合并，保留 `codex/v1-maintenance`。核对 `main` 的两个父提交和文件树。第二父提交应为已验收的维护分支提交，合并树应与该提交一致。
4. 迁移 PR 合并后，后续分支从 `main` 创建，PR 和打包也以 `main` 为基准。若需撤销迁移，通过普通 PR 执行 `git revert -m 1 <merge-commit>` 并审查回退结果，期间可用保留的维护分支核对原代码。
