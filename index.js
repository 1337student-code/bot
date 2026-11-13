const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const axios = require("axios");

const DEVELOPER_NAME = "ELGRANDFT";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

let isInitialConnection = true;

async function startAI() {
    const { state, saveCreds } = await useMultiFileAuthState('/app/auth_info_v4');

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // تم التعديل: إعلان Windows Desktop بدلاً من Ubuntu
        browser: ["Windows", "Desktop", "10.0"],
        // تم التعديل: إضافة معاملات timeout
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 15000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        console.log('🔄 التحديث:', JSON.stringify(update));
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`\n👉👉👉 [رابط الـ QR] 👈👈👈`);
            console.log(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300\n`);
        }

        if (connection === 'open') {
            console.log(`\n✅ تم الاتصال بنجاح!`);
            isInitialConnection = false;
        }

        if (connection === 'close') {
            if (isInitialConnection) {
                console.log('⏳ الاتصال الأولي مغلق، في انتظار مسح رمز QR.');
                return;
            }
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("🔄 إعادة الاتصال...");
                startAI();
            } else {
                console.log("❌ تم تسجيل الخروج.");
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        if (text) {
            console.log(`📩 رسالة جديدة من ${from}: ${text}`);
            try {
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: `أنت مساعد ذكي مطورك هو العبقري ${DEVELOPER_NAME}. أجِب باحترافية وبسرعة.` },
                        { role: "user", content: text }
                    ]
                }, { headers: { "Authorization": `Bearer ${GROQ_API_KEY}` } });
                const reply = res.data.choices[0].message.content;
                await sock.sendMessage(from, { text: reply }, { quoted: msg });
                console.log(`✅ تم الرد على ${from}`);
            } catch (e) {
                console.log("❌ خطأ في معالجة الرد عبر API:", e.message);
                await sock.sendMessage(from, { text: "⚠️ عذراً يا زعيم، واجهت مشكلة بسيطة." });
            }
        }
    });
}

startAI();
setInterval(() => { console.log("System Active & Waiting for messages..."); }, 1000 * 60 * 5);
