# 凡鲸行动 / Fanwhale — 部署教程

从一台空服务器开始，到游戏跑起来、后台能用，全流程手把手。

---

## 0. 认识这套东西

### 三层结构

```
浏览器
  │
  ├─ index.html          外壳 —— 只有 3.5 KB，负责全屏 + 承载 iframe
  │    └─ iframe
  │         └─ game.html   游戏本体 —— 1.46 MB，three.js 内联
  │
  ├─ feedback.html       意见反馈 —— 独立页面
  ├─ auth.js             账号门禁 + 大厅 + 世界频道
  │
  ├─ /admin/             管理后台（React + Ant Design）
  │
  └─ /api/  /ws/  ────►  Node 后端 :7801
                              │
                              └─ data/  JSON / JSONL 存储
```

### 为什么要拆外壳和本体

**全屏状态绑定在具体页面上，页面一导航就丢。** 而游戏换关卡必须重建整个场景，引擎没有热切换入口，只能重载页面。

所以拆两层：外壳永不导航，全屏挂在它身上；换地图只换 iframe 的内容，外壳纹丝不动。

### 需要什么

| 项目 | 要求 |
|---|---|
| 系统 | Debian 11+ / Ubuntu 20.04+ / CentOS 7+ |
| Node.js | **18 或以上** |
| Nginx | 1.18+ |
| 内存 | 1 GB 起（占用很低） |
| 域名 | 已解析到服务器（要 HTTPS 必须有） |

### 端口

| 端口 | 用途 | 对外 |
|---|---|---|
| 80 / 443 | 网页 | ✅ 必须 |
| 7801 | Node 后端 | ❌ 只听 127.0.0.1 |

---

## 1. 装环境

```bash
# Node.js（用 nvm，方便切版本）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm alias default 20
node -v

# 进程守护
npm i -g pm2
pm2 startup      # 按提示执行它输出的那行命令

# Nginx + 证书
apt install -y nginx certbot python3-certbot-nginx
```

---

## 2. 放文件

```bash
mkdir -p /www/wwwroot/fanwhale
mkdir -p /www/wwwroot/fanwhale-api
mkdir -p /www/wwwroot/fanwhale-admin

cd /tmp
unzip 凡鲸行动.zip

mv 凡鲸行动/web/*    /www/wwwroot/fanwhale/
mv 凡鲸行动/api/*    /www/wwwroot/fanwhale-api/
mv 凡鲸行动/admin/*  /www/wwwroot/fanwhale-admin/
mv 凡鲸行动/nginx/*  /tmp/          # 稍后手动放到 nginx 目录
cp 凡鲸行动/DEPLOY.md /www/wwwroot/fanwhale/
```

放完应该长这样：

```
/www/wwwroot/fanwhale/         index.html  game.html  auth.js  feedback.html
/www/wwwroot/fanwhale-api/     server.js   data/
/www/wwwroot/fanwhale-admin/   app.jsx  package.json  dist/
```

---

## 3. 后端

### 3.1 语法检查

```bash
cd /www/wwwroot/fanwhale-api
node --check server.js      # 无输出 = 通过
```

### 3.2 试跑

```bash
node server.js
```

**首次运行会自动建 `data/` 里的数据文件，并生成管理员账号，终端会打印一次初始密码——记下来。**

另开终端验证：

```bash
curl http://127.0.0.1:7801/api/health
# 期望：{"ok":true,"users":0,"online":0,"msgs":0}
```

### 3.3 pm2 常驻

```bash
pm2 start server.js --name fanwhale-api
pm2 save
pm2 list          # status 应为 online
```

### 3.4 改管理员密码

凭据存在 `data/admin.json`（scrypt 哈希）：

```bash
cd /www/wwwroot/fanwhale-api
node -e '
const fs=require("fs"),crypto=require("crypto");
const salt=crypto.randomBytes(16).toString("hex");
const hash=crypto.scryptSync("你的新密码",salt,32).toString("hex");
fs.writeFileSync("data/admin.json",JSON.stringify({u:"你的账号",salt,hash,created:Date.now()}));
console.log("已更新");
'
pm2 restart fanwhale-api
```

---

## 4. 后台

### 4.1 装依赖 + 构建

```bash
cd /www/wwwroot/fanwhale-admin
npm install        # 约 160 MB，只需一次

npx esbuild app.jsx \
  --bundle --minify --format=iife --jsx=automatic \
  --loader:.jsx=jsx \
  --define:process.env.NODE_ENV='"production"' \
  --outfile=dist/bundle.js
```

> **包里的 `dist/` 已经是构建好的**，不改代码就跳过这步。

### 4.2 确认产物

```
/www/wwwroot/fanwhale-admin/dist/
├── index.html       后台入口
├── bundle.js        1.12 MB
├── bundle.css
└── feedback.html    备用反馈页
```

---

## 5. Nginx

### 5.1 站点配置

`/etc/nginx/sites-available/fanwhale.conf`（宝塔环境放 `/www/server/panel/vhost/nginx/`）：

```nginx
server {
    listen 80;
    server_name game.example.com;

    root /www/wwwroot/fanwhale;
    index index.html;

    # 页面不缓存，改完立刻生效
    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:7801;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # WebSocket：世界频道 + 合作模式
    location /ws/ {
        proxy_pass http://127.0.0.1:7801;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_set_header X-Real-IP  $remote_addr;
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
        proxy_buffering off;
    }

    # 管理后台
    location /admin/ {
        alias /www/wwwroot/fanwhale-admin/dist/;
        index index.html;
        add_header Cache-Control "no-store" always;
    }
}
```

### 5.2 安全头

`/etc/nginx/snippets/fanwhale-sec.conf`：

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;
```

在 `server{}` 里加 `include snippets/fanwhale-sec.conf;`。

**三个不能动的点：**

| 指令 | 为什么 |
|---|---|
| `'unsafe-eval'` | three.js 着色器编译需要，删了直接白屏 |
| `frame-src 'self'` | 外壳用 iframe 装游戏，缺了游戏加载不出来 |
| `connect-src 'self'` | 已覆盖同源 `wss://`，不用单独写 |

### 5.3 启用

```bash
ln -s /etc/nginx/sites-available/fanwhale.conf /etc/nginx/sites-enabled/
nginx -t                       # 必须 test is successful
systemctl reload nginx         # 宝塔环境：/etc/init.d/nginx reload
```

---

## 6. HTTPS

```bash
certbot --nginx -d game.example.com
```

自动改配置加 443 和证书。续期由系统定时任务处理，验证一下：

```bash
certbot renew --dry-run
```

建议开强制跳转：

```nginx
server {
    listen 80;
    server_name game.example.com;
    return 301 https://$host$request_uri;
}
```

---

## 7. 防火墙

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

**不要放行 7801。** 它只听 `127.0.0.1`，外网本来就进不来。

---

## 8. 验证清单

按顺序过，每步都要通：

| # | 检查 | 怎么做 | 期望 |
|---|---|---|---|
| 1 | 后端活着 | `curl 127.0.0.1:7801/api/health` | `{"ok":true,...}` |
| 2 | pm2 在跑 | `pm2 list` | online |
| 3 | 首页能开 | 访问 `https://域名/` | 出现深色「FANWHALE 正在装载」 |
| 4 | 进大厅 | 等 20–30 秒 | 出现登录框和「指挥台」 |
| 5 | 能注册 | 输账号密码点注册 | 进入大厅 |
| 6 | 公告弹出 | 首次进入 | 弹出首航公告 |
| 7 | API 通 | `curl https://域名/api/announce` | 返回 JSON |
| 8 | 反馈页 | 点大厅「意见反馈」 | 跳转到 `/feedback.html`，能写字提交 |
| 9 | 后台能开 | 访问 `https://域名/admin/` | 登录页 |
| 10 | 后台能登 | 管理员账号 | 进入控制台，7 项菜单 |
| 11 | 公告管理 | 点左侧「公告管理」 | 表格正常 |
| 12 | 意见反馈 | 点左侧「意见反馈」 | 能看到刚才提交的内容 |
| 13 | 回复功能 | 点回复输入内容提交 | 游戏内反馈页能看到回复 |
| 14 | WebSocket | 见下方命令 | `HTTP/1.1 101` |
| 15 | 换地图 | 点「盐仓」 | 只换内容不刷新整页，**全屏保持** |
| 16 | 全屏切换 | 进全屏再退出 | 正常 |
| 17 | 合作模式 | 输房间码点联机 | 进入游戏 |

**第 14 条的命令（必须加 `--http1.1`）：**

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  --http1.1 https://域名/ws/coop
```

不加 `--http1.1` 会返回 404，那是 curl 默认走 HTTP/2 的问题，不是配置错。

---

## 9. 常见问题

### 打开一直停在「正在装载」

1. 查 iframe 是否加载到了：

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://域名/game.html
# 期望：200 1463407
```

2. 查 CSP 有没有拦 iframe —— 浏览器控制台会报 `Refused to frame`，那就是 `frame-src` 没加
3. 外壳有 12 秒兜底会自动撤遮罩，如果一直不撤说明 `game.html` 根本没加载

### 游戏白屏

按顺序查：

1. `pm2 logs fanwhale-api` 看后端
2. 浏览器控制台看报错——如果是 `unsafe-eval` 相关，是 CSP 少了那条
3. `curl 127.0.0.1:7801/api/health` 单独验后端

### 反馈页提示「还没有登录」

`feedback.html` 读 `localStorage['saltline.token.v1']`。如果浏览器清过缓存，或者换了域名访问，token 就没了。回游戏重新登录一次即可。

### 后台白屏

浏览器控制台看报错。如果是 `xxx is not defined`，说明后台源码有 bug，需要重新构建：

```bash
cd /www/wwwroot/fanwhale-admin
npx esbuild app.jsx --bundle --minify --format=iife --jsx=automatic \
  --loader:.jsx=jsx --define:process.env.NODE_ENV='"production"' \
  --outfile=dist/bundle.js
```

### 后台改了不生效

构建完刷新页面。后台配了 `no-store`，不用清缓存。

### 改了前端不生效

`index.html` 配的是 `no-cache`，刷新即可。`auth.js`、`game.html` 同理。

### 合作模式连不上

```bash
# 1. 本机 WS 通不通
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  --http1.1 http://127.0.0.1:7801/ws/coop

# 2. 过 nginx 通不通
curl -i -N ... --http1.1 https://域名/ws/coop
```

哪一步返回 101 就说明那层是通的。第 1 步通第 2 步不通，就是 nginx 的 `/ws/` 三段 header 没配全。

### 改了 JS 后页面报错

```bash
node --check auth.js
node --check server.js
```

语法错误立刻能看出来。

---

## 10. 备份

`/www/backup/fanwhale/backup.sh`：

```bash
#!/bin/bash
set -e
D=/www/backup/fanwhale
mkdir -p $D
F=$D/fanwhale-$(date +%Y%m%d-%H%M).tar.gz
tar czf $F \
  /www/wwwroot/fanwhale \
  /www/wwwroot/fanwhale-api \
  /www/wwwroot/fanwhale-admin/dist \
  /etc/nginx/sites-available/fanwhale.conf 2>/dev/null
find $D -name "fanwhale-*.tar.gz" -mtime +14 -delete
echo "备份完成: $F"
```

```bash
chmod +x /www/backup/fanwhale/backup.sh
crontab -e
# 加一行：
20 4 * * * /www/backup/fanwhale/backup.sh >> /var/log/fanwhale-backup.log 2>&1
```

每晚 4:20 打包，留 14 天。

---

## 11. 日常运维

```bash
pm2 logs fanwhale-api --lines 50     # 后端日志
pm2 restart fanwhale-api             # 重启后端
curl https://域名/api/health         # 在线人数
df -h                                # 磁盘
nginx -t && systemctl reload nginx   # 改配置后
```

**不要**用 `nginx -s reload`，用 `systemctl reload nginx`。

---

## 附：接口速查

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/reg` | 注册 |
| POST | `/api/login` | 登录 |
| GET | `/api/announce` | 公告 |
| GET | `/api/about` | 关于内容 |
| POST | `/api/feedback` | 提交反馈（需登录） |
| GET | `/api/feedback` | 我的反馈（需登录） |
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/admin/stats` | 概览 |
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/admin/feedback` | 全部反馈 |
| POST | `/api/admin/fb-reply` | 回复反馈 |
| POST | `/api/admin/fb-del` | 删除反馈 |
| POST | `/api/admin/notice` | 发布公告 |
| WS | `/ws/coop` | 世界频道 + 合作同步 |

所有需要登录的接口都带 `Authorization: Bearer <token>`。

## 附：技术参数

| 项 | 值 |
|---|---|
| 后端端口 | 7801（只听 127.0.0.1） |
| 密码哈希 | scrypt，32 字节 |
| 会话 token | 24 字节随机 hex |
| 在线判定 | 90 秒窗口 |
| 合作房间 | 4 字符码，取自 `ACDEFGHJKLMNPQRSTUVWXYZ2345679` |
| 同步频率 | 10 Hz 全房间快照 |
| 关卡 | dock / warehouse / freighter / pumpstation |
| index.html | 3.5 KB（外壳） |
| game.html | 1.46 MB（本体，gzip 约 459 KB） |
| auth.js | 84 KB（gzip 约 21 KB） |
| feedback.html | 11 KB |
| 后台 bundle | 1.12 MB |