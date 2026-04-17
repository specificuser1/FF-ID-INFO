require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// ✅ Config Validation
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN .env mein missing hai!');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 🎛️ Config
const PREFIX = '!';
const API_BASE = process.env.FF_API_BASE || 'https://freefireinfo-zy9l.onrender.com/api/v1';
const API_TIMEOUT = parseInt(process.env.FF_API_TIMEOUT) || 12000;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').filter(id => id.trim());
const BOT_OWNER = process.env.BOT_OWNER_ID || '';

// 📁 Data Paths
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  banned: path.join(DATA_DIR, 'banned.json'),
  likes: path.join(DATA_DIR, 'likes.json'),
  stats: path.join(DATA_DIR, 'stats.json')
};

// 🗄️ JSON Storage Helper Functions
async function ensureDataDir() {
  try { await fs.access(DATA_DIR); } 
  catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function readJSON(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch { return {}; }
}

async function writeJSON(file, data) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}
// 🛡️ Permission Checks
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId) || userId === BOT_OWNER;
}

function isOwner(userId) {
  return userId === BOT_OWNER;
}

// 🌐 Railway Health Check
const app = express();
app.get('/health', (req, res) => res.status(200).json({ 
  status: 'OK', 
  uptime: process.uptime(),
  guilds: client.guilds.cache.size,
  users: client.users.cache.size
}));
app.get('/', (req, res) => res.send('🎮 FF UID Checker Pro Bot is Running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// 🤖 Bot Ready
client.on('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag} | ${client.guilds.cache.size} servers`);
  client.user.setActivity('FF & FF MAX | !help', { type: ActivityType.Watching });
  
  // Initialize data files
  await ensureDataDir();
  await readJSON(FILES.banned).then(d => writeJSON(FILES.banned, d)).catch(()=>{});
  await readJSON(FILES.likes).then(d => writeJSON(FILES.likes, d)).catch(()=>{});
  await readJSON(FILES.stats).then(d => writeJSON(FILES.stats, d)).catch(()=>{});
});

// 🎨 Premium Embed Generator
function createProfileEmbed(data, uid) {
  const isMax = data.game_mode?.includes('MAX') || data.version === 'max';
  
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${data.nickname || 'Unknown Player'} ${isMax ? '🔥 MAX' : ''}`)
    .setColor(isMax ? 0x9D00FF : 0xFFD700) // Purple for MAX, Gold for FF
    .setThumbnail(data.avatar || 'https://cdn.discordapp.com/emojis/1042663547407474849.png')
    .addFields(
      { name: '🆔 UID', value: `\`${data.uid || uid}\``, inline: true },
      { name: '📊 Level', value: `\`${data.level || 'N/A'}\``, inline: true },
      { name: '❤️ Likes', value: `\`${Number(data.likes || 0).toLocaleString()}\``, inline: true },
      { name: '🏆 Booyahs', value: `\`${data.booyahs || '0'}\``, inline: true },
      { name: '⚔️ Kills', value: `\`${Number(data.kills || 0).toLocaleString()}\``, inline: true },
      { name: '🎯 Headshot %', value: `\`${data.headshot_rate || '0'}%\``, inline: true },
      { name: '🌍 Region', value: `\`${data.region || 'Auto-Detected'}\``, inline: true },
      { name: '👥 Guild', value: `\`${data.guild_name || 'No Guild'}\``, inline: true },      { name: '👗 Outfits', value: `\`${data.outfit_count || '0'}\``, inline: true },
      { name: '🔫 Gun Skins', value: `\`${data.weapon_count || '0'}\``, inline: true }
    )
    .setFooter({ text: `⚡ FF ${isMax ? 'MAX' : ''} • Data via freefireinfo API` })
    .setTimestamp();

  if (data.bio) embed.addFields({ name: '📝 Bio', value: `\`${data.bio}\``, inline: false });
  if (data.last_login) embed.addFields({ name: '🕐 Last Active', value: `\`${data.last_login}\``, inline: true });

  return embed;
}

// 🔍 Auto-Detect Region Function
async function fetchPlayerData(uid) {
  // Pehle bina server ke try karein (API auto-detect karegi)
  try {
    const res = await axios.get(`${API_BASE}/player-profile`, {
      params: { uid, need_gallery_info: false, need_blacklist: false },
      timeout: API_TIMEOUT,
      headers: { 'User-Agent': 'FFDiscordBot/3.0' }
    });
    if (res.data.status !== 'error' && res.data.nickname) return res.data;
  } catch (e) { /* Continue to fallback */ }

  // Fallback: Common servers try karein
  const servers = ['IND', 'PK', 'SG', 'US', 'BR'];
  for (const server of servers) {
    try {
      const res = await axios.get(`${API_BASE}/player-profile`, {
        params: { uid, server, need_gallery_info: false },
        timeout: API_TIMEOUT,
        headers: { 'User-Agent': 'FFDiscordBot/3.0' }
      });
      if (res.data.status !== 'error' && res.data.nickname) return res.data;
    } catch (e) { continue; }
  }
  
  throw new Error('PLAYER_NOT_FOUND');
}

// 📥 Message Handler
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;

  // ─────────────────────────────────────────────────────
  // 🔹 !help - Bot Info & Commands  // ─────────────────────────────────────────────────────
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('🎮 FF UID Checker Pro - Help')
      .setColor(0x0099FF)
      .setDescription('Professional Free Fire & Free Fire MAX ID Checker Bot')
      .addFields(
        { name: '🔍 Public Commands', value: 
          '`!uid <ID>` - Check FF/FF MAX profile (auto-detect region)\n`!like <ID>` - Like a player ID\n`!unlike <ID>` - Remove your like\n`!checkban <ID>` - Check if ID is banned\n`!help` - Show this menu' },
        { name: '🔐 Admin Commands', value: 
          '`!status` - Show bot statistics\n`!broadcast <msg>` - Send message to all servers\n`!ban <ID> [reason]` - Ban an ID\n`!unban <ID>` - Unban an ID' },
        { name: 'ℹ️ Bot Info', value: 
          `Version: \`3.0.0\`\nServers: \`${client.guilds.cache.size}\`\nUptime: \`${formatUptime(process.uptime())}\`` }
      )
      .setFooter({ text: 'Made with ❤️ for FF Community' })
      .setTimestamp();
    
    return message.reply({ embeds: [embed] });
  }

  // ─────────────────────────────────────────────────────
  // 🔹 !uid <ID> - Check Profile (Auto-Detect)
  // ─────────────────────────────────────────────────────
  if (command === 'uid') {
    const targetId = args[0];
    
    if (!targetId || !/^\d{7,12}$/.test(targetId)) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Invalid Input')
          .setDescription('**Usage:** `!uid <FreeFire_ID>`\n\n**Example:** `!uid 123456789`\n\nBot auto-detect karega ke ID kis region ki hai aur FF ya FF MAX hai.')]
      });
    }

    // 🚫 Check if ID is banned
    const bannedData = await readJSON(FILES.banned);
    if (bannedData[targetId]) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('🚫 ID Banned')
          .setDescription(`Ye ID banned hai.\n\n**Reason:** \`${bannedData[targetId].reason || 'No reason provided'}\`\n**Banned by:** <@${bannedData[targetId].by || 'Unknown'}>\n**Date:** <t:${Math.floor(bannedData[targetId].timestamp / 1000)}:R>`)
          .setFooter({ text: 'Contact admin for appeal' })]
      });
    }

    const loadingMsg = await message.reply('🔍 Fetching profile... Auto-detecting region ⏳');

    try {      const data = await fetchPlayerData(targetId);
      const embed = createProfileEmbed(data, targetId);
      
      // 👍 Like count show karein
      const likesData = await readJSON(FILES.likes);
      const likeCount = likesData[targetId]?.count || 0;
      const userLiked = likesData[targetId]?.users?.includes(userId);
      
      embed.addFields({ 
        name: '👍 Community Likes', 
        value: `\`${likeCount}\` ${userLiked ? '✅ You liked' : ''}`, 
        inline: true 
      });

      // 🔘 Like/Unlike Buttons
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`like_${targetId}`)
            .setLabel(userLiked ? '❤️ Liked' : '🤍 Like')
            .setStyle(userLiked ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(false),
          new ButtonBuilder()
            .setCustomId(`refresh_${targetId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
        );

      await loadingMsg.edit({ content: null, embeds: [embed], components: [row] });

      // 📊 Stats update
      const stats = await readJSON(FILES.stats);
      stats.total_checks = (stats.total_checks || 0) + 1;
      stats.last_check = new Date().toISOString();
      await writeJSON(FILES.stats, stats);

    } catch (error) {
      let errorMsg = '⚠️ Data fetch nahi ho saka. Thori der baad try karein.';
      let errorColor = 0xFFA500;

      if (error.message === 'PLAYER_NOT_FOUND') {
        errorMsg = `🚫 **ID Not Found**\n\nFree Fire ID \`${targetId}\` ka koi data nahi mila.\n\nPossible reasons:\n• ID galat hai\n• Player ne profile private ki hai\n• Server temporary issue hai`;
        errorColor = 0xFF0000;
      } else if (error.code === 'ECONNABORTED') {
        errorMsg = '⏱️ **Request Timeout**\n\nAPI server slow hai. Internet check karein ya baad mein try karein.';
      }

      await loadingMsg.edit({
        embeds: [new EmbedBuilder()
          .setColor(errorColor)          .setTitle('⚠️ Error')
          .setDescription(errorMsg)],
        components: []
      });
      console.error(`[FF-UID] Error: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────────────
  // 🔹 !like / !unlike - ID Like System
  // ─────────────────────────────────────────────────────
  if (['like', 'unlike'].includes(command)) {
    const targetId = args[0];
    if (!targetId || !/^\d{7,12}$/.test(targetId)) {
      return message.reply('❌ Valid Free Fire ID enter karein. Example: `!like 123456789`');
    }

    const likesData = await readJSON(FILES.likes);
    if (!likesData[targetId]) likesData[targetId] = { count: 0, users: [] };

    if (command === 'like') {
      if (likesData[targetId].users.includes(userId)) {
        return message.reply('✅ You have already liked this ID! Use `!unlike` to remove.');
      }
      likesData[targetId].count++;
      likesData[targetId].users.push(userId);
      await writeJSON(FILES.likes, likesData);
      return message.reply(`❤️ You liked ID \`${targetId}\`! Total likes: \`${likesData[targetId].count}\``);
    } else {
      if (!likesData[targetId].users.includes(userId)) {
        return message.reply('❌ You haven\'t liked this ID yet.');
      }
      likesData[targetId].count = Math.max(0, likesData[targetId].count - 1);
      likesData[targetId].users = likesData[targetId].users.filter(id => id !== userId);
      await writeJSON(FILES.likes, likesData);
      return message.reply(`🤍 Like removed from ID \`${targetId}\`. Total likes: \`${likesData[targetId].count}\``);
    }
  }

  // ─────────────────────────────────────────────────────
  // 🔹 !checkban <ID> - Check Ban Status
  // ─────────────────────────────────────────────────────
  if (command === 'checkban') {
    const targetId = args[0];
    if (!targetId || !/^\d{7,12}$/.test(targetId)) {
      return message.reply('❌ Valid Free Fire ID enter karein. Example: `!checkban 123456789`');
    }

    const bannedData = await readJSON(FILES.banned);
    if (bannedData[targetId]) {      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('🚫 ID is BANNED')
          .addFields(
            { name: '🆔 UID', value: `\`${targetId}\``, inline: true },
            { name: '📝 Reason', value: `\`${bannedData[targetId].reason || 'No reason'}\``, inline: false },
            { name: '👮 Banned By', value: `<@${bannedData[targetId].by || 'Unknown'}>`, inline: true },
            { name: '📅 Date', value: `<t:${Math.floor(bannedData[targetId].timestamp / 1000)}:R>`, inline: true }
          )]
      });
    } else {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ ID is NOT Banned')
          .setDescription(`ID \`${targetId}\` ko koi ban nahi hai. Ye normal use ke liye available hai.`)]
      });
    }
  }

  // ─────────────────────────────────────────────────────
  // 🔐 ADMIN COMMANDS
  // ─────────────────────────────────────────────────────
  if (!isAdmin(userId)) return; // Non-admins can't access below commands

  // 🔹 !status - Bot Statistics
  if (command === 'status') {
    const stats = await readJSON(FILES.stats);
    const banned = await readJSON(FILES.banned);
    const likes = await readJSON(FILES.likes);
    
    const totalLikes = Object.values(likes).reduce((sum, d) => sum + (d.count || 0), 0);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Status - Admin Panel')
      .setColor(0x00FF00)
      .addFields(
        { name: '🤖 Bot Info', value: 
          `Tag: \`${client.user.tag}\`\nID: \`${client.user.id}\`\nUptime: \`${formatUptime(process.uptime())}\`` },
        { name: '🌍 Server Stats', value: 
          `Servers: \`${client.guilds.cache.size}\`\nUsers: \`${client.users.cache.size}\`\nChannels: \`${client.channels.cache.size}\`` },
        { name: '📈 Usage Stats', value: 
          `Total ID Checks: \`${stats.total_checks || 0}\`\nBanned IDs: \`${Object.keys(banned).length}\`\nTotal Likes Given: \`${totalLikes}\`` },
        { name: '💾 Storage', value: 
          `Banned File: \`${Object.keys(banned).length}\` entries\nLikes File: \`${Object.keys(likes).length}\` entries` }
      )
      .setFooter({ text: 'Admin Only • Refresh with !status' })
      .setTimestamp();
        return message.reply({ embeds: [embed] });
  }

  // 🔹 !broadcast <message> - Send to all servers
  if (command === 'broadcast') {
    const broadcastMsg = args.join(' ');
    if (!broadcastMsg) {
      return message.reply('❌ Usage: `!broadcast <your message here>`');
    }

    const embed = new EmbedBuilder()
      .setTitle('📢 Bot Announcement')
      .setDescription(broadcastMsg)
      .setColor(0xFFAA00)
      .setFooter({ text: `Sent by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    let sent = 0, failed = 0;
    const reply = await message.reply(`🔄 Broadcasting to ${client.guilds.cache.size} servers...`);

    for (const guild of client.guilds.cache.values()) {
      try {
        const channel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(client.user).has('SendMessages'));
        if (channel) {
          await channel.send({ embeds: [embed] });
          sent++;
        }
      } catch (e) { failed++; }
    }

    await reply.edit({ content: null, embeds: [new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Broadcast Complete')
      .setDescription(`📤 Sent: \`${sent}\` servers\n❌ Failed: \`${failed}\` servers\n📝 Message: \`${broadcastMsg.slice(0, 100)}${broadcastMsg.length > 100 ? '...' : ''}\``)] });
  }

  // 🔹 !ban <ID> [reason] - Ban an ID
  if (command === 'ban') {
    const targetId = args[0];
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    if (!targetId || !/^\d{7,12}$/.test(targetId)) {
      return message.reply('❌ Usage: `!ban <FreeFire_ID> [reason]`');
    }

    const bannedData = await readJSON(FILES.banned);
    bannedData[targetId] = {
      by: userId,
      reason: reason,
      timestamp: Date.now()    };
    await writeJSON(FILES.banned, bannedData);

    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('✅ ID Banned')
        .setDescription(`ID \`${targetId}\` ko successfully ban kar diya gaya hai.\n\n**Reason:** \`${reason}\`\n**Banned by:** <@${userId}>`)
        .setFooter({ text: 'Use !unban <ID> to reverse' })]
    });
  }

  // 🔹 !unban <ID> - Unban an ID
  if (command === 'unban') {
    const targetId = args[0];
    if (!targetId || !/^\d{7,12}$/.test(targetId)) {
      return message.reply('❌ Usage: `!unban <FreeFire_ID>`');
    }

    const bannedData = await readJSON(FILES.banned);
    if (!bannedData[targetId]) {
      return message.reply(`❌ ID \`${targetId}\` pehle se hi banned nahi hai.`);
    }

    delete bannedData[targetId];
    await writeJSON(FILES.banned, bannedData);

    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ ID Unbanned')
        .setDescription(`ID \`${targetId}\` ko successfully unban kar diya gaya hai.\n\n**Unbanned by:** <@${userId}>`)]
    });
  }
});

// 🔘 Button Interaction Handler (Like/Refresh)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [action, uid] = interaction.customId.split('_');
  
  if (action === 'refresh' && uid) {
    await interaction.deferUpdate();
    // Simple refresh: re-fetch and edit message (same logic as !uid)
    try {
      const data = await fetchPlayerData(uid);
      const embed = createProfileEmbed(data, uid);
      const likesData = await readJSON(FILES.likes);
      const likeCount = likesData[uid]?.count || 0;      const userLiked = likesData[uid]?.users?.includes(interaction.user.id);
      embed.addFields({ name: '👍 Community Likes', value: `\`${likeCount}\` ${userLiked ? '✅ You liked' : ''}`, inline: true });
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`like_${uid}`)
            .setLabel(userLiked ? '❤️ Liked' : '🤍 Like')
            .setStyle(userLiked ? ButtonStyle.Success : ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`refresh_${uid}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) {
      await interaction.followUp({ content: '⚠️ Refresh failed. Try again later.', ephemeral: true });
    }
  }
  
  if (action === 'like' && uid) {
    await interaction.deferUpdate();
    const userId = interaction.user.id;
    const likesData = await readJSON(FILES.likes);
    
    if (!likesData[uid]) likesData[uid] = { count: 0, users: [] };
    
    if (likesData[uid].users.includes(userId)) {
      // Unlike
      likesData[uid].count = Math.max(0, likesData[uid].count - 1);
      likesData[uid].users = likesData[uid].users.filter(id => id !== userId);
    } else {
      // Like
      likesData[uid].count++;
      likesData[uid].users.push(userId);
    }
    
    await writeJSON(FILES.likes, likesData);
    
    // Update embed
    try {
      const data = await fetchPlayerData(uid);
      const embed = createProfileEmbed(data, uid);
      const likeCount = likesData[uid].count;
      const userLiked = likesData[uid].users.includes(userId);
      embed.addFields({ name: '👍 Community Likes', value: `\`${likeCount}\` ${userLiked ? '✅ You liked' : ''}`, inline: true });
      
      const row = new ActionRowBuilder()
        .addComponents(          new ButtonBuilder()
            .setCustomId(`like_${uid}`)
            .setLabel(userLiked ? '❤️ Liked' : '🤍 Like')
            .setStyle(userLiked ? ButtonStyle.Success : ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`refresh_${uid}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) {
      await interaction.followUp({ content: '⚠️ Could not update embed.', ephemeral: true });
    }
  }
});

// 🔌 Login & Graceful Shutdown
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Login Failed:', err.message);
  process.exit(1);
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.log(`\n🛑 Received ${signal}. Shutting down...`);
    client.destroy();
    process.exit(0);
  });
});

// 🕐 Helper: Format uptime
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
