# 发布说明

当前产物：`dsh-whale-break@0.1.0`，仓库 `https://github.com/btboys/dsh-rex-game`，已 `npm pack` 成 `dsh-whale-break-0.1.0.tgz`。

## 1. 发布到 npm

```bash
cd /Volumes/xiaji/IdeaProjects/dsh-rex-game
npm login
npm publish --access public
```

- 包名 `dsh-whale-break` 在 npm 上未被占用（可发布；想换名就同时改 `package.json` 的 `name`、`client.js` 的 `id`、`cordis.patch.yml` 的 `name`）。
- 当前环境 `npm whoami` 返回 401，未登录，所以这一步需要在有 npm 凭据的终端里执行。

## 2. 加入插件市场索引

把 `market-entry.json` 的内容追加到 `https://dsh.gson.cn/index.json` 的 `plugins` 数组，并补全：

- 仓库地址已填：`https://github.com/btboys/dsh-rex-game`
- `author` 当前写的是「夏悸」，按需修改
- `icon`：把 `icon.svg` 传到 `https://dsh.gson.cn/icons/dsh-whale-break.svg`
- `metadata.category`：当前写的是 `assistant`，如果索引里更想归类到别的分组（developer-tools 等）改这一处
- `versions[0].publishTimestamp`：以 npm 实际发布时间为准（当前是占位的时间戳）

## 3. 用户安装

市场：设置 → 插件 → 发现 → 「等待小鲸鱼」→ 安装。

命令行（需再在设置 → 插件 里启用）：

```bash
dsh plugin --profile web add dsh-whale-break
```

## 4. 本地验证

```bash
npm test              # 纯逻辑自检
npm pack --dry-run    # 检查发布内容
```

本机 profile 已用公开包名重新装好（`dsh-whale-break@0.1.0`，link 到本目录），刷新页面即可看到效果。
