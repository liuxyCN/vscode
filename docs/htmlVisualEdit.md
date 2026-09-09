# Integrated Browser HTML 可视化编辑：属性栏、Preview 与保存流程

本文档说明 Integrated Browser **HTML 可视化编辑模式**中，属性栏（侧栏）与页面 **Preview** 如何同步，以及 **保存写盘**、**自动刷新抑制**、**Undo/Redo** 的完整策略与实现路径。

> **平台要求**：HTML 可视化编辑仅在 Electron 桌面版、且浏览器标签关联本地 `.html` / `.dc.html` 文件时可用。

---

## 概述

HTML 可视化编辑采用 **双通道** 设计：

| 通道 | 作用 | 是否写盘 |
|------|------|----------|
| **Live Preview** | 属性栏输入 → 页面 DOM 即时预览 | 否 |
| **Save to File** | 将变更合并进源文件并持久化 | 是 |

Preview 只改浏览器内 DOM；Save 才改磁盘上的 HTML/DC 源文件。保存时 `_writeSource` 传 **`reload: false`**，因此不会主动整页刷新；`.dc.html` 再通过 **DC 热更新**（`__dcUpdate`）让运行时与落盘内容一致，编辑模式不中断。

> 保存后若仍出现整页刷新（编辑模式被关闭），通常来自 **扩展自带的文件监听**（如 Live Preview 一类扩展在文件变更后调用 reload），与内置 Auto Reload 无关。

---

## 架构与关键模块

```
┌─────────────────────────────────────────────────────────────────┐
│ Workbench（browserEditorHtmlEditFeature.ts）                     │
│  ┌──────────────┐    draft/baseline    ┌─────────────────────┐  │
│  │ 属性栏 Panel │ ◄──────────────────► │ _draft / _baseline  │  │
│  └──────┬───────┘                      └──────────┬──────────┘  │
│         │ input/change (50ms debounce)              │ Save        │
│         ▼                                           ▼             │
│  _flushPreview()                          _saveDraft → _savePatch│
│         │                                           │             │
│         │ applyHtmlEditPreview                      ▼             │
│         │                                  _commitHtmlEditSave    │
│  BrowserViewModel ──IPC──► FrameInspector    ├─ _writeSource      │
│         │                                    │  (reload: false)   │
│         │                                    └─ DC hot update     │
│         │ reselectElementByDomPath (Undo/Redo)                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Preload（preload-browserView.ts / HtmlEditBridge）               │
│  editPreview → applyPreview()       // 仅改 DOM，不写盘          │
│  htmlEditTextCommit → workbench     // 页内 inline 编辑回写侧栏   │
│  reselectByDomPath → elementPicked  // Undo/Redo 后重选元素       │
└─────────────────────────────────────────────────────────────────┘
```

| 模块 | 路径 |
|------|------|
| 属性栏与保存编排 | `src/vs/workbench/contrib/browserView/electron-browser/features/browserEditorHtmlEditFeature.ts` |
| Draft / Patch 类型 | `src/vs/workbench/contrib/browserView/electron-browser/browserHtmlEditTypes.ts` |
| 源文件 Patch 应用 | `src/vs/workbench/contrib/browserView/electron-browser/browserHtmlSourcePatches.ts` |
| 页面 Preview | `src/vs/platform/browserView/electron-browser/preload-browserView.ts` |
| Auto Reload 抑制 | `src/vs/workbench/contrib/browserView/electron-browser/features/browserAutoReloadFeatures.ts` |
| DC 热更新 | `src/vs/platform/browserView/electron-main/browserView.ts`（`updateDcTemplate` / `updateDcProps`） |

---

## 属性栏 ↔ 页面 Preview 同步

### 1. 状态模型

侧栏维护两份 draft 及若干辅助状态：

| 状态 | 含义 |
|------|------|
| `_draft` | 当前输入框中的值（随用户编辑变化） |
| `_baselineDraft` | 上次 **Save to File** 成功后的快照（或选中元素刚填充时的初始值） |
| `_lastPreviewStyles` | 已推到页面的样式增量，Preview diff 补偿用 |
| `_history` / `_historyIndex` | Undo/Redo 用的源文件快照（最多 50 条） |

Preview 与 Save 都基于 `_draft`；Save 时用 `buildBrowserHtmlEditSavePatch(domPath, baseline, draft)` 计算 **相对 baseline 的 diff**，无 diff 则提示「无变更」。

### 2. 选中元素 → 填充属性栏

用户点击页面元素时：

1. Preload 发送 `elementPicked`（含 `domPath`、`dcTplId`、`dcComponentName` 等）
2. Workbench 调用 `_populateDraftFromSelection`（结果写入 `_populateDraftPromise`，Save/Delete 前需 await）
3. 对 DC 模板内元素，异步 `_resolveDraftElementData`：
   - 通过 `getDcAnnotatedTemplate` 拉取带 `data-dc-tpl` 的 annotated 模板
   - 在源模板片段中定位对应节点，读取 **源 HTML** 上的文本/属性/样式
   - 若源文本为 `{{propName}}` 插值孔，打上 `data-dc-prop-hole` / `data-dc-prop-source`（`import` | `default`）
4. `_populateDraft` 写入 `_draft`、同步输入控件，并 `_syncBaselineFromInputs()` 设 baseline
5. 调度 `_previewScheduler`（首次 flush 与属性栏一致）

**策略**：属性栏展示以 **源文件语义** 为准（DC 元素读 annotated template）；prop 孔文本框显示 **页面渲染值**（`innerText`），保存时写回 prop 绑定位置而非模板内 `{{…}}` 字面量。

### 3. 属性栏输入 → Live Preview

| 步骤 | 说明 |
|------|------|
| 监听 | 文本/href/src/alt 及所有样式控件的 `input`/`change` |
| 防抖 | `RunOnceScheduler`，**50ms** 后执行 `_flushPreview` |
| 抑制 | `_suppressPreview === true` 时不调度（如 inline 编辑回写侧栏时） |

`_flushPreview` 逻辑：

1. 读取 `_readDraftFromInputs()` 得到当前 draft
2. **样式**：`diffBrowserHtmlEditStyles(baseline.styles, draft.styles)` 只下发 **相对 baseline 有变化的** style key；并用 `_lastPreviewStyles` 追踪「曾 preview 过、现被清空」的属性以便从 DOM 移除
3. **边框**：若宽/样式/颜色任一变化，四边 width 与 style/color 一并 preview（与侧栏 UI 联动）
4. 调用 `model.applyHtmlEditPreview({ domPath, styles, text, href, src, alt })`

IPC 链：`BrowserViewModel` → Main `BrowserViewInspector` → `frame.postMessage('vscode:browserView:editPreview')` → Preload `HtmlEditBridge.applyPreview`。

### 4. Preload 侧 DOM 应用（`applyPreview`）

- **样式**：写 `element.style`；值经 `sanitizeInlineStyleValue`；空字符串则 `removeProperty`
- **文本**：`applyTextPreview` 或 `textContent`（受 `canApplyTextPreview` 约束）；**不**对 `document.body` 改 text
- **链接/图片**：直接设 `href` / `src` / `alt`
- **Inline 编辑**：若该元素正在 `contenteditable`，同步更新 `_activeTextEdit.originalText`，避免 Escape 恢复错乱

Preview **不**调用 `__dcUpdate`、**不**写文件、**不**触发 reload。

### 5. 页内 Inline 编辑 → 属性栏

用户在页面上直接改字时：

1. Preload debounce 后发送 `htmlEditTextCommit`（`domPath` + `value`）
2. Workbench `_applyInlineTextCommit`：更新 `_draft.text` 与 `_textInput`，短暂 `_suppressPreview` 避免循环

属性栏与页面文字保持单向同步：**页内编辑 → 侧栏**；侧栏改字仍走 Preview 通道。

---

## 保存写盘流程

### 总览

```
用户点击 Save to File
        │
        ▼
若 _saveInFlight → 返回
await _populateDraftPromise
        │
        ▼
buildBrowserHtmlEditSavePatch(baseline → draft)
        │ 无 diff → 提示「无变更」
        ▼
_saveInFlight = true
_savePatch(patch)
        │
        ├─ source = _readAssociatedSource  ← 优先 text model buffer，否则读盘
        │
        ├─ [Prop 文本变更?]
        │       applyDcImportPropPatch / applyDcPropsDefaultPatch
        │       └─ 仅 prop → _commitHtmlEditSave + hotUpdate → return
        │
        └─ [普通 / 混合变更]
                resolveDcTplLocator → buildDcTplDomPath（DC 节点）
                getDcAnnotatedTemplate（异步）
                applyBrowserHtmlPatch → 新 source + 可选 dcTemplateHtml
                _commitHtmlEditSave(hotUpdate)
        │
        ▼
若成功：baseline ← draft；_lastPreviewStyles 清空
_saveInFlight = false
```

**Delete** 走同一条 `_savePatch({ removeElement: true })`，成功后清空 `_selected` 并重置 draft。

### `_commitHtmlEditSave`（核心提交策略）

**顺序为：先写盘，再热更新 DC，最后按 `domPath` 重选元素。**

```typescript
async _commitHtmlEditSave(source, hotUpdate?) {
  const resyncDomPath = hotUpdate ? this._selected?.domPath : undefined;
  await _writeSource(source, { reload: false });   // 1. 写 TextFileModel，不 reload
  if (hotUpdate) {
    await hotUpdate();                             // 2. DC 运行时热更新
    if (resyncDomPath) {
      await _resyncSelectionAfterDcHotUpdate(resyncDomPath); // 3. 重选元素
    }
  }
}
```

| 步骤 | 目的 |
|------|------|
| 写盘在热更新前 | 先持久化源文件；`_writeSource` 内会 suppress 内置 Auto Reload |
| `reload: false` | 禁止 `_writeSource` 末尾调用 `browserModel.reload()` |
| 热更新后重选 | DC 热更新会重建 DOM 节点，需按 `domPath` 重新选中以保持属性栏同步 |

### `_applyDcHotUpdateAfterSave`

按保存结果选择热更新路径（均调用 `window.__dcUpdate(name, kind, content, streaming)`，`streaming` 传 `false` 表示一次性完整更新）：

| 条件 | 热更新 |
|------|--------|
| import prop 已保存 | `readXDcDecodedTemplate` → `updateDcTemplate`（整棵 x-dc） |
| `applyBrowserHtmlPatch` 产出 `dcTemplateHtml` | `updateDcTemplate(component, templateHtml)` |
| default prop 已保存 | `readDataPropsFromSource` → `updateDcProps` |
| 普通 HTML 节点 | 无（Preview 已反映 DOM） |

`__dcUpdate` 只会 `registry.bump(name)` 触发 DC 组件重渲染，**不会**整页导航。

Main Process 侧（`browserView.ts`）的两点约束：

- `webContents.isLoading()` 时跳过 `executeJavaScript`
- `updateDcTemplate` 先比对 `window.__dcTemplateSource(name)`，内容相同则跳过，避免无谓重渲染
- `updateDcProps` 传入的是 **JSON 字符串**（DC 运行时 `parseDataProps` 要求）

### `_writeSource`

1. `suppressAutoReloadForResource(resource)` — 抑制内置 Auto Reload，默认 **1000 ms**
2. 更新 `ITextFileEditorModel`，`save({ source: browserHtmlEdit.source, reason: EXPLICIT })`
3. 若内容与 patch 结果相同则跳过 disk write，仍 `_pushHistory`
4. 若 `reload !== false`（如历史导航 Undo/Redo），则 `_markPendingEditModeRestore` + **`browserModel.reload()`**

HTML 编辑保存 **始终** `reload: false`。

### 保存路径分类

| 场景 | 源文件 Patch | 热更新 |
|------|----------------|--------|
| 普通 DOM 节点（非 DC tpl） | `applyBrowserHtmlPatch` → body/path | 无 |
| DC 模板内节点 | `applyDcTplPatch` → 更新 `<x-dc>` 内模板 | `updateDcTemplate(component, decodedHtml)` |
| Prop（`default`） | `applyDcPropsDefaultPatch` → `script[data-props]` | `updateDcProps(component, propsObject)` |
| Prop（`import`） | `applyDcImportPropPatch` → `<dc-import …>` | `updateDcTemplate`（从 `<x-dc>` 读出解码模板） |
| Prop 文本 + 样式等混合 | 先 prop patch，再 `applyBrowserHtmlPatch`（`text` 从 effectivePatch 剥离） | 按 DC tpl / prop 结果组合 |

### 并发与边界

| 机制 | 说明 |
|------|------|
| `_saveInFlight` | Save / Delete 互斥；Save 按钮禁用 |
| `_populateDraftPromise` | Save / Delete 前 await，避免 DC 模板未就绪 |
| `_savePatch` 返回 `boolean` | 仅成功时更新 baseline |
| `_readAssociatedSource` | 优先已 resolve 的 text model buffer |

---

## Auto Reload 与保存刷新

### 内置 Auto Reload

设置项 `workbench.browser.autoReloadOnFileChange` 开启时，`BrowserAutoReloadWatcher` 监听浏览器当前 `file://` URL 对应的文件，在 `UPDATED`/`ADDED` 事件后 **300ms 防抖**，再调用 `model.reload()`。

HTML 编辑写盘会命中同一文件，因此 `_writeSource` 在保存前调用一次 suppress：

| API | 行为 |
|-----|------|
| `suppressAutoReloadForResource(uri, durationMs?)` | 记录过期时间戳，默认 **1000 ms** |
| `isAutoReloadSuppressed(uri)` | 未过期则命中，watcher 跳过本次 reload |

Watcher 在 **两处** 检查抑制：收到文件事件时（不 `schedule` 防抖）、`_reloadPendingChange` 执行前（丢弃 pending）。

保存来源统一标识为 `SaveSourceRegistry` → `browserHtmlEdit.source`，便于遥测与调试区分。

### 扩展文件监听导致的刷新

若保存后页面 **整页 reload**（`did-navigate` 触发，编辑模式被关闭），常见来源是 **扩展自身的文件监听**：扩展监听到 HTML 文件变更后主动调用 reload，不经过 `IBrowserAutoReloadService`，因此上面的 suppress 无法拦截。

排查方向：

1. 禁用相关扩展（如 Live Preview 类）验证是否仍刷新
2. 检查扩展是否注册了 `createFileSystemWatcher` 并在回调中 reload 浏览器标签
3. 关闭该扩展的自动刷新配置

> 这类刷新需要在扩展侧解决；在 workbench 内追加更复杂的抑制逻辑无效。

### 为何不依赖「保存后 reload」

| 方案 | 问题 |
|------|------|
| 保存后 `browserModel.reload()` | 整页闪刷，编辑模式需 `_markPendingEditModeRestore` 恢复，体验差 |
| 仅写盘、不热更新 DC | 磁盘已更新但 DC 内存模板 stale，继续编辑可能不一致 |
| **`reload: false` + updateDcTemplate/Props** | 磁盘、DC 运行时、Preview DOM 三线一致，无整页 reload |

---

## Undo / Redo 与 Save 的差异

| 维度 | Save | Undo / Redo |
|------|------|-------------|
| `_writeSource` | `reload: false` | 默认 reload（`historyNavigation: true`） |
| 页面 | 热更新 / 保持 Preview 状态 | 整页 reload |
| 属性栏 | baseline 更新；DC 热更新后按 `domPath` 重选 | reload 后按 `domPath` 重选同步 draft |
| Auto Reload | `_writeSource` 内 suppress 1s | 不涉及（走 reload 加载历史快照） |

### Undo/Redo 后属性栏同步

1. 操作前保存 `_selected.domPath`，取消 pending preview
2. `_writeSource(history[index], { historyNavigation: true })` → 写盘 + reload
3. `_resyncSelectionAfterHistoryNavigation`：
   - 等待 loading 结束、编辑模式恢复
   - `model.reselectElementByDomPath(domPath)` → Preload `findElementByDomPath` → 复用 `elementPicked` 流程
   - 等待 `onDidSelectElement` 触发 `_populateDraftFromSelection`
   - 元素已不存在（如 undo 删除了节点）→ 清空选中并重置 draft

---

## Preview 与 Save 的差异（策略摘要）

| 维度 | Live Preview | Save to File |
|------|--------------|--------------|
| 目标 | 浏览器 DOM | 磁盘源文件 + DC 运行时 |
| 触发 | 侧栏输入（50ms debounce） | 用户点击 Save |
| 文本（DC prop 孔） | 改渲染 DOM 文本 | 写 `data-props` 或 `<dc-import prop="…">` |
| 文本（普通节点） | DOM 文本节点 | 解析 HTML 源，改对应元素 |
| 样式 | `element.style` | 源文件 inline `style` 属性（经 sanitize） |
| DC 模板 | 不更新 `<x-dc>` | 更新源文件 + `__dcUpdate('html', …)` |
| Auto Reload | 不涉及 | `_writeSource` 内 suppress 1s |
| Baseline | 不变 | 成功后 baseline ← draft |

---

## 相关配置与常量

| 名称 | 值 | 位置 |
|------|-----|------|
| Preview debounce | 50 ms | `browserEditorHtmlEditFeature.ts` |
| Auto reload debounce | 300 ms | `browserAutoReloadFeatures.ts` |
| 写盘 suppress 窗口 | 1_000 ms（默认） | `BrowserAutoReloadService.suppressAutoReloadForResource` |
| DC 热更新后重选超时 | 2_000 ms | `_resyncSelectionAfterDcHotUpdate` |
| 历史栈上限 | 50 | `MAX_HISTORY` |

---

## 调试建议

1. **保存后仍整页刷新**：优先排查 **扩展的文件监听**（禁用扩展验证）；其次确认 `_writeSource` 走了 `reload: false`、`suppressAutoReloadForResource` 的 URI 与 watcher 监听的 `model.url` 一致。
2. **Preview 与保存结果不一致**：DC 节点是否走 tpl locator；prop 孔是否等 `_populateDraftFromSelection` 完成再 Save。
3. **保存成功但页面 DC 未更新**：Main Process 是否成功执行 `__dcUpdate`；`webContents.isLoading()` 时会跳过。
4. **Undo/Redo 后属性栏 stale**：检查 reload 完成后是否触发 `reselectElementByDomPath`；domPath 对应元素是否仍存在。

---

## 变更记录（文档）

- 2026-09：补充 prop 热更新、`updateDcProps`、`_commitHtmlEditSave` 顺序。
- 2026-09：补充 Undo/Redo `reselectElementByDomPath` 同步流程。
- 2026-09：整页刷新根因定位为 **扩展的文件监听**，移除 `beginHtmlEditSave` / `endHtmlEditSave` 等复杂抑制逻辑；`_commitHtmlEditSave` 改为先写盘再热更新；suppress 回归默认 1s。
