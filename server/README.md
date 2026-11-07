# 全网排行榜服务

给 `https://dsh.gson.cn/whale-break/` 提供接口的最小服务（共享 `../scoreboard.js`，Node 18+）。

**已部署**：`https://dsh.gson.cn/whale-break/`（2026-11-07，财务专用ECS / 47.99.77.94，Docker `node:18-alpine` + 宿主 nginx `location /whale-break/` 反代 `127.0.0.1:8787`）。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/whale-break/register` | body `{ "device": "<设备唯一编码>" }`，首次返回 `{ "user": { "id": 1, "name": "用户1" }, "token": "..." }`；同一设备重复注册返回同一编号 |
| `POST` | `/whale-break/start` | body `{ "token": "<身份 token>" }`，开一局，返回一次性 `{ "run": "<签名 token>" }`（15 分钟有效） |
| `GET` | `/whale-break/scores` | `{ "scores": [{ "uid": 1, "name": "用户1", "score": 421, "at": 1794043929123 }] }` |
| `POST` | `/whale-break/scores` | body `{ "run": "...", "score": 421 }`，返回完整榜单 |
| `OPTIONS` | 任意 | CORS 预检（`access-control-allow-origin: *`） |

用户编号由服务端从 **1** 开始按注册顺序发放，和浏览器本地生成的设备唯一编码（`dev-<32 hex>`，存 `localStorage['dsh-rex-device']`）绑定：同一设备永远同一编号，编号和昵称（`用户N`）由服务端写入榜单，客户端无法自选或冒充。

## 防刷分

纯客户端游戏无法做到绝对防作弊，但"手工调接口随便写分"会被挡住：

- 身份必须携带服务端签发的身份 token（绑定设备编码与用户编号），自带编号/昵称无效；
- 分数必须携带服务端签发的一次性 run token（HMAC 签名 + 15 分钟时效 + 用后作废），直接 POST 分数返回 `401`；
- 服务端用自己的时钟计算这一局真实时长，分数上限为 `时长 × 22 分/秒 + 60`（游戏实际最高约 19.2 分/秒），瞬间提交大分返回 `400`；
- 每 IP 每分钟最多 20 次提交 / 40 次开局 / 20 次注册，分数 `0..9999999` 整数、榜单保留前 20 名、每个用户只保留最高分一行。

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

## 本机部署形态（已生效）

```bash
# 代码与启动方式
/opt/dsh-whale-break/            # package.json + scoreboard.js + server/leaderboard.mjs（只读挂载）
/var/lib/dsh-whale-break/        # scores.json 与 HMAC secret（持久化）

docker run -d --name dsh-whale-break --restart=always \
  -v /opt/dsh-whale-break:/app:ro -v /var/lib/dsh-whale-break:/data \
  -p 127.0.0.1:8787:8787 \
  -e PORT=8787 -e HOST=0.0.0.0 -e DATA_FILE=/data/scores.json \
  node:18-alpine node /app/server/leaderboard.mjs
```

nginx（`/usr/local/nginx/conf/vhost/dsh.gson.cn.conf`）：

```nginx
location /whale-break/ {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_http_version 1.1;
  proxy_read_timeout 10s;
}
```

注意：`/opt/dsh-whale-break` 必须有 `package.json`（`"type": "module"`），否则 `scoreboard.js` 会被当成 CommonJS，容器启动报 `Named export 'createScoreRoute' not found`。

更新版本：

```bash
# 本机上传新的 scoreboard.js / server/leaderboard.mjs 后
docker restart dsh-whale-break
# secret 不变，已发 token 依旧有效；删 /var/lib/dsh-whale-break/scores.json 可清空榜单
```

## 验证

```bash
curl -s https://dsh.gson.cn/whale-break/scores
REG=$(curl -s -X POST https://dsh.gson.cn/whale-break/register \
  -H 'content-type: application/json' -d '{"device":"demo-device-0001"}')
TOKEN=$(echo "$REG" | sed -E 's/.*"token":"([^"]+)".*/\1/')
RUN=$(curl -s -X POST https://dsh.gson.cn/whale-break/start \
  -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" | sed -E 's/.*"run":"([^"]+)".*/\1/')
curl -s -X POST https://dsh.gson.cn/whale-break/scores \
  -H 'content-type: application/json' \
  -d "{\"run\":\"$RUN\",\"score\":1}" 
```

部署完成后刷新游戏页面即可看到全网榜；接口不可达时插件自动回退到 Host 同源榜（`/dsh-whale-break/scores`）再回退到本地，不会影响游戏。
