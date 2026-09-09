# Editor Picker 扩展 API

本文档说明 VS Code 中 **Editor Picker**（编辑器选择器）的扩展贡献方式，以及如何让扩展注册的编辑器出现在面包屑栏、右键菜单和「Reopen With」流程中。

## 概述

当同一文件存在多种可用编辑器时（例如 `.md` 可用「文本编辑器」或「Markdown Preview」），Workbench 会在面包屑栏右侧显示 **Editor Picker**，供用户切换编辑器类型。

Editor Picker 有两种 UI 形态：

| 形态 | 触发条件 | 用户体验 |
|------|----------|----------|
| **Edit / Preview 按钮** | 存在匹配的 `editorPreviewButtons` 贡献，且文本编辑器 + 至少一个 preview 编辑器可用 | 分段按钮，一键切换 |
| **下拉菜单** | 无匹配的 `editorPreviewButtons`，或有多个 preview 但无按钮映射 | 点击当前编辑器名称，弹出列表 |

此外，用户还可通过：

- 命令 **`Reopen Editor With...`**（`workbench.action.reopenWithEditor`）
- 编辑器标签页右键菜单 **Reopen With**
- 命令 **`reopenActiveEditorWith`**（指定 `viewType` 直接切换）

来切换编辑器。

---

## 扩展贡献流程

要让自定义编辑器进入 Editor Picker，通常需要 **两步**：

1. 在 `package.json` 中通过 **`customEditors`** 声明编辑器（注册到 Editor Resolver）
2. （可选）在 `package.json` 中通过 **`editorPreviewButtons`** 声明 Edit/Preview 按钮映射

仅完成第 1 步时，编辑器会出现在下拉菜单中；完成第 2 步且条件满足时，可替换为 Edit/Preview 双按钮。

---

## 1. `customEditors` 贡献点

在 `contributes.customEditors` 中注册自定义编辑器。每个条目对应 Editor Picker 中的一项。

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `viewType` | ✅ | 编辑器唯一 ID，建议包含扩展 ID 前缀（如 `myExt.previewEditor`） |
| `displayName` | ✅ | 在 Editor Picker 中显示的名称 |
| `selector` | ✅ | 匹配的 glob 列表，如 `{ "filenamePattern": "*.md" }` |
| `priority` | ❌ | 控制是否自动作为默认编辑器打开，见下文 |

### `priority` 取值

可为字符串，或分别指定 `textEditor` / `diffEditor`：

| 值 | 含义 |
|----|------|
| `default` | 打开文件时自动使用（若无其他 default 编辑器） |
| `option` | 不自动使用，但出现在 Editor Picker / Reopen With 中 |
| `explicit` | 仅通过 Reopen With 或显式关联打开；diff 模式默认为此值 |
| `builtin` | 内置编辑器优先级（扩展一般不用） |

### 示例

```json
{
  "contributes": {
    "customEditors": [
      {
        "viewType": "myExt.previewEditor",
        "displayName": "My Preview",
        "priority": "option",
        "selector": [
          { "filenamePattern": "*.md" }
        ]
      }
    ]
  },
  "activationEvents": [
    "onCustomEditor:myExt.previewEditor"
  ]
}
```

### 运行时注册 Provider

在扩展激活时注册实际编辑器实现：

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'myExt.previewEditor',
      new MyPreviewEditorProvider(),
      { supportsMultipleEditorsPerDocument: false }
    )
  );
}
```

> `viewType` 必须与 `package.json` 中 `customEditors` 的 `viewType` 一致。

---

## 2. `editorPreviewButtons` 贡献点

将 Editor Picker **下拉菜单** 替换为面包屑栏上的 **Edit / Preview 分段按钮**。

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `filenamePattern` | ✅ | 匹配的 glob（如 `*.md`、`*.svg`） |
| `previewEditor` | ✅ | Preview 按钮打开的编辑器 `viewType`，必须是已注册的编辑器 ID |
| `editLabel` | ❌ | Edit 按钮文案，默认 `"Edit"` / `"编辑"` |
| `previewLabel` | ❌ | Preview 按钮文案，默认 `"Preview"` / `"预览"` |

Edit 按钮固定打开 **默认文本编辑器**（`default` editor association）。

### 示例

```json
{
  "contributes": {
    "customEditors": [
      {
        "viewType": "myExt.previewEditor",
        "displayName": "My Preview",
        "priority": "option",
        "selector": [{ "filenamePattern": "*.md" }]
      }
    ],
    "editorPreviewButtons": [
      {
        "filenamePattern": "*.md",
        "previewEditor": "myExt.previewEditor",
        "editLabel": "%myExt.edit%",
        "previewLabel": "%myExt.preview%"
      }
    ]
  }
}
```

### 显示条件

Workbench 在以下条件 **全部满足** 时显示 Edit/Preview 按钮（而非下拉菜单）：

1. 当前资源匹配某条 `editorPreviewButtons.filenamePattern`
2. 文本编辑器在该资源的可用编辑器列表中
3. 至少一个 `previewEditor` 对应的编辑器在可用列表中
4. 当前不是 diff 编辑器

### 多个 Preview 贡献共存

多个扩展可为同一 glob 注册不同的 `previewEditor`（例如 Markdown 官方扩展与第三方预览扩展同时存在）：

- **不再** 因多个 preview 而回退到下拉菜单
- 所有匹配的 preview 编辑器都会参与按钮逻辑
- **Preview 按钮** 打开优先级最高的可用 preview（后注册的贡献优先级更高）
- 当前已在任意已注册 preview 中时，Preview 按钮保持高亮

若只注册了 `customEditors` 而 **没有** `editorPreviewButtons`，则始终使用下拉菜单。

---

## 3. 命令 API

扩展可通过命令以编程方式切换编辑器。

### `reopenActiveEditorWith`

用指定 `viewType` 重新打开当前活动编辑器。

```typescript
await vscode.commands.executeCommand('reopenActiveEditorWith', 'myExt.previewEditor');
```

### `workbench.action.reopenWithEditor`

弹出 Editor Picker 让用户选择（与 UI 下拉等效）。

```typescript
await vscode.commands.executeCommand('workbench.action.reopenWithEditor');
```

---

## 4. 用户设置

| 设置 | 说明 |
|------|------|
| `workbench.editorAssociations` | 按 glob 配置默认编辑器，如 `{ "*.md": "myExt.previewEditor" }` |
| `workbench.diffEditorAssociations` | diff 场景下的默认编辑器 |
| `workbench.editor.hiddenEditorTypes` | 从 Editor Picker 中隐藏的编辑器 ID 列表（当前活动的编辑器仍可见） |

用户通过 Editor Picker 中的 **Set Default** 子菜单修改上述关联。

---

## 5. 内置示例

### Markdown（`markdown-language-features`）

```json
"customEditors": [
  {
    "viewType": "vscode.markdown.preview.editor",
    "displayName": "Markdown Preview",
    "priority": { "textEditor": "option", "diffEditor": "option" },
    "selector": [{ "filenamePattern": "*.md" }]
  },
  {
    "viewType": "vscode.markdown.editor",
    "displayName": "Markdown Editor",
    "priority": { "textEditor": "option", "diffEditor": "explicit" },
    "selector": [{ "filenamePattern": "*.md" }]
  }
],
"editorPreviewButtons": [
  {
    "filenamePattern": "*.md",
    "previewEditor": "vscode.markdown.editor"
  }
]
```

### SVG 图片预览（`media-preview`）

```json
"editorPreviewButtons": [
  {
    "filenamePattern": "*.svg",
    "previewEditor": "imagePreview.previewEditor"
  }
]
```

### Integrated Browser（`*.html` / `*.htm`）

Workbench 内置注册：

- **Editor ID**：`workbench.editor.browser`（Integrated Browser）
- **优先级**：`option`（出现在 Editor Picker，非默认）
- **Edit/Preview 按钮**：`*.html` / `*.htm` → Preview 为 Integrated Browser

---

## 6. 架构关系

```
package.json
  ├── customEditors          →  Editor Resolver 注册编辑器
  └── editorPreviewButtons   →  EditorPreviewButtonsService 注册按钮映射

扩展 activate()
  └── registerCustomEditorProvider(viewType, provider)

用户打开 / 切换文件
  └── EditorResolverService.getEditors(resource)
        └── Editor Picker UI（breadcrumbsControl / editorTypePicker）
              ├── 有 editorPreviewButtons 匹配 → Edit/Preview 按钮
              └── 否则 → 下拉菜单
```

---

## 7. 源码位置

| 组件 | 路径 |
|------|------|
| `editorPreviewButtons` 扩展点 | `src/vs/workbench/browser/parts/editor/editorPreviewButtons.ts` |
| Editor Picker UI（面包屑） | `src/vs/workbench/browser/parts/editor/breadcrumbsControl.ts` |
| 编辑器类型切换逻辑 | `src/vs/workbench/browser/parts/editor/editorTypePicker.ts` |
| Editor Resolver | `src/vs/workbench/services/editor/browser/editorResolverService.ts` |
| `customEditors` 扩展点 | `src/vs/workbench/contrib/customEditor/common/extensionPoint.ts` |
| Reopen With 命令 | `src/vs/workbench/browser/parts/editor/editorCommands.ts` |

---

## 8. 常见问题

### Q: 注册了 customEditor 但 Editor Picker 不显示？

- 确认 `priority` 不是 `explicit`（或用户未配置关联）
- 确认当前文件 glob 与 `selector.filenamePattern` 匹配
- 确认扩展已激活并调用 `registerCustomEditorProvider`
- 若仅有一个可用编辑器，Picker 不会显示

### Q: 有 customEditor 但没有 Edit/Preview 按钮？

需要额外添加 `editorPreviewButtons` 贡献，且文本编辑器与 preview 编辑器都必须在可用列表中。

### Q: 多个扩展注册了不同的 preview，会冲突吗？

不会。多个 `editorPreviewButtons` 可共存；Preview 按钮打开优先级最高的可用 preview，当前已在 preview 中时按钮保持高亮。

### Q: 与 `vscode.openWith` 的关系？

`vscode.openWith` 是打开 **新** 编辑器实例时指定 `viewType`；Editor Picker / `reopenActiveEditorWith` 用于 **切换当前已打开** 编辑器的类型。
