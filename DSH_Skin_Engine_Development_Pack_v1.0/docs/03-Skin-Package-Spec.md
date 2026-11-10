# 03 · Skin Package Specification

## 1. 包结构

```text
my-skin/
├── skin.json              # 必需：皮肤清单
├── tokens.json            # 必需：语义化视觉令牌
├── effects.json           # 必需：内置效果配置，可为空
├── theme.css              # 必需：受限 CSS
├── preview/
│   ├── light.webp
│   └── dark.webp
└── assets/
    ├── images/
    ├── icons/
    └── fonts/
```

## 2. Manifest 约定

见 `schemas/skin-manifest.schema.json`。关键字段：

- `schema`：固定为 `dsh.skin/v1`。
- `id`：全局唯一、稳定 ID，更新时不能随意更改。
- `version`：SemVer。
- `engineApi`：声明兼容的 Skin Engine API。
- `dshCompatibility`：声明适配的 DSH 版本范围。
- `entry`：Tokens、CSS、Effects Profile 入口。
- `capabilities`：声明允许使用的能力；Registry 不认识的能力拒绝或隔离。
- `preview`：管理器预览图。

## 3. Tokens 设计

Tokens 使用语义化命名，不直接写宿主内部变量名：

```json
{
  "schema": "dsh.tokens/v1",
  "colors": {
    "canvas": "#0b1220",
    "surface": "#111d2d",
    "surfaceRaised": "#18283a",
    "textPrimary": "#edf4ff",
    "textSecondary": "#9fb0c4",
    "accent": "#6dc7ff",
    "accentStrong": "#8a8cff"
  },
  "radius": { "panel": 18, "control": 10, "pill": 999 },
  "typography": { "uiFont": "system-ui", "monoFont": "ui-monospace" },
  "shadow": { "panel": "0 18px 60px rgba(0,0,0,.28)" }
}
```

Host Adapter 在版本化映射表中，将这些语义令牌映射到当前 DSH 支持的 CSS Variables。皮肤包不直接猜测 DSH 的私有 Token。

## 4. Effects Profile

皮肤只声明内置效果 ID 与参数，不包含执行代码：

```json
{
  "schema": "dsh.effects/v1",
  "effects": [
    { "id": "glass.liquid", "enabled": true, "renderer": "css", "params": { "blur": 16, "tintAlpha": 0.18, "saturation": 1.25 } },
    { "id": "ambient.aurora", "enabled": true, "renderer": "css", "params": { "speed": 0.25, "intensity": 0.55 } },
    { "id": "particles.dust", "enabled": true, "renderer": "canvas2d", "params": { "density": 0.35, "speed": 0.25 } }
  ]
}
```

参数由引擎内置 Schema 校验。未知效果 ID 不执行，显示兼容性提示。

## 5. CSS 约束

- 所有皮肤规则必须限定在 `:root[data-dsh-skin-id="<id>"]` 或引擎提供的明确表面作用域内。
- 禁止 `@import`、远程 `url(http...)`、`javascript:`、`expression()`、`behavior` 等危险或不可审计内容。
- 资源引用只允许包内相对路径，并通过 Host Asset Route 提供。
- 不允许全局重置 `*`、`html`、`body` 的布局属性；根级 Tokens 例外。
- 不允许覆盖 `z-index`、`position`、`pointer-events` 等宿主关键属性，除非 Adapter 明确开放对应 surface slot。
- 不允许使用 CSS 隐藏宿主交互控件、输入框、菜单和弹窗。

## 6. 版本与升级

- `schema` 变更必须升级 schema version。
- `engineApi` 不兼容时禁止激活，提供回退。
- 皮肤资源更新先写 staging，校验成功再替换。
- 更新失败保留上一版本目录。
- 用户配置按 `skinId + settingKey` 存储；皮肤更新不得静默清除未知配置。

## 7. 示例

本包提供 `examples/skins/deep-ocean`、`aurora`、`obsidian-neon` 三个最小示例。它们用于验证包契约，不代表最终品牌视觉已冻结。
