# Integrated Browser 标签页扩展 API

本文档说明如何通过 VS Code 扩展 API 查询 **Integrated Browser**（内置浏览器）的打开标签页，按 tab ID 导航或 reload 指定页面。

## 概述

Integrated Browser 为每个编辑器标签分配稳定的 **tab ID**（UUID）。扩展可通过 proposed API 获取所有打开的标签信息，并精确 navigate / reload 指定 tab，而无需依赖文件路径匹配或激活当前 tab。

| 能力 | 扩展 API | 命令 API |
|------|----------|----------|
| 列出打开的标签 | `vscode.browser.getOpenTabs()` | — |
| 读取 tab 属性 | `vscode.window.browserTabs` | — |
| 按 tab ID 导航 | `vscode.browser.navigateTab(tabId, url)` / `BrowserTab.navigate(url)` | `workbench.action.browser.navigateTab` |
| 按 tab ID reload | `vscode.browser.reloadTab(tabId)` | `workbench.action.browser.reloadTab` |

> **平台要求**：Integrated Browser 仅在 Electron 桌面版可用，Web 版不支持。

> **API 状态**：本 API 属于 proposed API，需在扩展 `package.json` 中启用 `"enabledApiProposals": ["browser"]`。

---

## 启用 Proposed API

```json
{
  "enabledApiProposals": ["browser"]
}
```

---

## 类型

### `BrowserTabInfo`

`getOpenTabs()` 返回的快照类型：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 稳定 tab 标识符，用于 `navigateTab` / `reloadTab` |
| `url` | `string` | 当前页面 URL |
| `filePath` | `string \| undefined` | 当 `url` 为 `file://` 时，解析后的绝对路径 |
| `isActive` | `boolean` | 是否为当前激活的 Integrated Browser 编辑器 |

### `BrowserTab`

`vscode.window.browserTabs` 中的 live 对象，包含 `BrowserTabInfo` 的全部字段，以及：

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 页面标题 |
| `icon` | `IconPath` | favicon 或默认 globe 图标 |
| `startCDPSession()` | `Thenable<BrowserCDPSession>` | 创建 CDP 会话 |
| `navigate(url)` | `Thenable<void>` | 导航到指定 URL |
| `close()` | `Thenable<void>` | 关闭标签 |

---

## 扩展 API

### `vscode.browser.getOpenTabs()`

返回当前所有 Integrated Browser 标签的快照数组。

```typescript
import * as vscode from 'vscode';

const tabs = vscode.browser.getOpenTabs();
for (const tab of tabs) {
  console.log(tab.id, tab.url, tab.filePath, tab.isActive);
}
```

**说明：**

- 返回值为**快照**，不会随 tab 状态自动更新；需要监听 `onDidChangeBrowserTabState` 等事件后重新调用。
- `filePath` 仅在 URL scheme 为 `file:` 时有值；http(s) 页面为 `undefined`。
- 同一文件路径可能对应多个 tab（例如不同 query/fragment），此时应使用 `id` 区分。

### `vscode.browser.navigateTab(tabId, url)` / `BrowserTab.navigate(url)`

按 tab ID 将指定页面导航到新 URL，**不要求**该 tab 处于激活状态。

调用会**等待导航完成**（默认超时 30 秒）再返回；若加载失败或超时，会抛出错误。

```typescript
const tabs = vscode.browser.getOpenTabs();
const target = tabs.find(t => t.url.startsWith('http://localhost:3000'));
if (target) {
  await vscode.browser.navigateTab(target.id, 'http://localhost:3000/dashboard');
}

// 或使用 live tab 对象
for (const tab of vscode.window.browserTabs) {
  if (tab.isActive) {
    await tab.navigate('https://example.com');
  }
}
```

#### 导航行为

根据目标 URL 与当前 URL 的差异，自动选择导航方式：

| 变更 | 示例 | 行为 | 页面效果 |
|------|------|------|----------|
| path / host / scheme | 换站点、换文件 | 完整 `loadURL` | 整页加载 |
| 仅 `?query` | `?v=1` → `?v=2` | 完整 `loadURL` | 重新请求文档 |
| 仅 `#hash` | `#1` → `#2` | 同文档 in-page 导航 | 不整页 reload；更新 `location`，驱动 deck-stage / hash 路由 / 锚点 |
| 与当前 URL 完全相同 | 再次 navigate 同一 URL | `reload()` | 整页刷新 |

**Hash 同文档导航**（Integrated Browser 内部实现）：

- 在页面内设置 `location.href` 并派发 `hashchange`
- **deck-stage**（`.dc.html` 幻灯片）：`#1`、`#2` 等 1-based 数字 hash 会调用 `deck-stage.goTo()`
- 其他 hash：尝试滚动到对应 `id` 的锚点元素；监听 `hashchange` 的 SPA 也会收到事件

```typescript
// deck-stage 幻灯片：从第 1 页切到第 3 页
const tab = vscode.browser.getOpenTabs().find(t => t.filePath?.endsWith('.dc.html'));
if (tab) {
  const base = tab.url.split('#')[0];
  await vscode.browser.navigateTab(tab.id, `${base}#3`);
}
```

#### URL 规范化

与地址栏输入规则一致：

- 无 scheme 的 URL（如 `example.com/path`）会自动加上 `http://`
- `localhost:3000` 等形式会自动加上 `http://`

Remote 开发时，扩展传入的 `localhost` URL 会按 Remote 隧道规则重写（与 Agent `navigate_page` 工具相同）。

#### 限制与错误

| 情况 | 错误 key |
|------|----------|
| `tabId` 为空 | `browserTabInvalidId` |
| `url` 为空字符串 | `browserTabInvalidUrl` |
| tab 不存在或已关闭 | `browserPageNotFound` |
| resource-backed tab 导航到其他 file 资源 | `browserTabResourceNavigationError` |
| 页面加载失败 | `browserTabNavigationFailed` |
| 30 秒内未完成 | `browserTabNavigationTimedOut` |

**resource-backed tab**（从工作区 HTML 文件打开的预览 tab）只能修改**同一文件**的 query / fragment，不能 navigate 到其他 `file://` 路径；换文件请用 `vscode.window.openBrowserTab()`。

若 hash 导航后需要**强制整页刷新**（而非同文档切页），请使用 `reloadTab`。

以上错误文案通过 `browserViewI18n`（mini i18n）本地化，随 UI 语言切换。

### `vscode.browser.reloadTab(tabId)`

按 tab ID reload 指定页面，不要求该 tab 处于激活状态。

```typescript
const tabs = vscode.browser.getOpenTabs();
const target = tabs.find(t => t.filePath === '/workspace/index.html');
if (target) {
  await vscode.browser.reloadTab(target.id);
}
```

**错误：**

- 若 `tabId` 不存在或 tab 已关闭，抛出 `browserPageNotFound`（mini i18n 本地化）。

### 等价方式：`vscode.window.browserTabs`

也可直接读取 live tab 对象：

```typescript
for (const tab of vscode.window.browserTabs) {
  if (tab.isActive) {
    await tab.navigate('https://example.com/new-page');
    // 或
    await vscode.browser.reloadTab(tab.id);
  }
}
```

### 事件

| 事件 | 说明 |
|------|------|
| `onDidOpenBrowserTab` | 新 tab 打开 |
| `onDidCloseBrowserTab` | tab 关闭 |
| `onDidChangeActiveBrowserTab` | 激活 tab 变化（影响 `isActive`） |
| `onDidChangeBrowserTabState` | url / title / icon 变化 |

---

## 命令 API

### `workbench.action.browser.navigateTab`

供扩展通过 `executeCommand` 调用，行为与 `vscode.browser.navigateTab` 相同。

```typescript
await vscode.commands.executeCommand('workbench.action.browser.navigateTab', tabId, url);
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `tabId` | `string` | tab ID，来自 `getOpenTabs()` 或 `BrowserTab.id` |
| `url` | `string` | 要导航到的 URL |

### `workbench.action.browser.reloadTab`

供扩展通过 `executeCommand` 调用，行为与 `vscode.browser.reloadTab` 相同。

```typescript
await vscode.commands.executeCommand('workbench.action.browser.reloadTab', tabId);
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `tabId` | `string` | tab ID，来自 `getOpenTabs()` 或 `BrowserTab.id` |

#### 示例：保存 HTML 后 reload 对应 preview tab

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async doc => {
      if (!doc.fileName.endsWith('.html')) {
        return;
      }

      const savedPath = doc.uri.fsPath;
      const tabs = vscode.browser.getOpenTabs();
      const matching = tabs.filter(t => t.filePath && path.normalize(t.filePath) === path.normalize(savedPath));

      for (const tab of matching) {
        await vscode.browser.reloadTab(tab.id);
      }
    })
  );
}
```

---

## 与现有命令的区别

| 命令 | 作用范围 |
|------|----------|
| `workbench.action.browser.reload` | 仅 reload **当前激活** 的 browser tab |
| `workbench.action.browser.navigateTab` | 将 **指定 tabId** 的 tab 导航到新 URL，无需激活 |
| `workbench.action.browser.reloadTab` | reload **指定 tabId** 的 tab，无需激活 |
| `workbench.action.browser.captureScreenshot` | 可选 `pageId` 参数，默认同上（激活 tab）。详见 [`captureScreenshot.md`](./captureScreenshot.md) |

---

## 内部 ID 说明

- tab ID 在 tab 创建时生成（UUID），生命周期内不变。
- Agent 工具中的 `pageId` 与扩展 API 中的 `id` / `tabId` 相同。
- Editor 资源 URI 形式为 `vscode-browser:///<uuid>`，可通过 `BrowserViewUri.forId(id)` 构造（workbench 内部使用）。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/vscode-dts/vscode.proposed.browser.d.ts` | Proposed API 类型定义 |
| `src/vs/workbench/api/common/extHostBrowsers.ts` | ExtHost 实现 |
| `src/vs/workbench/api/browser/mainThreadBrowsers.ts` | Main thread 桥接（含 Remote localhost 重写） |
| `src/vs/workbench/contrib/browserView/common/browserViewI18n.ts` | mini i18n 文案（错误信息与命令 metadata） |
| `src/vs/workbench/contrib/browserView/common/browserNavigationUtils.ts` | 导航等待、超时与 URL 规范化 |
| `src/vs/workbench/contrib/browserView/common/browserNavigateTab.ts` | navigateTab 核心逻辑 |
| `src/vs/platform/browserView/common/browserView.ts` | `urlsSameExceptFragment`、`buildHashOnlyNavigationScript`（hash 同文档导航） |
| `src/vs/platform/browserView/electron-main/browserView.ts` | 主进程 `loadURL`（hash-only / 完整加载分支） |
| `src/vs/workbench/contrib/browserView/electron-browser/features/browserNavigateTabFeature.ts` | navigateTab 命令注册 |
| `src/vs/workbench/contrib/browserView/electron-browser/features/browserReloadTabFeature.ts` | reloadTab 命令注册 |
