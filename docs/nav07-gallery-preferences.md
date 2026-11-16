# NAV07：图库收藏、最近应用与排序

## 范围与实现

开发基线：`07be9b65e4c902b6056b4d567f15aa13e0f9a413`（PR #50 合并后的主线）。这份任务不改变 NAV06 的验收结论；其真实共存和未验项另行收口。

1. 卡片独立收藏按钮（不嵌套按钮、不改变详情选择），支持取消及“只看收藏”筛选。
2. 目录顺序、名称、最近应用三种排序。名称跟随界面语言；最近应用将未使用项目保持原目录相对顺序。排序和筛选不改变正在编辑的皮肤或草稿。
3. 最近记录只来自本窗口收到 Host 成功响应的显式应用（含聊天预览工具条的应用）；预览、取消、超时、目录刷新、其他窗口保存和恢复默认均不计入。去重保留 20 个 ID，可单独清空。响应丢失时仍回读并更新当前皮肤。回读无法判断哪一个窗口完成了写入，所以不增加最近应用记录。
4. 偏好存放本浏览器 origin 的独立 `dsh-skin-engine.gallery.v1` localStorage 项。只含版本、收藏 ID、最近 ID 和排序，不写 Host Profile，也不写包文件，不是跨设备/账号同步。共享同一浏览器 origin 的窗口使用相同 UI 偏好。
5. 收藏最多 500 项；已卸载/暂缺 ID 不产生卡片，重装相同 ID 可保留收藏。记录数量有限，不做无限历史。异常 JSON、未知版本恢复默认；存储拒绝/配额失败后保留内存状态并提示，应用保存不受影响。
6. `storage` 事件同步其他标签页；每次写前读取最新值，避免顺序操作覆盖。localStorage 不提供跨窗口原子事务，同时同毫秒写入仍可能后写覆盖；这是 UI 偏好边界，不引入数据库或锁服务。
7. 收藏筛选中取消收藏后焦点回搜索框，清空最近后焦点回排序，控件使用可访问标签和按下状态。插件卸载移除 storage 监听；偏好保留，草稿仍按原生命周期清除。

不包含：独立皮肤编辑器、拖拽自定义排序、收藏目录、云同步、持久暂停、自动切换皮肤、第三方兼容声明修改。

## 验证与交接

云端源码通过 GitHub 文件读取恢复并逐文件校验 Git blob SHA，与固定基线一致；不是完整 Git 历史 checkout。新增逻辑与既有控制器定向测试验证收藏/最近、10/100 项纯数据排序、存储降级、回读确认和预览隔离。真实 DSH 宿主行为不能由这些测试替代。

新增 `--suite gallery-preferences`，沿用 `docs/acceptance.md` 的运行方式，分别对同一候选 tarball 在官方 Web 与 Windows Desktop 执行。覆盖：

- 键盘收藏/取消、只看收藏、空结果焦点；筛选/排序不写 Host。
- 跨面板偏好与草稿隔离；预览不记入、成功应用才记入。
- reload 后收藏/最近/排序保留；清最近保留收藏。
- 中英文、窄屏与截图 `gallery-preferences-en.png`、`gallery-preferences-zh-760.png`。

### 双端实测

PR #52 最终候选 `5093e0f40c322bd5c4362ec4240b5a2e864657d9` 合入 `917034f0613dc61a480b60ec5e0a164138d0fdf3`。两端报告中的归档 SHA-256 均为 `7220ae7db2c4002b44b96b7275a1aef0e42d6d58a91ac64044ff3b785e843379`，宿主均为官方 DSH `0.2.2-rc.1`。完整本地检查通过 106 项测试和 27 份可复现归档。 PR #52 (archived PR #52)

- Web 报告及截图位于 `.cache/nav07-gallery-preferences/confirmed/web-1sfYw6/`，Windows Desktop 位于 `.cache/nav07-gallery-preferences/confirmed/desktop-1AvB2n/`。
- 两端通过键盘收藏、筛选焦点、预览历史隔离、明确应用后的最近记录和刷新持久化。10/100 包完成真实排序和滚动懒加载，100 包末项在滚动前均未加载。
- 双端报告无未捕获页面异常，隔离宿主均已退出。Windows 日志中有通用资源加载提示。Web 首轮宿主引导遮挡的失败记录仍保存在 `.cache/nav07-gallery-preferences/host/web-1vPioL/result.json`。

### 补丁交付时的云端结果

- `npm run typecheck`、`npm run lint`、差异检查通过。
- `gallery-preferences`、`appearance-session`、`appearance-navigation`、`skin-switch` 共 27 项定向测试通过，包含成功保存/失败/未知结果回读的历史记录语义。
- 构建已完成 host/client bundle，但整体 `npm run build` 在打包原示例时因云端源码快照缺少 `skin-sources/examples` 文件而停止；不能称完整 build、全量测试或 verify:local 通过。
- 新宿主验收脚本尚未运行，需 LHA 同包双端执行并修正实际发现；无真实界面截图交付，也没有把逻辑测试冒充视觉验收。
