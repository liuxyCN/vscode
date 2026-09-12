# Webview 文件拖拽

本文档说明 NeonTractor 中如何将文件拖拽到 webview，以及扩展如何通过 `acceptsFileDrops` 声明 webview 默认接收文件 drop。

## 概述

拖拽文件到 webview 上方时，行为取决于 webview 是否声明了 `acceptsFileDrops`：

| 场景 | 是否需要按 Shift |
|------|-----------------|
| 普通 webview（Markdown 预览、未声明的 Webview Panel 等） | **需要** — 按住 Shift 才能把文件 drop 进 webview |
| 普通 webview，希望文件落到下层编辑器 | **不需要** — 直接拖拽即可 |
| 已设置 `acceptsFileDrops: true` 的 webview | **不需要** — 可直接 drop 文件 |
| Chat MCP App 面板（内置 fork 默认） | **不需要** — 可直接 drop 文件 |
| 主聊天输入区 | **不需要** — 直接拖拽附件（与 webview 无关） |

> 不按 Shift 时，未声明 `acceptsFileDrops` 的 webview 会临时穿透 drag 事件，文件落到下层编辑器。这是 VS Code 的默认行为，便于「拖到编辑器打开文件」。

> **API 状态**：proposed API，proposal 名称为 `acceptsFileDrops`。类型定义见 `src/vscode-dts/vscode.proposed.acceptsFileDrops.d.ts`。

---

## 用户操作

### 将文件 drop 进普通 webview

1. 从资源管理器（或系统文件管理器）拖拽文件。
2. 移到目标 webview 上方。
3. **按住 Shift**，松开鼠标。

### 将文件 drop 到编辑器（webview 下方）

1. 拖拽文件到 webview 区域。
2. **不要按 Shift**，松开鼠标。

### 将文件 drop 进已启用 `acceptsFileDrops` 的 webview

直接拖拽并松开，**无需按 Shift**（包括 Chat MCP App 面板及通过 API 声明的扩展 webview）。

---

## 启用 Proposed API

扩展 `package.json`：

```json
{
  "enabledApiProposals": ["acceptsFileDrops"]
}
```

TypeScript 类型引用（扩展开发时）：

```typescript
/// <reference path="../../src/vscode-dts/vscode.proposed.acceptsFileDrops.d.ts" />
```

NeonTractor 发行版中，以下扩展已在 `product.json#extensionEnabledApiProposals` 预授权：

```json
"extensionEnabledApiProposals": {
  "NeonTractorInc.neontractor-ai": ["browser", "textDocumentChangeReason", "acceptsFileDrops"]
}
```

第三方扩展若未写入 `product.json`，可在扩展开发模式（F5）或启动参数 `--enable-proposed-api <extensionId>` 下调试。

---

## 类型

### `WebviewPanelOptions.acceptsFileDrops`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `acceptsFileDrops` | `boolean` | `false` | 为 `true` 时，文件可直接 drop 进 webview，无需按 Shift |

用于 `createWebviewPanel` 的 panel 选项（与 `enableScripts` 等同级）。

### `registerWebviewViewProvider` 的 `webviewOptions.acceptsFileDrops`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `acceptsFileDrops` | `boolean` | `false` | 同上，作用于 Webview View |

---

## 扩展 API

### `createWebviewPanel`

```typescript
import * as vscode from 'vscode';

const panel = vscode.window.createWebviewPanel(
  'neontractor.chatPanel',
  'Chat',
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    acceptsFileDrops: true,
  }
);
```

`acceptsFileDrops` 属于 **panel 选项**（`WebviewPanelOptions`），与 `enableScripts`（content 选项）写在同一对象中即可。

### `registerWebviewViewProvider`

```typescript
vscode.window.registerWebviewViewProvider('neontractor.chatView', provider, {
  webviewOptions: {
    acceptsFileDrops: true,
  },
});
```

### NeonTractorInc.neontractor-ai 完整示例

`package.json`：

```json
{
  "name": "neontractor-ai",
  "publisher": "NeonTractorInc",
  "enabledApiProposals": ["acceptsFileDrops"],
  "contributes": {
    "views": {
      "neontractor-chat": [{
        "type": "webview",
        "id": "neontractor.chatView",
        "name": "Chat"
      }]
    }
  }
}
```

`extension.ts`：

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('neontractor.chatView', {
      resolveWebviewView(webviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = '<html><body>Drop files here</body></html>';
      },
    }, {
      webviewOptions: {
        acceptsFileDrops: true,
      },
    })
  );
}
```

---

## webview 内处理 drop

`acceptsFileDrops: true` 只控制 NeonTractor 是否将 drag 事件交给 webview；webview 内部仍需自行监听并处理 drop：

```html
<script>
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('drop', e => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    // 处理 files ...
  });
</script>
```

---

## 常见问题

**Q：为什么默认需要按 Shift？**

A：多数 webview 覆盖在编辑器上方。不按 Shift 时，文件会穿透 webview 落到编辑器，符合「拖到编辑器打开文件」的习惯。只有明确需要接收文件的 webview 才应设置 `acceptsFileDrops: true`。

**Q：`NeonTractorInc.neontractor-ai` 设置了 `acceptsFileDrops: true` 但仍需按 Shift？**

A：逐项确认：

1. 扩展 `package.json` 含 `"enabledApiProposals": ["acceptsFileDrops"]`
2. 发行版 `product.json#extensionEnabledApiProposals` 已包含该扩展 ID（NeonTractor 内置已配置）
3. 创建 webview 时传入了 `acceptsFileDrops: true`（Panel 或 View 的 `webviewOptions`）
4. webview 内部已监听 `drop` 事件

**Q：聊天输入框拖拽附件与此有关吗？**

A：无关。聊天输入区由 DOM 直接处理拖拽，不受 webview Shift 逻辑影响。
