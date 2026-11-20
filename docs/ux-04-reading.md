# UX-04 · 常用调节与输入框可读性

「深海光境」详情直接显示光场强度、光束长度、漂移；「流光极幕」显示光幕强度、流动速度。控制项读取皮肤声明、当前开关及已有草稿，与「效果与性能」共用参数范围和保存操作。经典皮肤和未声明对应效果的 Alpha 沿用原详情布局。

输入框透明度达到 **75%** 时，滑块旁提示亮背景可能影响辨认，并提供恢复该皮肤默认透明度的按钮。该操作只修改草稿中的透明度；「自定义皮肤 → 重置偏好」仍可重置整套皮肤。经典 Deep Ocean 的默认透明度为 18%，经典 Aurora 为 0%。沿用既有的减少透明度与强制颜色处理。

## Windows Desktop 实拍

官方 DSH 0.2.2-rc.5，中文界面，1280 × 860。基线 `93ef0df` 和候选 `f382eb4` 各使用独立配置，导入相同的两个 0.2.0 ZIP。在同样的两轮对话中滚到第 24 段和第二个代码块，保持相同的三行输入。基线使用包默认值；候选使用下列手动设置，未变更发行版默认值。

| 皮肤 | 基线详情 / 聊天 | 候选详情 / 聊天 | 候选实拍参数 |
| --- | --- | --- | --- |
| 深海光境 | [详情](images/ux-04/deep-ocean-v2-settings-before.webp) · [聊天](images/ux-04/deep-ocean-v2-reading-before.webp) | [详情](images/ux-04/deep-ocean-v2-settings-after.webp) · [聊天](images/ux-04/deep-ocean-v2-reading-after.webp) | 强度 40%，长度 85%，漂移 0%，输入框透明度 85% |
| 流光极幕 | [详情](images/ux-04/aurora-v2-settings-before.webp) · [聊天](images/ux-04/aurora-v2-reading-before.webp) | [详情](images/ux-04/aurora-v2-settings-after.webp) · [聊天](images/ux-04/aurora-v2-reading-after.webp) | 强度 40%，速度 100%，输入框透明度 85% |

读取输入文字实际前景色 `rgb(249, 250, 251)`，从原始 PNG 取三行文字右侧背景色（编辑区左上角偏移 x=320，y=16、40、64 CSS 像素），计算相对亮度对比度并取最低值。两张基线均为 13.3:1；深海光境候选为 15.0:1，流光极幕候选为 17.4:1。结果只适用于截图中这三处背景；高透明度提示也考虑到用户自选亮背景的情况。

两次有效实拍均确认所选皮肤及保存值，页面错误为零，测试实例已退出。构建、类型检查、lint 与 `node --test test/appearance-hierarchy.test.mjs` 通过。定向用例覆盖关闭或零强度的 Alpha 偏好、两个 V2 的快捷项、提示与滑块关联、单项恢复、两款经典皮肤默认值。
