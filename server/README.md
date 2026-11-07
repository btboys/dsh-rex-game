# 全网排行榜服务

给 `https://dsh.gson.cn/whale-break/` 提供接口的最小服务（单文件、零依赖、Node 20+）。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/whale-break/scores` | `{ "scores": [{ "name": "小鲸鱼1001", "score": 421, "at": 1794043929123 }] }` |
| `POST` | `/whale-break/scores` | body `{ "name": "小鲸鱼1001", "score": 421 }`，返回更新后的完整榜单 |
| `OPTIONS` | 任意 | CORS 预检（`access-control-allow-origin: *`） |

约束：分数 `0..9999999` 的整数、名字最长 16 字符、每 IP 每分钟最多 30 次提交、保留前 20 名。

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
curl -s -X POST https://dsh.gson.cn/whale-break/scores \
  -H 'content-type: application/json' \
  -d '{"name":"小鲸鱼1001","score":421}'
```

部署完成后刷新游戏页面即可看到全网榜；接口不可达时插件自动回退到 Host 同源榜（`/dsh-whale-break/scores`）再回退到本地，不会影响游戏。
