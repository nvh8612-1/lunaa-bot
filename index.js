const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');

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
let activeConnection = null;
let currentAudioPlayer = null;

// Hàm chuẩn hóa và làm sạch link YouTube (loại bỏ ?si=... và các tham số theo dõi rác)
function cleanYouTubeUrl(inputUrl) {
    try {
        const urlObj = new URL(inputUrl);
        if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
            const videoId = urlObj.searchParams.get('v');
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        if (urlObj.hostname.includes('youtu.be')) {
            const videoId = urlObj.pathname.slice(1);
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
    } catch (e) {
        // Trả về nguyên bản nếu không phải URL chuẩn
    }
    return inputUrl;
}

async function playStream(query, connection, channel) {
    try {
        const cleanUrl = cleanYouTubeUrl(query);
        let stream;
        
        try {
            if (typeof ytdl === 'function') {
                stream = ytdl(cleanUrl, {
                    filter: format => format.hasAudio && !format.hasVideo,
                    highWaterMark: 1 << 25,
                    quality: 'highestaudio'
                });
            } else {
                const ytdlInstance = new ytdlModule.Ytdl();
                stream = ytdlInstance.download(cleanUrl, {
                    filter: format => format.hasAudio && !format.hasVideo,
                    highWaterMark: 1 << 25,
                    quality: 'highestaudio'
                });
            }
        } catch (err) {
            const ytdlInstance = new ytdlModule.Ytdl();
            stream = ytdlInstance.download(cleanUrl, {
                filter: format => format.hasAudio && !format.hasVideo,
                highWaterMark: 1 << 25,
                quality: 'highestaudio'
            });
        }

        const resource = createAudioResource(stream, {
            inlineVolume: true,
            silencePaddingFrames: 5
        });
        resource.volume.setVolume(0.85);

        const player = createAudioPlayer();
        currentAudioPlayer = player;
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            if (isLooping && currentQuery) {
                console.log('[LOOP] Phát lại bài hát vô hạn...');
                playStream(currentQuery, connection, channel);
            }
        });

        player.on('error', (err) => {
            console.error('Lỗi phát nhạc:', err);
        });
    } catch (error) {
        console.error('Lỗi kết nối stream:', error);
    }
}

client.once('ready', async () => {
    console.log(`🚀 Bot ${client.user.tag} đã sẵn sàng hoạt động!`);

    try {
        const targetChannel = client.channels.cache.find(
            channel => channel.isTextBased() && channel.name === 'bot-lunaa-music'
        );
        if (targetChannel) {
            await targetChannel.send('Đã kết nối thành công');
            console.log('✅ Đã gửi thông báo kết nối vào kênh #bot-lunaa-music');
        }
    } catch (error) {
        console.error('Không thể gửi tin nhắn tự động:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.trim();
    const senderName = message.author.tag || message.author.username;

    console.log(`[LOG] Người dùng ${senderName} đã gửi: "${content}"`);

    // 1. !taget: Nhận diện người chơi
    if (content === '!taget') {
        isTargeted = !isTargeted;
        const playerName = message.member ? message.member.displayName : message.author.username;
        if (isTargeted) {
            return message.channel.send(`Lắng Nghe Người Chơi "${playerName}"`).catch(() => {});
        } else {
            return message.channel.send(`Đã ngắt lắng nghe "${playerName}"`).catch(() => {});
        }
    }

    // 2. !sever / !server: Gọi bot vào phòng thoại
    if (content.startsWith('!sever') || content.startsWith('!server')) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return message.channel.send('❌ Vào phòng thoại trước đã!').catch(() => {});
        }
        try {
            activeConnection = joinVoiceChannel({
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

    // 3. !loop: Bật/tắt lặp lại vô hạn
    if (content === '!loop') {
        isLooping = !isLooping;
        return message.channel.send(isLooping ? '🔁 Đã bật chế độ lặp lại vô hạn!' : '🔁 Đã tắt chế độ lặp lại.').catch(() => {});
    }

    // 4. !stop: Dừng nhạc hiện tại
    if (content === '!stop') {
        isLooping = false;
        const connection = getVoiceConnection(message.guild.id);
        if (!connection) return message.channel.send('❌ Bot không ở trong phòng!').catch(() => {});
        try {
            if (currentAudioPlayer) currentAudioPlayer.stop();
            return message.channel.send('Dừng Nhạc ✓').catch(() => {});
        } catch (error) {}
    }

    // 5. !pause: Tạm dừng phát nhạc
    if (content === '!pause') {
        if (currentAudioPlayer) {
            currentAudioPlayer.pause();
            return message.channel.send('⏸️ Đã tạm dừng nhạc!').catch(() => {});
        }
        return message.channel.send('❌ Không có bài hát nào đang phát!').catch(() => {});
    }

    // 6. !resume: Tiếp tục phát nhạc
    if (content === '!resume') {
        if (currentAudioPlayer) {
            currentAudioPlayer.unpause();
            return message.channel.send('▶️ Đã tiếp tục phát nhạc!').catch(() => {});
        }
        return message.channel.send('❌ Không có bài hát nào tạm dừng!').catch(() => {});
    }

    // 7. !stopsession: Dừng hoàn toàn và rời phòng
    if (content === '!stopsession') {
        isLooping = false;
        currentQuery = '';
        const connection = getVoiceConnection(message.guild.id);
        if (!connection) return message.channel.send('❌ Bot không ở trong phòng thoại!').catch(() => {});
        try {
            if (currentAudioPlayer) currentAudioPlayer.stop();
            connection.destroy();
            return message.channel.send('🛑 Đã ngắt kết nối và rời phòng thoại hoàn toàn!').catch(() => {});
        } catch (error) {}
    }

    // 8. !help: Xem danh sách lệnh
    if (content === '!help') {
        return message.channel.send(
            '📜 **Danh sách lệnh Bot Lunaa:**\n' +
            '`!taget` - Nhận diện người chơi\n' +
            '`!sever` - Gọi bot vào phòng thoại\n' +
            '`!play <link>` - Phát nhạc YouTube\n' +
            '`!loop` - Bật/tắt lặp lại vô hạn\n' +
            '`!pause` - Tạm dừng nhạc\n' +
            '`!resume` - Tiếp tục phát nhạc\n' +
            '`!stop` - Dừng bài hát hiện tại\n' +
            '`!stopsession` - Cho bot rời phòng thoại'
        ).catch(() => {});
    }

    // 9. !play: Phát nhạc từ link YouTube
    if (content.startsWith('!play')) {
        if (!isTargeted) {
            return message.channel.send('❌ Chưa gọi `!taget`!').catch(() => {});
        }
        let query = content.slice(5).trim();
        
        if (query.endsWith('"')) {
            query = query.slice(0, -1).trim();
        }

        if (!query) return message.channel.send('❌ Thiếu link YouTube!').catch(() => {});

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
            activeConnection = connection;

            const cleanUrl = cleanYouTubeUrl(query);
            if (!cleanUrl.startsWith('http')) return;

            currentQuery = cleanUrl; 
            await playStream(cleanUrl, connection, message.channel);

        } catch (error) {
            console.error('Lỗi kết nối:', error);
        }
    }
});

client.login('process.env.TOKEN');
