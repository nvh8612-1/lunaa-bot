const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');
const http = require('http');
const play = require('play-dl');

// ==================== WEB SERVER 24/7 ====================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Lunaa is alive!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] HTTP server chạy trên cổng ${PORT}`);
});

// ==================== ERROR HANDLING ====================
process.on('unhandledRejection', (err) => {
    console.error('[ERROR] Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('[ERROR] Uncaught Exception:', err);
    process.exit(1);
});

// ==================== DISCORD CLIENT ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages
    ]
});

// ==================== STATE VARIABLES ====================
let isTargeted = false;
let isLooping = false;
let currentQuery = '';
let targetUser = null;

// ==================== PLAY STREAM FUNCTION ====================
async function playStream(query, connection, channel) {
    try {
        let cleanUrl = query.trim();
        
        if (!cleanUrl.startsWith('http')) {
            await channel.send('❌ Link không hợp lệ! Phải bắt đầu bằng `http`').catch(() => {});
            return;
        }

        console.log('[STREAM] Đang tải từ:', cleanUrl);

        // Validate YouTube link
        const validation = play.yt_validate(cleanUrl);
        if (validation !== 'video') {
            await channel.send(`❌ Link YouTube không hợp lệ! (${validation})`).catch(() => {});
            return;
        }

        // Get stream
        let streamData = await play.stream(cleanUrl, {
            discordPlayerCompatibility: true,
            quality: 2
        });

        if (!streamData || !streamData.stream) {
            await channel.send('❌ Không thể lấy stream từ link này!').catch(() => {});
            return;
        }

        // Create audio resource
        const resource = createAudioResource(streamData.stream, {
            inputType: streamData.type,
            inlineVolume: true,
            silencePaddingFrames: 5
        });

        resource.volume.setVolume(0.8);

        // Create and subscribe player
        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);

        console.log('[PLAY] Phát nhạc thành công');

        // Handle player events
        player.on(AudioPlayerStatus.Idle, async () => {
            console.log('[PLAYER] Nhạc kết thúc');
            if (isLooping && currentQuery) {
                console.log('[LOOP] Phát lại bài hát');
                await playStream(currentQuery, connection, channel);
            }
        });

        player.on('error', (err) => {
            console.error('[PLAYER ERROR]', err.message);
            channel.send(`❌ Lỗi trình phát: ${err.message}`).catch(() => {});
        });

    } catch (error) {
        console.error('[STREAM ERROR]', error.message);
        await channel.send(`❌ Lỗi: ${error.message}`).catch(() => {});
    }
}

// ==================== DISCORD EVENTS ====================
client.once('ready', () => {
    console.log('\n' + '='.repeat(50));
    console.log(`✅ BOT ONLINE THÀNH CÔNG`);
    console.log(`📱 Tag: ${client.user.tag}`);
    console.log(`🏘️  Servers: ${client.guilds.cache.size}`);
    console.log('='.repeat(50) + '\n');
    
    client.user.setActivity('!help | Lunaa Music', { type: 'WATCHING' }).catch(() => {});
});

client.on('error', (error) => {
    console.error('[CLIENT ERROR]', error);
});

client.on('shardError', (error) => {
    console.error('[SHARD ERROR]', error);
});

client.on('messageCreate', async (message) => {
    // Ignore bots
    if (message.author.bot) return;

    const content = message.content.trim();
    const prefix = '!';

    // ========== !TARGET / !TAGET ==========
    if (content === '!target' || content === '!taget') {
        isTargeted = !isTargeted;
        const playerName = message.member?.displayName || message.author.username;
        
        if (isTargeted) {
            targetUser = message.author.id;
            console.log(`[TARGET] Đang lắng nghe: ${playerName}`);
            return message.reply(`🎵 Lắng nghe người chơi: **${playerName}**`).catch(() => {});
        } else {
            targetUser = null;
            console.log(`[TARGET] Đã ngắt lắng nghe: ${playerName}`);
            return message.reply(`⛔ Đã ngắt lắng nghe.`).catch(() => {});
        }
    }

    // ========== !JOIN / !SEVER / !SERVER ==========
    if (content === '!join' || content === '!sever' || content === '!server') {
        const voiceChannel = message.member?.voice?.channel;
        
        if (!voiceChannel) {
            return message.reply('❌ Bạn phải vào phòng thoại trước!').catch(() => {});
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
            
            console.log(`[JOIN] Vào phòng: ${voiceChannel.name}`);
            return message.reply('✅ Đã vào phòng thoại!').catch(() => {});
        } catch (error) {
            console.error('[JOIN ERROR]', error.message);
            return message.reply(`❌ Lỗi vào phòng: ${error.message}`).catch(() => {});
        }
    }

    // ========== !LOOP ==========
    if (content === '!loop') {
        isLooping = !isLooping;
        console.log(`[LOOP] ${isLooping ? 'ON' : 'OFF'}`);
        return message.reply(isLooping ? '🔁 Bật chế độ lặp lại!' : '🔁 Tắt chế độ lặp lại.').catch(() => {});
    }

    // ========== !STOP / !PAUSE ==========
    if (content === '!stop' || content === '!pause') {
        isLooping = false;
        const connection = getVoiceConnection(message.guild.id);
        
        if (!connection) {
            return message.reply('❌ Bot không ở trong phòng!').catch(() => {});
        }

        try {
            const player = connection.state?.subscription?.player;
            if (player) {
                player.stop(true);
                console.log('[STOP] Dừng nhạc');
            }
            return message.reply('⏹️ Đã dừng nhạc!').catch(() => {});
        } catch (error) {
            console.error('[STOP ERROR]', error.message);
            return message.reply(`❌ Lỗi dừng nhạc: ${error.message}`).catch(() => {});
        }
    }

    // ========== !PLAY ==========
    if (content.startsWith('!play')) {
        if (!isTargeted) {
            return message.reply('❌ Gõ `!target` hoặc `!taget` trước!').catch(() => {});
        }

        // Check if user is the targeted one
        if (message.author.id !== targetUser) {
            return message.reply('⛔ Chỉ người được target mới có thể dùng `!play`!').catch(() => {});
        }

        let query = content.slice(5).trim();
        
        // Remove quotes if present
        if ((query.startsWith('"') && query.endsWith('"')) || 
            (query.startsWith("'") && query.endsWith("'"))) {
            query = query.slice(1, -1).trim();
        }

        if (!query) {
            return message.reply('❌ Cần gõ link YouTube sau `!play`!').catch(() => {});
        }

        if (!query.startsWith('http')) {
            return message.reply('❌ Phải là link YouTube hợp lệ!').catch(() => {});
        }

        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.reply('❌ Bạn phải vào phòng thoại!').catch(() => {});
        }

        message.reply('🎶 Đang mở nhạc...').catch(() => {});

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            currentQuery = query;
            console.log(`[PLAY] URL: ${query}`);
            playStream(query, connection, message.channel);

        } catch (error) {
            console.error('[PLAY ERROR]', error);
            message.reply(`❌ Lỗi: ${error.message}`).catch(() => {});
        }
    }

    // ========== !HELP ==========
    if (content === '!help') {
        const helpText = `
\`\`\`
📖 DANH SÁCH LỆNH:
━━━━━━━━━━━━━━━━━━━━━
!target / !taget     → Bật/tắt lắng nghe người chơi
!play <link>         → Phát nhạc từ YouTube
!join / !server      → Vào phòng thoại
!stop / !pause       → Dừng nhạc
!loop                → Bật/tắt lặp lại
!help                → Xem trợ giúp
━━━━━━━━━━━━━━━━━━━━━
\`\`\`
        `;
        return message.reply(helpText).catch(() => {});
    }
});

// ==================== LOGIN ====================
console.log('[INIT] Đang kết nối với Discord...\n');

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ LỖI: Không tìm thấy DISCORD_TOKEN!');
    console.error('Vui lòng thiết lập biến môi trường: DISCORD_TOKEN');
    process.exit(1);
}

client.login(token)
    .then(() => {
        console.log('[LOGIN] ✅ Token hợp lệ!');
    })
    .catch((error) => {
        console.error('[LOGIN] ❌ LỖI TOKEN:', error.message);
        process.exit(1);
    });
