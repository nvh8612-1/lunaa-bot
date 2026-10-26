const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');
const http = require('http');

// Mở một Web Server nhỏ để Render không bị tắt bot (Web Service check)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive and running!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`HTTP server đang chạy trên cổng ${PORT}`);
});

const ytdlModule = require('@distube/ytdl-core');
const ytdl = typeof ytdlModule === 'function' ? ytdlModule : (ytdlModule.Ytdl || ytdlModule.default || ytdlModule);

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let isTargeted = false; 
let isLooping = false;
let currentQuery = '';

async function playStream(query, connection, channel) {
    try {
        let cleanUrl = query.trim();
        if (!cleanUrl.startsWith('http')) return;

        console.log('[STREAM] Đang tải luồng ytdl từ:', cleanUrl);
        
        let stream;
        const options = {
            filter: format => format.hasAudio && !format.hasVideo,
            highWaterMark: 1 << 25
        };

        try {
            if (typeof ytdl === 'function') {
                stream = ytdl(cleanUrl, options);
            } else {
                const ytdlInstance = new ytdlModule.Ytdl();
                stream = ytdlInstance.download(cleanUrl, options);
            }
        } catch (e) {
            const ytdlInstance = new ytdlModule.Ytdl();
            stream = ytdlInstance.download(cleanUrl, options);
        }

        const resource = createAudioResource(stream, {
            inlineVolume: true,
            silencePaddingFrames: 5
        });
        
        resource.volume.setVolume(0.85);

        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            if (isLooping && currentQuery) {
                console.log('[LOOP] Phát lại bài hát:', currentQuery);
                playStream(currentQuery, connection, channel);
            }
        });

        player.on('error', (err) => {
            console.error('Lỗi phát nhạc player:', err.message);
        });
    } catch (error) {
        console.error('Lỗi kết nối stream ytdl:', error.message);
        channel.send('❌ Lỗi: Không thể phát bài hát này!').catch(() => {});
    }
}

client.once('ready', async () => {
    console.log(`🚀 Bot ${client.user.tag} đã sẵn sàng hoạt động!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.trim();

    if (content === '!taget') {
        isTargeted = !isTargeted;
        const playerName = message.member ? message.member.displayName : message.author.username;
        if (isTargeted) {
            return message.channel.send(`Lắng Nghe Người Chơi "${playerName}"`).catch(() => {});
        } else {
            return message.channel.send(`Đã ngắt lắng nghe "${playerName}"`).catch(() => {});
        }
    }

    if (content.startsWith('!sever') || content.startsWith('!server')) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.channel.send('❌ Vào phòng thoại trước đã!').catch(() => {});
        }
        try {
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
            return message.channel.send('Đã Vào ✓').catch(() => {});
        } catch (error) {
            return message.channel.send('Sự cố .!!..').catch(() => {});
        }
    }

    if (content === '!loop') {
        isLooping = !isLooping;
        return message.channel.send(isLooping ? '🔁 Đã bật chế độ lặp lại vô hạn!' : '🔁 Đã tắt chế độ lặp lại.').catch(() => {});
    }

    if (content === '!stop') {
        isLooping = false;
        const connection = getVoiceConnection(message.guild.id);
        if (!connection) return message.channel.send('❌ Bot không ở trong phòng!').catch(() => {});
        try {
            const player = connection._subscription?.player;
            if (player) player.stop();
            return message.channel.send('Dừng Nhạc ✓').catch(() => {});
        } catch (error) {}
    }

    if (content.startsWith('!play')) {
        if (!isTargeted) {
            return message.channel.send('❌ Chưa gọi `!taget`!').catch(() => {});
        }
        
        let query = content.slice(5).trim();
        if (query.startsWith('"') && query.endsWith('"')) {
            query = query.slice(1, -1).trim();
        }

        if (!query || !query.startsWith('http')) {
            return message.channel.send('❌ Link YouTube không hợp lệ hoặc thiếu link!').catch(() => {});
        }

        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.channel.send('❌ Vào phòng thoại trước!').catch(() => {});
        }

        await message.channel.send('Đã Mở Nhạc🎶').catch(() => {});

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            currentQuery = query; 
            await playStream(query, connection, message.channel);

        } catch (error) {
            console.error('Lỗi kết nối:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
