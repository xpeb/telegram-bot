# Telegram 私聊转发机器人

Cloudflare Workers 单文件部署，275 行，零依赖。

## 功能

- 用户消息转发管理员 / 管理员回复转发用户
- 人机验证（首次 + 3 小时后重新验证）
- 屏蔽 / 解封
- 节流提醒（每用户每小时一次）
- 中英文自动切换

## 部署

1. Cloudflare Dashboard → Workers & Pages → 创建 Worker
2. 粘贴 `worker.js`
3. 添加环境变量：

| 变量 | 说明 |
|------|------|
| `BOT_TOKEN` | Bot Token（`@BotFather` 获取） |
| `WEBHOOK_SECRET` | 自定义随机字符串，验证 Webhook |
| `USER_UID` | 管理员 Telegram 用户 ID |

4. 绑定 KV 命名空间，变量名 `BOT_KV`
5. 访问以下路径完成配置：

| 路径 | 作用 |
|------|------|
| `/registerWebhook` | 注册 Webhook |
| `/setMenu` | 设置命令菜单 |
| `/debugWebhook` | 查看绑定状态 |

## 命令

| 命令 | 说明 |
|------|------|
| `/block` | 屏蔽用户 |
| `/unblock` | 解除屏蔽 |
| `/checkblock` | 查询屏蔽状态 |

> 均需**回复用户转发消息**使用。
