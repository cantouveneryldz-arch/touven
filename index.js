// Read-only Pump.fun new-token notifications for one Telegram user.
// Node.js 22+; no wallet/private keys, and no trade subscriptions or transaction charges.
const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerId = String(process.env.TELEGRAM_CHAT_ID ?? '').trim();
const pumpKey = process.env.PUMPPORTAL_API_KEY;
if (!token || !ownerId || !pumpKey) {
  console.error('Missing TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID or PUMPPORTAL_API_KEY');
  process.exit(1);
}
const api = `https://api.telegram.org/bot${token}`;
const format = s => String(s ?? '—').slice(0, 150);
let enabled = false;
let events = 0;
let socket;
let lastSeen = null;
async function telegram(method, data) {
  const res = await fetch(`${api}/${method}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}
async function notify(text) {
  try { await telegram('sendMessage', {chat_id: ownerId, text, disable_web_page_preview: true}); }
  catch (e) { console.error('Telegram:', e.message); }
}
async function polling() {
  let offset;
  while (true) {
    try {
      const updates = await telegram('getUpdates', {timeout: 25, offset, allowed_updates:['message']});
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m || String(m.chat?.id) !== ownerId) continue;
        const command = (m.text || '').trim().split(' ')[0].split('@')[0];
        if (command === '/start') { enabled = true; await notify('✅ Tarama bildirimleri açık. /stop ile durdur, /status ile durumu gör. Yeni coin uyarıları analiz/satın alma önerisi değildir.'); }
        else if (command === '/stop') { enabled = false; await notify('⏸️ Bildirimler kapalı. /start ile aç.'); }
        else if (command === '/status' || command === '/scan') { await notify(`Bot: ${socket?.readyState === WebSocket.OPEN ? 'bağlı' : 'bağlantı bekleniyor'}\nBildirimler: ${enabled ? 'açık' : 'kapalı'}\nGörülen yeni coin: ${events}\nSon coin: ${lastSeen || 'henüz yok'}\nNot: Whale analizi bu sürümde yok.`); }
        else if (command === '/risk') { await notify('Whale dump riski hesaplamak için bonding-curve rezervleri ve güncel token sahipleri gerekir. Bu ücretsiz başlangıç sürümü yalnızca yeni coin bildirir; sahte risk puanı üretmez.'); }
        else { await notify('Komutlar: /start /stop /status /scan /risk'); }
      }
    } catch(e) { console.error('Polling:',e.message); await new Promise(r=>setTimeout(r,5000)); }
  }
}
function connect() {
  socket = new WebSocket(`wss://pumpportal.fun/api/data?api-key=${encodeURIComponent(pumpKey)}`);
  socket.addEventListener('open', () => {
    console.log('PumpPortal connected');
    socket.send(JSON.stringify({method:'subscribeNewToken'}));
  });
  socket.addEventListener('message', async ({data}) => {
    let msg; try { msg = JSON.parse(String(data)); } catch { return; }
    if (!msg.mint || (!msg.name && !msg.symbol)) return;
    events++;
    lastSeen = format(msg.symbol || msg.name);
    if (!enabled) return;
    // Restrict notifications to one every 20 seconds to avoid Telegram spam.
    if (Date.now() - lastAlert < 20000) return;
    lastAlert = Date.now();
    await notify(`🆕 Yeni Pump.fun token\nAd: ${format(msg.name)}\nTicker: ${format(msg.symbol)}\nMint: ${format(msg.mint)}\nhttps://pump.fun/coin/${encodeURIComponent(String(msg.mint))}\n⚠️ Yeni token; risk puanı henüz ölçülmedi.`);
  });
  socket.addEventListener('error', (e) => console.error('PumpPortal socket error'));
  socket.addEventListener('close', () => { console.log('Disconnected; retry in 5s'); setTimeout(connect,5000); });
}
let lastAlert = 0;
connect();
polling().catch(console.error);
