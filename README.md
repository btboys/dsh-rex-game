# dsh-whale-break

DeepSeek Harness 的"等待小鲸鱼"：对话执行时在页面顶部居中弹出一个 DeepSeek 小鲸鱼跑酷游戏，打发等待时间；回合结束或需要你处理时自动暂停隐藏，下一轮开始再出现。

## 功能

- **跟随回合状态**：`running` 时出现；回合结束、审批/提问等等待你处理时隐藏并暂停，不占用注意力。
- **DeepSeek 小鲸鱼**：彩色海底场景、渐变鲸身、摆动尾鳍、珊瑚障碍、小鱼与气泡视差。
- **操作**：单击画布或按空格起跳；输入法组字不拦截空格，`Shift+Space` 仍可正常输入空格。
- **位置**：默认顶部居中；拖动底部提示条可移动，双击提示条回到居中。
- **成绩**：右上角 `HI` 最高分，本地 `localStorage` 保存。
- **总开关**：输入框左侧工具行的鲸鱼按钮，一键全局开关。

## 安装

插件市场（推荐）：设置 → 插件 → 发现 → 「等待小鲸鱼」→ 安装。

命令行：

```bash
dsh plugin --profile web add dsh-whale-break
```

然后在 设置 → 插件 中启用本插件。

## 开发

```bash
npm test        # 纯逻辑自检：物理、碰撞、绘制调用
npm pack --dry-run
```

客户端代码在 `client.js`（无构建步骤，`window.__ModuleLoader__` 直接加载），宿主半侧 `index.js` 为空。

## 仓库

https://github.com/btboys/dsh-rex-game

## License

MIT
