# Integrated Browser 截图命令 API

本文档说明如何通过 VS Code 命令 API 对 **Integrated Browser**（内置浏览器）进行截图，并将图片数据返回给扩展程序。

## 概述

Integrated Browser 提供两类截图能力：

| 方式 | 命令 ID | 返回图片 | 适用场景 |
|------|---------|----------|----------|
| **扩展命令 API** | `workbench.action.browser.captureScreenshot` | ✅ | 扩展程序、第三方 Chat（如 Roo Code） |
| **Add to Chat** | `workbench.action.browser.addScreenshotToChat` 等 | ❌ | 将截图作为附件加入 VS Code / Cursor Chat |

本文档重点介绍 **扩展命令 API**。

> **平台要求**：Integrated Browser 仅在 Electron 桌面版可用，Web 版不支持。

---

## 命令

### `workbench.action.browser.captureScreenshot`

截取 Integrated Browser 页面并返回图片二进制数据。

#### 调用方式

```typescript
import * as vscode from 'vscode';

const result = await vscode.commands.executeCommand<{
  mimeType: 'image/jpeg' | 'image/png';
  data: Uint8Array;
}>('workbench.action.browser.captureScreenshot', options);
```

#### 参数 `options`

所有字段均为可选。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `pageId` | `string` | 当前活动的浏览器编辑器 | 目标 browser page 的内部 ID |
| `quality` | `number` | `80` | JPEG 压缩质量，范围 0–100（仅 `format: 'jpeg'` 时生效） |
| `format` | `'jpeg' \| 'png'` | `'jpeg'` | 图片格式。`png` 为无损，体积更大 |
| `fullPage` | `boolean` | `false` | 是否截取整页（含滚动区域）。与 `pageRect` 互斥 |
| `pageRect` | `object` | — | 区域截图，页面坐标系 `{ x, y, width, height }` |
| `awaitNextPaint` | `boolean` | `false` | 等待下一帧合成后再截图（用于刚关闭 overlay 的场景） |

#### 返回值

```typescript
interface CaptureScreenshotResult {
  mimeType: 'image/jpeg' | 'image/png';
  data: Uint8Array;  // 图片二进制数据
}
```

扩展侧收到的 `data` 为 `Uint8Array`（或等价的二进制类型），可直接用于：

- 写入文件
- 转为 Base64 上传
- 传入自定义 Chat UI（如 Roo Code 对话框）

#### 错误

| 情况 | 错误信息 |
|------|----------|
| 未指定 `pageId` 且当前无活动的 Integrated Browser 编辑器 | `No active Integrated Browser editor` |
| 指定了 `pageId` 但找不到对应页面 | `No browser page found with ID {pageId}` |
| 页面尚未加载完成 | 底层截图重试失败后会抛出异常 |

---

## 使用示例

### 1. 截取当前视口（最常用）

```typescript
const { mimeType, data } = await vscode.commands.executeCommand(
  'workbench.action.browser.captureScreenshot',
  { quality: 80, format: 'jpeg' }
);
```

### 2. 整页截图（PNG 无损）

```typescript
const { mimeType, data } = await vscode.commands.executeCommand(
  'workbench.action.browser.captureScreenshot',
  { fullPage: true, format: 'png' }
);
```

### 3. 区域截图

```typescript
const { mimeType, data } = await vscode.commands.executeCommand(
  'workbench.action.browser.captureScreenshot',
  {
    pageRect: { x: 100, y: 200, width: 800, height: 600 },
    format: 'jpeg',
    quality: 90,
    awaitNextPaint: true,
  }
);
```

### 4. 保存到文件

```typescript
import * as vscode from 'vscode';

const { mimeType, data } = await vscode.commands.executeCommand<{
  mimeType: string;
  data: Uint8Array;
}>('workbench.action.browser.captureScreenshot');

const ext = mimeType === 'image/png' ? 'png' : 'jpg';
const uri = await vscode.window.showSaveDialog({
  filters: { Images: [ext] },
  defaultUri: vscode.Uri.file(`browser-screenshot.${ext}`),
});

if (uri) {
  await vscode.workspace.fs.writeFile(uri, data);
}
```

### 5. 传给 Roo Code 等第三方 Chat

Roo Code 使用独立 WebView 对话框，无法接收 **Add to Chat** 的截图。可通过本命令获取图片后自行传入：

```typescript
async function attachBrowserScreenshotToRooCode() {
  const result = await vscode.commands.executeCommand<{
    mimeType: string;
    data: Uint8Array;
  }>('workbench.action.browser.captureScreenshot');

  // 将 result.data 转为 Base64 或 Blob，传入 Roo Code 的消息接口
  const base64 = Buffer.from(result.data).toString('base64');
  // ... 调用 Roo Code 扩展提供的 API 或 postMessage
}
```

---

## 与 Add to Chat 命令对比

以下命令将截图加入 **VS Code / Cursor 内置 Chat** 输入框，**不返回**图片数据：

| 命令 ID | 说明 |
|---------|------|
| `workbench.action.browser.addScreenshotToChat` | 视口截图 → Chat 附件 |
| `workbench.action.browser.addAreaScreenshotToChat` | 框选区域 → Chat 附件 |
| `workbench.action.browser.addFullPageScreenshotToChat` | 整页截图 → Chat 附件（实验性） |

Add to Chat 需要 Chat 功能已启用（`chatIsEnabled`），且截图会出现在 Chat 输入框的附件区，而非 Roo Code 等第三方 UI。

---

## 实现说明

- **源码位置**：`src/vs/workbench/contrib/browserView/electron-browser/features/browserCaptureScreenshotFeature.ts`
- **底层 API**：`IBrowserViewModel.captureScreenshot()` → Electron `webContents.capturePage()`；整页截图走 CDP `Page.captureScreenshot`
- **类型定义**：
  - 命令参数：`IBrowserCaptureScreenshotCommandArgs`
  - 命令返回值：`IBrowserCaptureScreenshotCommandResult`
  - 截图选项：`IBrowserViewCaptureScreenshotOptions`（`src/vs/platform/browserView/common/browserView.ts`）

---

## 注意事项

1. **无公开 Extension API**：目前未在 `vscode.d.ts` 中声明专用 API，扩展需通过 `vscode.commands.executeCommand` 调用。
2. **`pageId` 获取**：默认使用当前活动的浏览器标签页。若需指定其他标签，需已知其内部 page ID（通常由 Agent 工具 `open_browser` / `list_browser_pages` 返回）。
3. **后台标签页**：底层实现会短暂激活渲染管线以支持后台标签截图，一般对用户无感知。
4. **整页截图尺寸**：整页截图最大边长受内部限制（约 2576px），超长页面会被缩放。
