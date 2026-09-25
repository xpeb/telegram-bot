const TOKEN = globalThis.BOT_TOKEN;
const SECRET = globalThis.WEBHOOK_SECRET;
const ADMIN_UID = String(globalThis.USER_UID);

// ── i18n ─────────────────────────────────────
const I = {
  zh: {
    verifyReq:  '🛡 请验证：点击下方按钮。',
    verifyOk:   '✅ 验证通过。',
    blocked:    '您已被屏蔽。',
    unblocked:  '您已被解除屏蔽。',
    fwdFail:    '消息发送失败，请稍后再试。',
    fwdNotif:   '消息已转发，请耐心等待回复。',
    adminReply: '🙅 请回复转发的用户消息。',
    noUser:     '❌ 无法识别目标用户。',
    selfBlock:  '⚠️ 不能屏蔽自己。',
    blockedOk:  uid => `✅ 已屏蔽 \`${uid}\`。`,
    unblockedOk: uid => `✅ 已解封 \`${uid}\`。`,
    checkBlock: (uid,b) => `\`${uid}\` ${b?'已屏蔽 🚫':'未屏蔽 ✅'}`,
    verifyBtn:   '✅ 我是人类',
    verifyFail:  '验证失败',
    verifyDone:  '已验证',
  },
  en: {
    verifyReq:  '🛡 Please verify: tap the button below.',
    verifyOk:   '✅ Verified.',
    blocked:    'You have been blocked.',
    unblocked:  'You have been unblocked.',
    fwdFail:    'Message failed. Please try again later.',
    fwdNotif:   'Message forwarded. Please wait for a reply.',
    adminReply: '🙅 Please reply to a forwarded user message.',
    noUser:     '❌ Cannot identify target user.',
    selfBlock:  '⚠️ Cannot block yourself.',
    blockedOk:  uid => `✅ Blocked \`${uid}\`.`,
    unblockedOk: uid => `✅ Unblocked \`${uid}\`.`,
    checkBlock: (uid,b) => `\`${uid}\` ${b?'blocked 🚫':'not blocked ✅'}`,
    verifyBtn:   '✅ I\'m human',
    verifyFail:  'Verification failed',
    verifyDone:  'Verified',
  }
};
function T(key, lang, ...args) {
  const d = I[lang?.startsWith?.('zh') ? 'zh' : 'en'];
  const v = d[key];
  return typeof v === 'function' ? v(...args) : v;
}

// ── Start message ───────────────────────────
const START_MSG_CN = `欢迎使用私聊助手

直接发送消息，我会尽快回复。

温馨提示
• 请勿发送违法、违规或骚扰信息
• 多次滥用会被拉黑屏蔽`;

const START_MSG_EN = `Welcome to Private Chat Assistant

Just send a message and I'll reply as soon as possible.

Notes
• No illegal, abusive, or spam messages
• Repeated abuse may result in a block`;

// ── Telegram API ────────────────────────────
async function api(method, body = {}) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const e = await r.text().catch(() => '');
      console.error(`API ${method} ${r.status}`, e);
      return { ok: false, description: `API ${r.status}` };
    }
    return r.json();
  } catch (e) {
    console.error(`API ${method} error:`, e);
    return { ok: false };
  }
}

// ── Verification ────────────────────────────
async function ensureVerified(uid, lang) {
  const key = `verify-${uid}`;
  const state = await BOT_KV.get(key, { type: 'json' }).catch(() => null);
  // valid for 3 hours
  if (state?.verified && state.verifiedAt && Date.now() - state.verifiedAt <= 10_800_000)
    return true;

  const token = Math.random().toString(36).slice(2, 10);
  await BOT_KV.put(key, JSON.stringify({ token, exp: Date.now() + 600_000, verified: false }));
  await api('sendMessage', {
    chat_id: uid,
    text: T('verifyReq', lang),
    reply_markup: { inline_keyboard: [[{ text: T('verifyBtn', lang), callback_data: `verify:${token}` }]] }
  });
  return false;
}

// ── Notification throttle ───────────────────
async function maybeNotify(uid, lang) {
  const key = `notify:until:${uid}`;
  const now = Date.now();
  try {
    const obj = await BOT_KV.get(key, { type: 'json' });
    if (obj?.until && now < obj.until) return;
  } catch {}
  await BOT_KV.put(key, JSON.stringify({ until: now + 3600_000 })).catch(() => {}); // 1 hour
  await api('sendMessage', { chat_id: uid, text: T('fwdNotif', lang) });
}

// ── Block / Unblock ─────────────────────────
async function getGuestId(replyMsg) {
  return BOT_KV.get(`msg-map-${replyMsg.message_id}`, { type: 'text' }).catch(() => null);
}

async function handleBlock(msg, lang) {
  const gid = await getGuestId(msg.reply_to_message);
  if (!gid) return api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('noUser', lang) });
  if (gid === ADMIN_UID) return api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('selfBlock', lang) });
  await BOT_KV.put(`isblocked-${gid}`, JSON.stringify(true));
  await api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('blockedOk', lang, gid), parse_mode: 'Markdown' });
  await api('sendMessage', { chat_id: parseInt(gid), text: T('blocked', lang) });
}

async function handleUnblock(msg, lang) {
  const gid = await getGuestId(msg.reply_to_message);
  if (!gid) return api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('noUser', lang) });
  await BOT_KV.put(`isblocked-${gid}`, JSON.stringify(false));
  await api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('unblockedOk', lang, gid), parse_mode: 'Markdown' });
  await api('sendMessage', { chat_id: parseInt(gid), text: T('unblocked', lang) });
}

async function checkBlock(msg, lang) {
  const gid = await getGuestId(msg.reply_to_message);
  if (!gid) return api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('noUser', lang) });
  const blocked = await BOT_KV.get(`isblocked-${gid}`, { type: 'json' }).catch(() => false);
  await api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('checkBlock', lang, gid, !!blocked), parse_mode: 'Markdown' });
}

// ── Guest message ───────────────────────────
async function handleGuest(msg, lang) {
  const uid = msg.chat.id;
  const blocked = await BOT_KV.get(`isblocked-${uid}`, { type: 'json' }).catch(() => false);
  if (blocked) return api('sendMessage', { chat_id: uid, text: T('blocked', lang) });

  if (!await ensureVerified(uid, lang)) return;

  const res = await api('forwardMessage', {
    chat_id: parseInt(ADMIN_UID),
    from_chat_id: uid,
    message_id: msg.message_id
  });

  if (res.ok) {
    await BOT_KV.put(`msg-map-${res.result.message_id}`, String(uid)).catch(() => {});
    await maybeNotify(uid, lang);
  } else {
    await api('sendMessage', { chat_id: uid, text: T('fwdFail', lang) });
  }
}

// ── Admin message ───────────────────────────
async function handleAdmin(msg, lang) {
  const text = msg.text || '';

  // reply commands
  if (msg.reply_to_message) {
    if (text === '/block') return handleBlock(msg, lang);
    if (text === '/unblock') return handleUnblock(msg, lang);
    if (text === '/checkblock') return checkBlock(msg, lang);

    // normal reply → forward to user
    const gid = await getGuestId(msg.reply_to_message);
    if (gid) return api('copyMessage', { chat_id: parseInt(gid), from_chat_id: msg.chat.id, message_id: msg.message_id });
    return api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('noUser', lang) });
  }

  // plain message → prompt
  return api('sendMessage', { chat_id: parseInt(ADMIN_UID), text: T('adminReply', lang) });
}

// ── Main router ─────────────────────────────
async function onMessage(msg) {
  const lang = msg.from?.language_code || 'en';

  // /start — for everyone
  if (msg.text === '/start') {
    const text = lang.startsWith('zh') ? START_MSG_CN : START_MSG_EN;
    return api('sendMessage', { chat_id: msg.chat.id, text });
  }

  return String(msg.from?.id) === ADMIN_UID
    ? handleAdmin(msg, lang)
    : handleGuest(msg, lang);
}

async function onCallbackQuery(cbq) {
  const uid = cbq.from?.id;
  const lang = cbq.from?.language_code || 'en';
  const data = cbq.data || '';
  if (!uid || !data.startsWith('verify:')) return api('answerCallbackQuery', { callback_query_id: cbq.id });

  const token = data.split(':')[1];
  const key = `verify-${uid}`;
  const state = await BOT_KV.get(key, { type: 'json' }).catch(() => null);

  if (!state || state.exp < Date.now() || state.verified) {
    await BOT_KV.delete(key).catch(() => {});
    await ensureVerified(uid, lang);
    return api('answerCallbackQuery', { callback_query_id: cbq.id });
  }
  if (state.token === token) {
    await BOT_KV.put(key, JSON.stringify({ verified: true, verifiedAt: Date.now() }));
    await api('answerCallbackQuery', { callback_query_id: cbq.id, text: T('verifyDone', lang) });
    await api('sendMessage', { chat_id: uid, text: T('verifyOk', lang) });
  } else {
    await api('answerCallbackQuery', { callback_query_id: cbq.id, text: T('verifyFail', lang) });
  }
}

async function onUpdate(update) {
  if (update.message) await onMessage(update.message);
  else if (update.callback_query) await onCallbackQuery(update.callback_query);
}

// ── Webhook ─────────────────────────────────
async function handleWebhook(event) {
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET)
    return new Response('Unauthorized', { status: 403 });
  try {
    event.waitUntil(onUpdate(await event.request.json()));
    return new Response('Ok');
  } catch { return new Response('Bad Request', { status: 400 }); }
}

async function registerWebhook(url) {
  const wh = `${url.protocol}//${url.hostname}/webhook`;
  const res = await api('setWebhook', { url: wh, secret_token: SECRET, allowed_updates: ['message','callback_query'], drop_pending_updates: true });
  return Response.json(res);
}
async function unRegisterWebhook() {
  const res = await api('setWebhook', { url: '', drop_pending_updates: false });
  return Response.json(res);
}
async function handleSetMenu() {
  const user = await api('setMyCommands', { commands: [{ command: 'start', description: '获取关于此机器人的信息' }] });
  const admin = await api('setMyCommands', {
    commands: [
      { command: 'block', description: '屏蔽用户 (需回复用户消息)' },
      { command: 'unblock', description: '解除屏蔽 (需回复用户消息)' },
      { command: 'checkblock', description: '查询屏蔽状态 (需回复用户消息)' },
    ],
    scope: { type: 'chat', chat_id: parseInt(ADMIN_UID) }
  });
  return Response.json({ user: user.ok, admin: admin.ok });
}
async function debugWebhook() {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
  return Response.json(await r.json());
}

// ── Routes ──────────────────────────────────
addEventListener('fetch', event => {
  const path = new URL(event.request.url).pathname;
  if (path === '/webhook') return event.respondWith(handleWebhook(event));
  if (path === '/registerWebhook') return event.respondWith(registerWebhook(new URL(event.request.url)));
  if (path === '/unRegisterWebhook') return event.respondWith(unRegisterWebhook());
  if (path === '/setMenu') return event.respondWith(handleSetMenu());
  if (path === '/debugWebhook') return event.respondWith(debugWebhook());
  event.respondWith(new Response('Not Found', { status: 404 }));
});
