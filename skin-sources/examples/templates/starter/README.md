# 作者起步模板

这是一个静态浅色皮肤源码，适用于仓库当前支持的官方 DSH。可以先原样打包验证流程，再用自己的 ID 和配色制作主题。

1. 复制本目录到自己的工作目录。修改 `skin.json` 中的 `id`、名称、作者和版本。同步替换 `theme.css` 作用域中的 ID。
2. 修改 `tokens.json` 中的 `canvas` 和 `surface`。`effects.json` 的空数组保留静态效果。用当前[数据契约](../../../docs/03-Skin-Package-Spec.md)中已支持的字段扩展主题。
3. 如需缩略图，把自己的浅色预览放到 `preview/light.png`，在 `skin.json` 增加 `"preview": { "light": "preview/light.png" }`，并在 `capabilities` 增加 `"assets"`。记录图片来源和许可。
4. 从仓库根目录运行 `npm ci`，然后运行以下命令。将 `./my-skin` 替换为复制后的目录。打包时会校验清单、令牌、效果、CSS、资源和大小。

```powershell
npm run pack:skin -- ./my-skin ./dist
```

5. 在 DSH 切换到浅色外观，打开「设置 → Skin Engine → Import ZIP」，选择输出目录中以你的皮肤 ID 命名的 `.dshskin.zip`。预览后取消，确认已保存的主题未变，再应用并重启，核对选择是否保留。
