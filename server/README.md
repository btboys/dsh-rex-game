# 全网排行榜服务

给 `https://dsh.gson.cn/whale-break/` 提供接口的最小服务（单文件、零依赖、Node 20+）。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/whale-break/start` | 开一局，返回一次性 `{ "run": "<签名 token>" }`（15 分钟有效） |
| `GET` | `/whale-break/scores` | `{ "scores": [{ "name": "小鲸鱼1001", "score": 421, "at": 1794043929123 }] }` |
| `POST` | `/whale-break/scores` | body `{ "run": "...", "name": "小鲸鱼1001", "score": 421 }`，返回完整榜单 |
| `OPTIONS` | 任意 | CORS 预检（`access-control-allow-origin: *`） |

## 防刷分

纯客户端游戏无法做到绝对防作弊，但"手工调接口随便写分"会被挡住：

- 分数必须携带服务端签发的一次性 run token（HMAC 签名 + 15 分钟时效 + 用后作废），直接 POST 分数返回 `401`；
- 服务端用自己的时钟计算这一局真实时长，分数上限为 `时长 × 22 分/秒 + 60`（游戏实际最高约 19.2 分/秒），瞬间提交大分返回 `400`；
- 每 IP 每分钟最多 20 次提交 / 40 次开局，名字最长 16 字符、分数 `0..9999999` 整数、榜单保留前 20 名。

剩余风险：脚本自动化真的玩一局、或者开一局后干等 15 分钟再提交接近上限的分数，理论上仍可上榜——这是没有服务端回放的代价，属于极低概率的有意作弊；如需更强约束，可以加"每 IP 每日入榜次数"或服务端记录操作摘要。

约束：分数 `0..9999999` 的整数、名字最长 16 字符、每 IP 每分钟最多 20 次提交、保留前 20 名。

## 部署

```bash
# 1. 放一份代码到服务器
git clone https://github.com/btboys/dsh-rex-game && cd dsh-rex-game

# 2. 起服务（建议 systemd 托管）
PORT=8787 DATA_FILE=/var/lib/whale-break/scores.json node server/leaderboard.mjs
```

systemd 单元示例：

```ini
[Unit]
Description=whale-break scoreboard
After=network.target

[Service]
WorkingDirectory=/opt/dsh-rex-game
Environment=PORT=8787
Environment=DATA_FILE=/var/lib/whale-break/scores.json
ExecStart=/usr/bin/node server/leaderboard.mjs
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

nginx 反代（dsh.gson.cn 站点）：

```nginx
location /whale-break/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 验证

```bash
curl -s https://dsh.gson.cn/whale-break/scores
RUN=$(curl -s -X POST https://dsh.gson.cn/whale-break/start | sed -E 's/.*"run":"([^"]+)".*/\1/')
curl -s -X POST https://dsh.gson.cn/whale-break/scores \
  -H 'content-type: application/json' \
  -d "{\"run\":\"$RUN\",\"name\":\"小鲸鱼1001\",\"score\":1}" 
```

部署完成后刷新游戏页面即可看到全网榜；接口不可达时插件自动回退到 Host 同源榜（`/dsh-whale-break/scores`）再回退到本地，不会影响游戏。
