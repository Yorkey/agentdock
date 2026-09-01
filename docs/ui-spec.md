# UI 规范

本文件是本仓库渲染层（`apps/desktop/src/renderer`）**唯一的界面约定来源**：所有新模块（Skills、MCP 等）与对现有界面的改动都必须照此执行，与本文冲突的实现按本文修正；本文与代码冲突时，先改代码再回来同步本文。

标注 **[现状]** 的条目描述已落盘的代码；标注 **[规范]** 的条目是尚未完全落地的强制要求，新代码必须直接满足，老代码逐步补齐。

---

## 1. 设计原则

| 原则 | 具体含义 |
| --- | --- |
| 信息密度优先 | 列表行高 28–32px，不用大留白撑版面；宁可多显示一行会话，也不放装饰性图形 |
| 内容区不抢焦点 | 外壳（Activity Bar / 侧栏）用 `--surface-2`，内容区用 `--surface-1`；强调色只用于当前选中项与链接，不用于普通按钮底色 |
| 过程默认折叠 | 工具调用、推理、原始 JSON、`pre` 详情一律默认收起，只显示一行摘要；用户点开才展开 |
| 异步必须可见 | 任何超过一帧的操作都要有骨架屏 / 进度 / 错误态三选一，不允许界面停在旧数据上无提示 |
| 不引入组件库 | 图标一律内联 SVG（`viewBox="0 0 24 24"`、`aria-hidden="true"`；线框用 `stroke="currentColor"`，实心用 `fill="currentColor"`），不装 UI 库、不装图标库 |
| 无字面色值 | 组件样式里禁止出现 `#xxx` / `rgb()` / 颜色关键字，一律走 `var(--token)`；新增颜色先进 `tokens.css` |

---

## 2. 主题机制

### 2.1 三段结构

`apps/desktop/src/renderer/src/styles/tokens.css` 是唯一定义色值的地方，分三段：

| 段 | 选择器 | 作用 |
| --- | --- | --- |
| 亮色（默认） | `:root` | 全量 token 的基准定义，同时声明 `color-scheme: light` |
| 显式暗色 | `:root[data-theme='dark']` | 只覆写与亮色不同的 token，声明 `color-scheme: dark` |
| 跟随系统 | `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` | 与上一段取值**逐字一致**；未写 `data-theme` 时生效 |

> 后两段是重复的两份值，改暗色 token 时**必须两处同时改**，否则「跟随系统」和「显式暗色」会不一致。

### 2.2 解析与落地 **[现状]**

实现在 `renderer/src/lib/theme.ts`：

- 偏好三态：`system`（默认） / `light` / `dark`，持久化到 `localStorage`，键名 `agentdock.theme`（与已有的 `agentdock.activityId` 同风格）。
- `system` 时**不写** `html` 上的 `data-theme` 属性（靠媒体查询兜底）；`light` / `dark` 时写 `data-theme="light" | "dark"`。模块顶层在首帧之前先写一次，避免主题闪一下再纠正。
- 切换控件放在 Activity Bar 底部（靠 `.activity-spacer` 的 `flex: 1` 撑开，不用 `margin-top: auto`），三态循环切换，`aria-label` 说明当前态与下一态。
- 主进程 `apps/desktop/src/main/index.ts` 的 `BrowserWindow.backgroundColor` 按 `nativeTheme.shouldUseDarkColors` 取 `--surface-1` 对应值（亮 `#ffffff` / 暗 `#1b1c1f`），避免启动白闪，并监听 `nativeTheme` 的 `updated` 同步；渲染层通过 IPC `agentdock:theme:set-source` 同步 `nativeTheme.themeSource`。
- `WINDOW_BG` 是**全库唯一允许出现字面色值的组件外位置**，改 `--surface-1` 时要一起改。

### 2.3 暗色派生原则

不做机械反色。按类别分别处理：

| 类别 | 亮色做法 | 暗色做法 |
| --- | --- | --- |
| 表面 | 纯白到浅灰的实色阶梯 | 深灰实色阶梯（`#161719`–`#2b2d32`），**不用纯黑**，避免和阴影糊在一起 |
| hover / overlay | 深色半透明叠色 `rgba(15,23,42,.04)` | 浅色半透明叠色 `rgba(255,255,255,.06)`，保证叠在任意表面上都成立 |
| diff | 高饱和浅底 + 深字（`#dcfce7` / `#15803d`） | **低饱和半透明叠色 + 提亮前景**（`rgba(63,185,80,.16)` / `#7ee2a8`），底色透出下层表面，不出现荧光块 |
| 角色徽标 badge | 实色浅底 + 深字 | 同色相 `rgba(...,.15~.16)` 叠色 + 中亮度字，五个角色的明度保持齐平 |
| 时间线色带 role | 600 级：`--role-system` `#64748b`、`--role-user` `#2f6fe0`、`--role-context` `#0d8f6a`、`--role-assistant` `#7c4ddb`、`--role-tool` `#b120c4`。`--role-tool` 用品红而不是紫，避免和 `--role-assistant` 糊在一起 | **降饱和 + 降明度**（如 `--role-user` `#2f6fe0` → `#4f7fc4`），保证色带压在深轨道上不刺眼，同时五色仍可区分 |
| 危险态 | 实色浅底 `#fef2f2` | 半透明叠色 `rgba(248,113,113,.12)`，边框同样用透明度而非实色 |
| 阴影 | 低透明度冷灰 | 提高透明度到 0.4–0.5 的纯黑，暗色下弱阴影不可见 |
| 焦点环 | `rgba(37,99,235,.45)` | `rgba(110,168,254,.5)`，跟随 `--accent` 一起提亮 |

---

## 3. 颜色 token

以下为 `tokens.css` 实际存在的全部变量。**组件只允许引用这些名字。**

### 3.1 表面

| Token | 用途 |
| --- | --- |
| `--surface-1` | 内容区 / 窗口底色（`html`、`.session-pane`） |
| `--surface-2` | 外壳底色（`.activity-bar`、`.sidebar`） |
| `--surface-3` | 选中态底色（`.ws-session.is-active`、`.activity-btn.is-active`） |
| `--surface-subtle` | 弱底块：用户气泡、表头 `th`、行内代码 |
| `--surface-code` | 代码块与详情面板底（`.md-pre`、`.block-pre`、`.diff-block`、`.tool-chip`、`.traj-detail`） |
| `--surface-input` | 输入框与次级按钮底 |
| `--surface-hover` | 半透明 hover 叠色，**唯一允许的 hover 底色** |
| `--surface-overlay` | 遮罩层，半透明。文件预览侧滑的 scrim 在用 |
| `--surface-bubble` | 用户气泡底，当前别名到 `--surface-subtle`；要单独调气泡时改这里，不要改 `--surface-subtle` |

### 3.2 文字

| Token | 用途 | 约束 |
| --- | --- | --- |
| `--text-1` | 正文、标题、激活项 | 对比度 ≥ 7:1 |
| `--text-2` | 次级正文（引用块） | ≥ 4.5:1 |
| `--text-3` | 元信息、时间、计数、占位、图标默认色 | 要在最深的 `--surface-3` 上也 ≥ 4.5:1，所以比常见的次级灰更深；**不得用于正文** |

### 3.3 描边

| Token | 用途 |
| --- | --- |
| `--border` | 装饰性分隔线与卡片边框，不承担 3:1 |
| `--border-strong` | hover 时加深的装饰边框 |
| `--border-input` | 输入类控件边框，对框内与框外表面都 ≥3:1 |
| `--border-input-hover` | 输入类控件 hover 边框，同样 ≥3:1 |
| `--quote-border` | `.md-quote` 左侧 3px 竖条 |
| `--scrollbar-thumb` | 自定义滚动条滑块 |

### 3.4 强调与焦点

| Token | 用途 |
| --- | --- |
| `--accent` | 链接、激活 tab 文字与下划线、Activity Bar 激活图标、diff hunk 文字 |
| `--accent-border` | 输入框 `:focus` 的边框色 |
| `--focus-ring` | `:focus-visible` 外发光，固定用法 `box-shadow: 0 0 0 2px var(--focus-ring)`；只在 `base.css` 的全局规则里引用一次，组件不要重复写 |

### 3.5 危险态

| Token | 用途 |
| --- | --- |
| `--danger` | 错误文字与图标（`.pane-status.is-error`、`.badge-danger`、`.traj-rec.is-error`） |
| `--danger-border` | 错误徽标 / 卡片边框 |
| `--danger-surface` | 错误横幅底色（`.pane-status.is-error`） |

### 3.6 diff

| Token | 用途 |
| --- | --- |
| `--diff-add-bg` / `--diff-add-fg` | 新增行底 / 前景 |
| `--diff-del-bg` / `--diff-del-fg` | 删除行底 / 前景 |
| `--diff-hunk-bg` / `--diff-hunk-fg` | hunk 头（`@@`）底 / 前景，亮色下 `-fg` 指向 `--accent` |

### 3.7 角色色带（时间线 span）

`--role-system` / `--role-user` / `--role-context` / `--role-assistant` / `--role-tool`

对应 canvas 色带与图例圆点 `.traj-span-*` 的背景。轨道用 `getComputedStyle` 读这些 token 再 `fillRect`，不再为每条记录建 DOM。亮色轨道 `--timeline-track` 别名到 `--surface-subtle`（浅色），所以色带用 600 级才能过 3:1；暗色轨道是深底 `#26282d`，色带降饱和。五色需在同一条轨道上互相可区分；`--role-tool` 用品红 `#b120c4` 是为了和 `--role-assistant` 的紫区分。新增角色必须同时补齐色带与下面的徽标两组。

### 3.8 角色徽标（`.traj-badge-*`）

每个角色一对 `bg` / `fg`：

`--badge-system-bg/fg`、`--badge-user-bg/fg`、`--badge-context-bg/fg`、`--badge-assistant-bg/fg`、`--badge-tool-bg/fg`

徽标色相与色带一致，但**独立成组**——色带是纯色块（要够重），徽标是底色加文字（要够轻），不能互相复用。

### 3.9 时间线

| Token | 用途 |
| --- | --- |
| `--timeline-track` | 轨道底（`.traj-lane-track`） |
| `--timeline-focus-ring` | 聚焦色带的 canvas stroke，用高对比中性色（亮 `#111827` / 暗 `#e5e7ea`），**不用 `--accent`**，否则会和 `--role-user` 混淆 |

### 3.10 会话来源圆点（`.dot[data-source]`）

| Token | 对应来源 |
| --- | --- |
| `--source-default` | 未知 / 兜底 |
| `--source-cursor` | Cursor |
| `--source-claude-code` | Claude Code |
| `--source-codex` | Codex |

新增来源时在此处加一条，并同步 `.dot[data-source='...']` 规则。

### 3.11 其他

| Token | 值 / 用途 |
| --- | --- |
| `--tool-name-fg` | 工具名文字（`.tool-chip-name`、琥珀色），是唯一允许的「第三种强调色」 |
| `--font-sans` | `'SF Pro Text', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |
| `--font-size` | `15px` — 根字号，`html { font-size: var(--font-size) }` |
| `--radius-xs` | 4px — 行内代码、徽标、滚动条、小色块 |
| `--radius-sm` | 6px — 输入框、工具栏按钮、时间线轨道 |
| `--radius-md` | 8px — 卡片、代码块、Activity Bar 按钮 |
| `--radius-lg` | 16px — 聊天气泡 |
| `--radius-pill` | 999px — 胶囊徽标（`.badge`） |
| `--shadow-1` | 弱投影，用于贴边浮层 **[现状：尚无引用]** |
| `--shadow-2` | 强投影，用于自定义 tooltip / 菜单（`.hovertip`） |
| `--skeleton-base` / `--skeleton-sheen` | 骨架屏底色与扫光，`reduced-motion` 下只用 `-base` |

---

## 4. 字阶与行高

根字号 `15px`（`tokens.css` 的 `--font-size`，`base.css` 的 `html` 引用），Markdown 正文用 `em` 相对该基准。

| 字号 | 用途 |
| --- | --- |
| 10px | 胶囊徽标 `.badge`、角色徽标 `.traj-badge`（仅短大写标签，禁止承载正文） |
| 11px | 元信息：时间、通道标签、侧栏分组标题（大写 + `letter-spacing: .06em`） |
| 12px | 次级文本：摘要、路径、代码块内容、工具栏按钮、状态条 |
| 15px | 默认 UI 文本（按钮、列表项、表格单元格、侧栏标题 `.brand-mark`） |
| 16px | 长正文：`.md`、`.probe-title`、会话标题 `.session-title`、空态主标题 `.empty-title` |

**不新增其他字号。** 需要更大的标题时复用 16px 加粗，不要往上加。

| 行高 | 用途 |
| --- | --- |
| 1.35 | Markdown 标题 `.md-h` |
| 1.45 | UI 文本（列表项、`.traj-preview`、`.probe-title`） |
| 1.5 | 等宽代码块 |
| 1.7 | Markdown 正文 `.md` |

等宽字体 `--font-mono` 只用于：代码、文件路径、命令行、工具入参摘要、原始 JSON。**中文文案一律不用等宽。**

---

## 5. 间距与圆角

- 基准 4px。容器内边距取 `8 / 12 / 16 / 20 / 24`；元素间距取 `4 / 6 / 8 / 10 / 12`。
- 密集行内（徽标、折叠箭头、虚拟行）允许 2px 与 6px 的半档，其他位置不要出现 3、5、7、9 这类值。
- 结构性缩进由布局常量决定，不受 4 倍数约束：侧栏会话行左内边距 40px（嵌套 50px）、Trajectory 虚拟行左内边距 72px、详情面板左外边距 54px。改这些值时要三处一起看，否则轮次标签会错位。

| 圆角 | Token | 场景 |
| --- | --- | --- |
| 4px | `--radius-xs` | 行内代码、徽标、色块 |
| 6px | `--radius-sm` | 输入框、工具栏按钮、记录行 |
| 8px | `--radius-md` | 卡片、代码块、Activity Bar 按钮 |
| 16px | `--radius-lg` | 聊天气泡 |
| 999px | `--radius-pill` | 胶囊徽标 |

---

## 6. 控件尺寸

| 控件 | 尺寸 | 说明 |
| --- | --- | --- |
| Activity Bar | 宽 48px | `grid-template-columns: 48px minmax(0, 1fr)` |
| Activity Bar 按钮 | 40 × 40px，圆角 `--radius-md` | `.activity-icon` 20px |
| 侧栏 | 宽 280px，≤900px 时 220px | 折叠时列宽置 0 并 `visibility: hidden` |
| 侧栏分组行 `.ws-folder` | `min-height: 32px` | 展开 / 收起用 16px 线框文件夹图标（关 / 开），不显示条数 |
| 侧栏会话行 `.ws-session` | `min-height: 32px` | 选中 / 悬停底内缩 `2px 8px`，圆角 `--radius-sm`；文字缩进 40px / 嵌套 50px |
| 图标按钮 `.icon-btn` | 28 × 28px | 扫描、清除这类只有图标的按钮 |
| 行内文字按钮 `.btn-inline` | `height: 24px` | 「重试」这类跟在一行文字后面的按钮 |
| 工具栏按钮 `.traj-tool` | `height: 28px` | |
| 搜索输入 `.traj-search` | `height: 28px`，宽 220px | 右侧 76px 内边距留给结果计数与清除按钮 |
| 侧栏搜索 `.sidebar-search` | `.sidebar-toolbar` 里独占整行，`height: 28px` | 左右各 26px 内边距留给放大镜与清除按钮 |
| 折叠行 `.tool-chip > summary`、`.collapse-summary` | `min-height: 28px` | 整行可点，不是只有箭头可点 |
| 内容区最大宽度 | `.chat-inner` 与 `.skeleton-pane` 同为 860px 居中 | 骨架屏要和真实内容一样宽 |
| 用户气泡 | `max-width: min(68ch, 72%)` | 防止长英文糊成整块 |

**任何可点击元素的命中区不小于 28 × 28px**，视觉尺寸更小时用内边距补足。

---

## 7. 状态矩阵

每个可交互元素都必须定义下面五态，缺一不可：

| 状态 | 统一做法 |
| --- | --- |
| default | 透明底或 `--surface-input`，文字 `--text-3`（次级）或 `--text-1`（主要） |
| hover | `background: var(--surface-hover)`；文字提到 `--text-1`；带边框的元素改 `border-color: var(--border-strong)` |
| active / selected | `background: var(--surface-3)`；tab 额外用 `--accent` 画下划线，Activity Bar 把图标改成 `--accent` |
| focus-visible | 由 `base.css` 的 `:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible` 一条规则统一给出 `box-shadow: 0 0 0 2px var(--focus-ring)`，外加 `outline: 2px solid transparent` 兜住 forced-colors；**组件里不要再写 `outline: none`，也不要重复定义焦点态** |
| disabled | `opacity: .6` + `cursor: default`，不改颜色 token |

补充：

- **hover 不改变布局**：不允许在 hover 时加边框、改字号或改内边距导致行高跳动。
- **激活指示**：会话 tab 用 `.session-tab.is-active::after` 画一条 2px 下划线（`--accent`）。Activity Bar 不画指示条，选中项用 `.activity-btn.is-active` 的 `--surface-3` 底加 `--accent` 图标。侧栏会话选中用 `.ws-session.is-active::before` 画内缩圆角块（`z-index: -1`，避免盖住标题）。
- **行内操作图标**（`.file-actions.is-overlay`）：默认隐藏，只在行 `:hover` 或图标组自身 `:focus-within` 时出现。不要绑在整行 `:focus-within` 上，否则点开文件夹会一直挂着。不要单独铺底、加投影，图标直接叠在当前行上。
- **切换类按钮**（Trajectory 的 `比例` / `实时` / `轮次` / `调用`）必须有 `aria-pressed` 与 `.is-on` 两态；**统计类 chip**（`时长`）是纯文本，不做成按钮。时间线默认「比例 · 按时长」+「实时 · 压缩」：色块用事件自身时长（没有就画成点），空闲从轴上压掉，不要把等待画进上一条。打开「实时」则按墙钟留空档。
- **错误行**：只改前景色（`--danger`），不改底色，避免长列表里出现成片红块。

---

## 8. 反馈

| 场景 | 要求 |
| --- | --- |
| 首屏 / 列表加载 | 用骨架屏（`workbench/Feedback.tsx` 的 `SidebarSkeleton` / `PaneSkeleton`，`--skeleton-base` 色块按真实行高与列宽排布），**不用「加载中…」纯文字**；容器带 `role="status"` + `aria-live="polite"` + `aria-label` |
| 长任务进度 | 行内进度条 + 已处理数量（`扫描中 1,234`），数字用 `tabular-nums`，不遮挡列表 |
| 错误 | 统一用 `Feedback.tsx` 的 `PaneError`（`.pane-status.is-error` + `role="alert"`）显示一句可读原因，**并带 `.btn-inline` 的「重试」按钮**；模块级错误把它放在 `.module-body` 之前，面板级放在 `.session-head` 之后 |
| 空态 | 侧栏用 `.empty-inline`（单行灰字，不要套内容区那套居中大块），内容区用 `.empty-hero` + `.empty-title` + `.empty-copy`（标题一句、说明一句，保持居中） |
| 复制类操作 | 点击后按钮文案立即变「已复制」，**1.5s 内**复原；不弹 toast |
| 搜索 | 显示结果计数与清除按钮，命中处高亮；无结果时用空态而非空白 |

---

## 9. 动效 **[现状]**

时长与曲线走 token：`--motion-fast`（120ms）、`--motion-collapse`（150ms）、`--ease`。

| 动效 | 参数 | 用在哪 |
| --- | --- | --- |
| 颜色 / 底色过渡 | `--motion-fast` | `.activity-btn`、`.icon-btn`、`.ws-folder`、`.ws-session`、`.session-tab`、`.session-log`、`.btn-inline`、`.search-clear` |
| 边框过渡 | `--motion-fast` | `.sidebar-search` |
| 复制按钮显隐 | `opacity` 120ms | `.copy-btn` |
| 进度条推进 | `width` `--motion-collapse` | `.scan-fill` |
| 骨架屏扫光 | `background-position` 1.4s 循环 | `.skeleton-bar` |
| 不确定态进度 | `transform: translateX` 1.1s 循环 | `.scan-track.is-indeterminate .scan-fill` |
| 扫描中图标 | `rotate` 1s 循环 | `.icon-btn[aria-busy='true'] .icon-16` |

- 后三条是对「禁止位移与旋转 loading」的**明示例外**：不确定态进度与扫描按钮需要一个持续信号，静态色块传达不了「还在跑」。除这三处外不要再新增位移、缩放、弹跳、旋转。
- hover / focus 的**颜色**变化允许 120ms 过渡，但**布局**（边框宽度、字号、内边距）不允许过渡也不允许在 hover 时改变。
- 折叠展开目前靠 `<details>` 的原生行为，没有高度过渡；要加的话统一用 `--motion-collapse`。
- 全局收尾（`base.css` 末尾，实际用 `1ms` 而非 `0.01ms`，Chromium 下 `0.01ms` 会被某些动画忽略）：

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }

  .skeleton-bar {
    background: var(--skeleton-base);
  }

  .scan-track.is-indeterminate .scan-fill {
    width: 100%;
    transform: none;
    animation: none !important;
  }
}
```

---

## 10. 无障碍

| 项 | 要求 |
| --- | --- |
| 对比度 | 正文与背景 ≥ 4.5:1，`--text-3` 上的 11–12px 元信息同样按 4.5:1 校验；亮暗两套都要过 |
| 焦点可见 | 全程 Tab 可见焦点，见状态矩阵；禁止无替代的 `outline: none` |
| Tab 顺序 | Activity Bar（含底部主题按钮）→ 侧栏搜索与扫描 → 侧栏列表 → 内容区标题栏 → 内容区工具栏 → 内容列表。全部靠 DOM 顺序，**不要用 `tabindex` 调序**。例外：Trajectory 时间线每条 lane 一块 canvas、一个 Tab 停靠点，←/→ 与 Home/End 按命中结果移动（不要为每条记录建 button） |
| 语义属性 | 导航容器 `<nav aria-label>`；侧栏 `<aside aria-label>`；当前模块 / 当前会话 `aria-current`；折叠行 `aria-expanded`；开关按钮 `aria-pressed`；装饰 SVG `aria-hidden="true"` |
| 动态提示 | 扫描进度、错误横幅、复制结果用 `aria-live="polite"` |
| 隐藏模块 | 未激活模块用 `.is-hidden`（`display: none`）+ `aria-hidden`，保证不会被 Tab 命中 |
| 键盘快捷键 | `Cmd/Ctrl+1..9` 切模块；`Cmd/Ctrl+F` 聚焦当前视图搜索框；`Cmd/Ctrl+B` 折叠 / 展开侧栏；`Esc` 关闭文件预览侧滑。输入框聚焦时除 `Cmd/Ctrl+F` 外全部不拦截。实现在 `workbench/shortcuts.ts`，搜索框靠 `input[data-search-input]` 定位，同一模块里有多个时取 DOM 顺序最后一个可见的（内容区优先于侧栏），新模块的搜索框必须带这个属性 |
| tooltip | 长文本不用原生 `title`（会遮挡正文且不可控）。改用 `components/HoverTip.tsx`：延迟 300ms、portal 到 `body`、`--shadow-2` 投影、空间不够时上下翻转。长文本已切到 HoverTip（会话标题、路径、来源、工具摘要、diff 路径、Markdown 链接 URL）。短标签（图标按钮、复制按钮、Activity Bar）保留 `title` + `aria-label` |
| 文件预览 | 对话 Markdown 里的本地路径链接（相对 / 绝对 / `file://`）点击后从内容区右侧滑出预览。先支持文本（等宽、上限 512 KB）和图片（`data:` URL，CSP 禁止 `file:`）。`http(s)` / `mailto` 仍外开。Esc 或点遮罩关闭 |

---

## 11. 文案

| 规则 | 说明 |
| --- | --- |
| 语言 | 界面文案中文为主；专有名词（Skills、MCP、Cursor、Codex、diff、token）保留英文原样 |
| 标点 | 句末**不加句号**；句中用中文标点；省略用 `…` 不用 `...` |
| 分隔符 | 元信息之间用 ` · `（前后各一空格） |
| 中英混排 | 中文与英文 / 数字之间加半角空格（`扫描 128 个会话`） |
| 数字 | 时长、时间戳一律 `font-variant-numeric: tabular-nums`，避免列表跳动。已覆盖 `.ws-session-time`、`.scan-progress-text`、`.traj-stat-val`、`.traj-search-count`、`.traj-tick-row` |
| 工具摘要 | 固定「动词 + 数量 + 单位」，如 `读取 3 个文件`、`执行 1 条命令`；写不出数量就写动词 + 目标，不要堆原始参数 |
| 按钮 | 动词开头、2–4 字：`扫描会话`、`重试`、`复制`、`展开` |
| 空态 | 标题写状态（`暂无 Skill`），说明写下一步（`点击「扫描」开始`），不写道歉 |
| 错误 | 写「发生了什么 + 能做什么」，不暴露堆栈；技术细节收进可展开详情 |
| 大写 | 侧栏分组标题用 `text-transform: uppercase` + `letter-spacing: .06em`，仅限英文短词 |

---

## 12. 模块接入清单

### 12.1 样式文件分工

| 文件 | 内容 |
| --- | --- |
| `styles.css` | 纯 `@import` 聚合入口，**只允许改 import 顺序，不写规则**；顺序固定为 tokens → base → shell → chat → trajectory |
| `styles/tokens.css` | 全部色值，以及跨文件共用的圆角 / 动效 token。只被一个文件用到的布局常量留在该文件里（如 `shell.css` 的 `--titlebar-h`，它带平台条件，不该进色值层） |
| `styles/base.css` | 重置、`html/body`、全局 `:focus-visible`、跨模块通用控件（`.icon-btn` / `.btn-inline` / `.skeleton-*` / `.virtual-inner`）、滚动条、`prefers-reduced-motion` |
| `styles/shell.css` | `app` / `shell` / `activity-bar` / `module` / `sidebar` / `search-*` / `scan-*` / `session-head` / `session-body` / `file-preview-*` / `pane-status` / 空态 |
| `styles/chat.css` | Chat 内容区：`chat-*` / `md-*` / `work-*` / `probe-*` / `tool-*` / `diff-*` / `badge` |
| `styles/trajectory.css` | Trajectory 内容区：`traj-*` |

新模块的专属样式新建 `styles/<module>.css` 并加到 `styles.css` 末尾；能复用的外壳类一律复用，**不要复制粘贴改类名**。

### 12.2 必须提供的物料

| 项 | 要求 |
| --- | --- |
| 图标 | 内联 SVG，`viewBox="0 0 24 24"`、`className="activity-icon"`、`aria-hidden="true"`；Activity Bar 用 1.75 线框（`fill="none"` + `stroke="currentColor"`），实心图形用 `fill="currentColor"`；单色、无渐变 |
| 侧栏标题 | `.sidebar-brand > .brand-mark`，中文或英文专名，15px 700 字重 |
| 空态 | 侧栏 `.empty-inline` 一行；内容区 `.empty-hero` + `.empty-title` + `.empty-copy` |
| 加载态 | 复用 `workbench/Feedback.tsx` 的 `SidebarSkeleton`（侧栏列表）与 `PaneSkeleton`（内容区），不要自己写「加载中…」 |
| 错误态 | 复用 `workbench/Feedback.tsx` 的 `PaneError`，必须传 `onRetry` |
| 搜索框 | 若模块有搜索，输入框必须带 `data-search-input`，否则吃不到 `Cmd/Ctrl+F` |
| 栅格 | 顶层结构固定为 `.module-root` → `.module-body`（`280px` + `minmax(0,1fr)`）→ `.sidebar` + `.session-pane`；**不得自定义两栏栅格**，否则侧栏折叠与 900px 断点会失效 |
| 隐藏 | 根节点 `className={`module-root${hidden ? ' is-hidden' : ''}`}` 且 `aria-hidden={hidden}`（模块常驻挂载、靠 CSS 隐藏，切换不丢状态） |

最小骨架：

```tsx
export function XxxModule({ hidden }: ModuleProps) {
  return (
    <div className={`module-root${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      <div className="module-body">
        <aside className="sidebar" aria-label="Xxx">
          <div className="sidebar-brand">
            <div className="brand-mark">Xxx</div>
          </div>
          <div className="sidebar-scroll">…</div>
        </aside>
        <section className="session-pane">…</section>
      </div>
    </div>
  )
}
```

### 12.3 注册到 `WorkbenchRegistry`

`WorkbenchRegistry`（`packages/plugin-workbench`）是主进程侧的 cordis Service，`register()` 返回可回收的 effect，`list()` 按 `order` 升序、同序按 `id` 字典序排列；渲染层通过 preload 的 `listActivities()` 拿到列表。

按顺序改这 7 处：

1. **建包** `packages/module-<name>/`，`package.json` 依赖 `@agentdock/plugin-workbench` 与 `cordis`，`exports` 指向 `./src/index.ts`，带 `typecheck` 脚本（照抄 `packages/module-skills/package.json`）。
2. **导出 cordis 插件**（`src/index.ts`）：

```ts
import type { Context } from 'cordis'
import type {} from '@agentdock/plugin-workbench'

const plugin = {
  name: 'module-mcp',
  inject: ['workbench'],
  apply(ctx: Context) {
    ctx.workbench.register({ id: 'mcp', title: 'MCP', icon: 'mcp', order: 20 })
  }
}

export default plugin
```

   `order` 按 10 递增（`chats` = 0，`skills` = 10，下一个用 20）；`id` 全小写短横线，同时作为 `MODULE_VIEWS` 的键与 `localStorage` 里 `agentdock.activityId` 的值。
3. **扩类型** `packages/core/src/workbench.ts`：把新 id 加进 `WorkbenchIcon` 联合类型。
4. **加图标** `apps/desktop/src/renderer/src/workbench/ActivityBar.tsx` 的 `ActivityIcon` 里新增一个分支。
5. **挂主进程** `apps/desktop/src/main/index.ts`：在 `startPlugins()` 里 `await ctx.plugin(mcpModulePlugin)`（必须在 `WorkbenchRegistry` 之后、`BridgeService` 之前）。
6. **进构建** `apps/desktop/electron.vite.config.ts` 的 `bundledWorkspacePkgs` 加包名，`apps/desktop/package.json` 加 `"@agentdock/module-mcp": "workspace:*"`。
7. **挂视图** `apps/desktop/src/renderer/src/workbench/views.tsx` 的 `MODULE_VIEWS` 加映射；未映射的 id 会落到 `UnknownModule`（显示「未实现」空态），可作为占位先合。

可选：`workbench/activity.ts` 的 `FALLBACK_ACTIVITIES` 加一条，让 preload 不可用时也能显示入口。

### 12.4 合入前自查

- [ ] 新样式里没有字面色值，全部走 token
- [ ] 亮 / 暗两套主题各看一遍，diff、徽标、时间线没有荧光块或糊成一片
- [ ] 五态齐全，Tab 全程焦点可见
- [ ] 空态、加载态、错误态都能触发到
- [ ] 窗口宽度收到 900px 不出现横向滚动
- [ ] `pnpm -r --if-present typecheck` 通过
