const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const http = require('http'); // Adicionado para manter o Render ativo

// CONFIGURAÇÃO DA IA (GEMINI)
// CRITICAL: Substitua 'SUA_API_KEY_AQUI' pela sua chave de API real do Google.
// Obtenha uma chave gratuita em: https://aistudio.google.com/app/apikey
const genAI = new GoogleGenerativeAI("AIzaSyCZ_3_49RercO1mGSGg-H_RgqBCKstP-A0");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 0, // Sem limite de tempo para autenticação (evita timeout em environments lentos)
    qrMaxRetries: 5, // Tenta gerar o QR Code até 5 vezes
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Crítico para Docker/Render (evita crash por memória compartilhada)
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Pode ajudar em containers com recursos limitados
            '--disable-gpu'
        ]
    }
});

// Gera o QR Code no terminal (Backup)
let isPairingCodeRequested = false;
client.on('qr', async (qr) => {
    console.log('QR RECEIVED', qr);

    // Tenta gerar o Código de Emparelhamento (apenas na primeira vez)
    if (!isPairingCodeRequested) {
        const myNumber = "5598999810660"; // Seu número
        isPairingCodeRequested = true;
        try {
            console.log("Solicitando código de emparelhamento...");
            const code = await client.requestPairingCode(myNumber);
            console.log("\n============================================");
            console.log("CÓDIGO DE CONEXÃO: " + code);
            console.log("============================================\n");
            console.log("1. No WhatsApp, vá em Aparelhos Conectados > Conectar Aparelho.");
            console.log("2. Clique em 'Conectar com número de telefone'.");
            console.log("3. Digite o código acima.");
        } catch (err) {
            console.error("Erro ao gerar código:", err);
            isPairingCodeRequested = false;
        }
    }
});

// Confirma que o bot está pronto
client.on('ready', () => {
    console.log('Tudo pronto! O assistente está online.');
    // Envia uma mensagem para o próprio número avisando que conectou
    const myNumber = client.info.wid._serialized;
    client.sendMessage(myNumber, '🤖 *Bot Conectado!* \nAgora envie "Oi" ou "Menu" para testar o atendimento.');
});

// Escuta todas as mensagens (incluindo as enviadas por você para testes)
client.on('message_create', async msg => {
    // Evita loop infinito: ignora mensagens enviadas pelo próprio bot com o prefixo do bot
    if (msg.fromMe && msg.body.startsWith('🤖')) return;
    console.log('Mensagem recebida:', msg.body);

    // Tratamento de mensagens
    const msgLower = msg.body.toLowerCase();

    // Menu Principal
    if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu'].includes(msgLower)) {
        const chat = await msg.getChat();

        chat.sendStateTyping();

        setTimeout(() => {
            msg.reply(
                '*Olá! Bem-vindo à RÁDIO HUNTTER WEB!* �💻\n\n' +
                'A melhor da região, agora no seu WhatsApp!\n\n' +
                'Escolha uma opção:\n\n' +
                '1️⃣ *Ouvir Rádio / Assistir TV* 🔴\n' +
                '2️⃣ *Pedir Música* 🎹\n' +
                '3️⃣ *Ver Programação* 📅\n' +
                '4️⃣ *Notícias* 📰\n' +
                '5️⃣ *Falar com a Produção* 📞\n\n' +
                'Digite o *número* da opção!'
            );
        }, 1000);
    }

    // Respostas do Menu
    else if (msg.body === '1') {
        msg.reply('🔴 *Acompanhe AO VIVO!*\n\nCurta nossa Rádio e TV Web no site oficial:\n👉 https://radiohunttertvweb.shop/');
    }
    else if (msg.body === '2') {
        msg.reply('Sucesso! 🎶 Digite o *nome do cantor e a música* que você quer ouvir aqui na Huntter Web!');
    }
    else if (msg.body === '3') {
        msg.reply('📅 *Programação Diária*\n\nConfira todos os nossos horários e programas no site:\n👉 https://radiohunttertvweb.shop/#schedule');
    }
    else if (msg.body === '4') {
        msg.reply('📰 *Fique Informado*\n\nAs últimas notícias do Brasil e do mundo:\n👉 https://radiohunttertvweb.shop/#news');
    }
    else if (msg.body === '5') {
        const contactMessage = '*Falar com a Produção* 📞\n\n' +
            'Clique no link para falar com um de nossos atendentes:\n\n' +
            '👤 *Atendente 1:* https://wa.me/559888996187\n' +
            '👤 *Atendente 2:* https://wa.me/559899810660\n' +
            '👤 *Atendente 3:* https://wa.me/559888680628';

        msg.reply(contactMessage);
    }

    // Captura pedidos de música (se não for menu)
    else if (msgLower.includes('quero a música') || msgLower.includes('toca')) {
        msg.reply('Pedido anotado! 🎧 Fique ligado na *Rádio Huntter Web*, sua música pode tocar a qualquer momento!');
    }

    // RESPOSTA INTELIGENTE (IA)
    // Se a mensagem não for nenhuma das opções acima, a IA responde.
    else {
        try {
            // Mostra "digitando..." enquanto a IA pensa
            const chat = await msg.getChat();
            chat.sendStateTyping();

            // Envia a pergunta para o Gemini
            const result = await model.generateContent(msg.body);
            const response = await result.response;
            const text = response.text();

            // Responde ao usuário
            msg.reply(text);
        } catch (error) {
            console.error("Erro na IA:", error);
            // Opcional: responder algo se der erro, ou apenas ignorar
            // msg.reply("Desculpe, não consegui entender isso agora.");
        }
    }
});

// Inicializa o cliente
client.initialize().catch(err => {
    console.error("Erro na inicialização do cliente:", err);
});

// Servidor HTTP básico para o Render não derrubar o bot (Web Service)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Bot is running!');
});
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
