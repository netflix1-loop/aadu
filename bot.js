require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const chokidar = require('chokidar');

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS.split(',').map(id => id.trim());

// Initialize the bot with reduced polling interval for faster response
const bot = new TelegramBot(BOT_TOKEN, {
    polling: { interval: 100, autoStart: true }
});

// Directory to watch
const WATCH_DIR = './user/downloads';

// Ensure the directory exists
if (!fs.existsSync(WATCH_DIR)) {
    console.error(`Directory ${WATCH_DIR} does not exist! Creating it...`);
    fs.mkdirSync(WATCH_DIR, { recursive: true });
}

// Function to delete all files in the folder at startup
const cleanDownloadFolder = () => {
    fs.readdir(WATCH_DIR, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${err.message}`);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(WATCH_DIR, file);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Error deleting file ${filePath}:`, err.message);
                } else {
                    console.log(`Deleted old file: ${filePath}`);
                }
            });
        });
    });
};

// Clean the folder before starting the bot
cleanDownloadFolder();

// Handle `/start` command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // "private" for personal chat, "group" or "supergroup" for groups

    if (chatType === "private") {
        bot.sendMessage(chatId, `Your Chat ID: \`${chatId}\``, { parse_mode: "MarkdownV2" });
        console.log(`Sent Chat ID to user: ${chatId}`);
    } else if (chatType === "group" || chatType === "supergroup") {
        bot.sendMessage(chatId, `This Group's Chat ID: \`${chatId}\``, { parse_mode: "MarkdownV2" });
        console.log(`Sent Chat ID to group: ${chatId}`);
    }
});

// Watch for new files
chokidar.watch(WATCH_DIR, { ignored: /^\./, persistent: true })
    .on('add', (filePath) => {
        console.log(`New file detected: ${filePath}`);
        sendFileToChats(filePath);
    });

// Function to extract prefix (first number) from filename
const extractPrefix = (filename) => {
    const match = filename.match(/^(-?\d+)_/);
    return match ? match[1] : 'Unknown';
};

// Function to delete a file after sending (always deletes)
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Error deleting file ${filePath}:`, err.message);
        } else {
            console.log(`File deleted: ${filePath}`);
        }
    });
};

// Function to send file to all chat IDs in true parallel execution
const sendFileToChats = async (filePath) => {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName).slice(1); // Extract file extension without dot
    const captionText = extractPrefix(fileName);
    
    // Escape backtick and period for MarkdownV2
    const caption = `\`${captionText}\` \\.${fileExtension}`; // Escape period and backtick

    // Create an array of promises to send messages concurrently
    const sendPromises = CHAT_IDS.map(async (chatId) => {
        const sendOptions = { caption, parse_mode: "MarkdownV2" };

        try {
            if (isImage(filePath)) {
                await bot.sendPhoto(chatId, filePath, sendOptions);
            } else if (isVideo(filePath)) {
                await bot.sendVideo(chatId, filePath, sendOptions);
            } else if (isAudio(filePath)) {
                await bot.sendAudio(chatId, filePath, sendOptions);
            } else {
                await bot.sendDocument(chatId, filePath, sendOptions);
            }
            console.log(`Success: Sent file ${fileName} to chat: ${chatId}`);
        } catch (error) {
            console.error(`Failed: Error sending file ${fileName} to chat: ${chatId}. Reason: ${error.message}`);
        }
    });

    // Execute all sending promises concurrently
    await Promise.allSettled(sendPromises);

    // Delete the file no matter what
    deleteFile(filePath);
};

// Function to safely clear console every 30 seconds
setInterval(() => {
    process.stdout.write('\x1Bc'); // Clears the console using an ANSI escape code
    console.log("Console cleared. Bot is still running...");
}, 30000);

// Helpers to check file types
const isImage = (filePath) => /\.(jpg|jpeg|png|gif|webp)$/i.test(filePath);
const isVideo = (filePath) => /\.(mp4|mkv|mov|avi|webm)$/i.test(filePath);
const isAudio = (filePath) => /\.(mp3|wav|ogg)$/i.test(filePath);

// Start message
console.log('Bot is watching the downloads folder...');
