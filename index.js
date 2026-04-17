require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const express = require('express');

// ✅ Config Validation
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN .env mein missing hai!');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PREFIX = '!';
const API_BASE = process.env.FF_API_BASE || 'https://freefireinfo-zy9l.onrender.com/api/v1';
const DEFAULT_SERVER = process.env.FF_DEFAULT_SERVER || 'IND';
const API_TIMEOUT = parseInt(process.env.FF_API_TIMEOUT) || 10000;

// 🌐 Railway Health Check
const app = express();
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', uptime: process.uptime() }));
app.get('/', (req, res) => res.send('🎮 FF UID Checker Bot is Running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// 🤖 Bot Ready
client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('FF ID Checker | !uid <ID>', { type: ActivityType.Watching });
});

// 🎨 Premium Embed Generator Function
function createProfileEmbed(data, uid, server) {
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${data.nickname || 'Unknown Player'}`)
    .setColor(0xFFD700) // Gold Premium Color
    .setThumbnail(data.avatar || 'https://cdn.discordapp.com/emojis/1042663547407474849.png')
    .addFields(
      { name: '🆔 UID', value: `\`${data.uid || uid}\``, inline: true },
      { name: '📊 Level', value: `\`${data.level || 'N/A'}\``, inline: true },
      { name: '❤️ Likes', value: `\`${Number(data.likes || 0).toLocaleString()}\``, inline: true },
      { name: '🏆 Booyahs', value: `\`${data.booyahs || '0'}\``, inline: true },
      { name: '⚔️ Kills', value: `\`${Number(data.kills || 0).toLocaleString()}\``, inline: true },
      { name: '🎯 Headshot %', value: `\`${data.headshot_rate || '0'}%\``, inline: true },
      { name: '🌍 Server', value: `\`${server || DEFAULT_SERVER}\``, inline: true },
      { name: '👥 Guild', value: `\`${data.guild_name || 'No Guild'}\``, inline: true },
      { name: '👗 Outfits', value: `\`${data.outfit_count || '0'}\``, inline: true },
      { name: '🔫 Gun Skins', value: `\`${data.weapon_count || '0'}\``, inline: true }    )
    .setFooter({ text: `⚡ Data via freefireinfo API • Requested by ${client.user.username}` })
    .setTimestamp();

  // Agar bio/region available ho to add karein
  if (data.bio) embed.addFields({ name: '📝 Bio', value: `\`${data.bio}\``, inline: false });
  if (data.region) embed.addFields({ name: '🗺️ Region', value: `\`${data.region}\``, inline: true });

  return embed;
}

// 📥 Message Handler
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'uid') {
    const targetId = args[0];
    const server = args[1]?.toUpperCase() || DEFAULT_SERVER;

    // ✅ Input Validation
    if (!targetId || !/^\d{7,12}$/.test(targetId)) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Invalid Input')
          .setDescription('**Usage:** `!uid <FreeFire_ID> [SERVER]`\n\n**Examples:**\n`!uid 123456789`\n`!uid 123456789 PK`\n\n**Supported Servers:** IND, PK, SG, RU, ID, TW, US, VN, TH, ME, CIS, BR, BD')
          .setFooter({ text: 'Tip: Server optional hai, default IND use hota hai' })]
      });
    }

    const loadingMsg = await message.reply('🔍 Fetching profile... Please wait ⏳');

    try {
      // 🌍 API Request
      const response = await axios.get(`${API_BASE}/player-profile`, {
        params: {
          uid: targetId,
          server: server,
          need_gallery_info: false,
          need_blacklist: false,
          need_spark_info: false
        },
        timeout: API_TIMEOUT,
        headers: { 'User-Agent': 'FFDiscordBot/2.1', 'Accept': 'application/json' }
      });

      const data = response.data;
      // ❌ Error Handling (API ne error return kiya)
      if (data.status === 'error' || !data.nickname) {
        throw new Error(data.message || 'PLAYER_NOT_FOUND');
      }

      // ✅ Success - Premium Embed Send
      const embed = createProfileEmbed(data, targetId, server);
      
      // Optional: Refresh Button add karein
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`refresh_${targetId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary)
        );

      await loadingMsg.edit({ content: null, embeds: [embed], components: [row] });

    } catch (error) {
      let errorMsg = '⚠️ Data fetch nahi ho saka. Thori der baad try karein.';
      let errorColor = 0xFFA500; // Orange

      if (error.response) {
        const apiError = error.response.data;
        if (apiError?.code === 'PLAYER_DATA_NOT_FOUND') {
          errorMsg = `🚫 **ID Not Found**\n\nFree Fire ID \`${targetId}\` ka koi data nahi mila.\n\nPossible reasons:\n• ID galat hai\n• Player ne profile private ki hai\n• Server wrong hai (try: PK, IND, SG)`;
          errorColor = 0xFF0000;
        } else if (error.response.status === 429) {
          errorMsg = '⏳ **Rate Limit Hit**\n\nAPI par zyada requests aa rahi hain. 60 seconds wait karein phir try karein.';
          errorColor = 0xFFFF00;
        } else if (error.response.status >= 500) {
          errorMsg = '🔧 **API Down**\n\nFree Fire Info API temporary down hai. Developer ko inform karein ya baad mein try karein.';
          errorColor = 0x808080;
        } else {
          errorMsg = `❌ **API Error ${error.response.status}**\n\`${apiError?.message || error.response.statusText}\``;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMsg = '⏱️ **Request Timeout**\n\nAPI server slow respond kar raha hai. Internet check karein ya baad mein try karein.';
      } else if (error.message === 'PLAYER_NOT_FOUND') {
        errorMsg = '🚫 **Invalid or Private ID**\n\nYe ID exist nahi karti ya player ne apna data public nahi kiya.';
        errorColor = 0xFF0000;
      }

      await loadingMsg.edit({
        embeds: [new EmbedBuilder()
          .setColor(errorColor)
          .setTitle('⚠️ Error')
          .setDescription(errorMsg)          .setFooter({ text: 'Tip: Server change kar ke try karein (!uid ID PK)' })],
        components: []
      });
      
      // Console logging for debugging
      console.error(`[FF-UID Error] UID:${targetId} | Server:${server} | ${error.message}`);
    }
  }

  // 🔄 Refresh Button Handler (Optional Feature)
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('refresh_')) return;
    
    await interaction.deferUpdate();
    const uid = interaction.customId.split('_')[1];
    
    // Same logic as !uid command (code reuse ke liye function bana sakte hain)
    // ... (implementation same as above)
  });
});

// 🔌 Login & Graceful Shutdown
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Login Failed:', err.message);
  process.exit(1);
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    client.destroy();
    process.exit(0);
  });
});
