require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  PermissionsBitField
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel],
});

// ====== ايدياتك ======
const VACATION_ROOM = "1472304760093802731";
const REVIEW_ROOM = "1474893806259409008";
const VACATION_ROLE = "1474887919331180776";
const RESIGN_ROLE = "1474896675310014536";
const STAFF_ROLE = "1471881885796798726";
const IMAGE_URL = "https://cdn.discordapp.com/attachments/1474893806259409008/1474898430072590497/IMG_7702.jpg";
// =====================

let activeRequests = new Map();
let savedRoles = new Map();

client.once("ready", () => {
  console.log(`✅ ${client.user.tag}`);
});

// ====== امر setup ======
client.on("messageCreate", async (message) => {

  if (message.content === "!setup") {

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ فقط الادارة");

    const channel = await client.channels.fetch(VACATION_ROOM).catch(() => null);
    if (!channel) return message.reply("❌ الروم غير موجود");

    const embed = new EmbedBuilder()
      .setImage(IMAGE_URL)
      .setColor("#2F3136");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vacation").setLabel("طلب إجازة").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("resign").setLabel("طلب استقالة").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("endvac").setLabel("إنهاء إجازة").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("extend").setLabel("تمديد إجازة").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("absence").setLabel("طلب عذر عدم تواجد").setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    message.reply("✅ تم إرسال لوحة الإجازات");
  }

});

// ====== التفاعلات ======
client.on(Events.InteractionCreate, async (interaction) => {

  // ====== ازرار التقديم ======
  if (
    interaction.isButton() &&
    ["vacation", "resign", "endvac", "extend", "absence"].includes(interaction.customId)
  ) {

    if (activeRequests.has(interaction.user.id))
      return interaction.reply({ content: "❌ عندك طلب مفتوح بالفعل", ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(interaction.customId)
      .setTitle("استبيان الطلب");

    const input = (id, label) =>
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    let fields = [];

    if (interaction.customId === "vacation")
      fields = [input("name", "اسمك"), input("reason", "السبب"), input("days", "عدد الأيام")];

    if (interaction.customId === "resign")
      fields = [input("name", "اسمك"), input("reason", "سبب الاستقالة"), input("confirm", "هل أنت متأكد؟")];

    if (interaction.customId === "endvac")
      fields = [input("name", "اسمك"), input("reason", "سبب الإنهاء"), input("confirm", "هل أنت متأكد؟")];

    if (interaction.customId === "extend")
      fields = [input("name", "اسمك"), input("reason", "سبب التمديد"), input("days", "عدد الأيام")];

    if (interaction.customId === "absence")
      fields = [input("name", "اسمك"), input("reason", "السبب"), input("days", "مدة الغياب")];

    fields.forEach(f => modal.addComponents(new ActionRowBuilder().addComponents(f)));

    return interaction.showModal(modal);
  }

  // ====== ارسال الطلب للادارة (تم إصلاح التعليق) ======
  if (interaction.isModalSubmit()) {

    try {

      if (!interaction.replied && !interaction.deferred)
        await interaction.deferReply({ ephemeral: true });

      const reviewChannel = await client.channels.fetch(REVIEW_ROOM).catch(() => null);

      if (!reviewChannel)
        return interaction.editReply({ content: "❌ روم المراجعة غير موجود" });

      if (activeRequests.has(interaction.user.id))
        return interaction.editReply({ content: "❌ لديك طلب قيد المراجعة بالفعل" });

      const fields = interaction.fields.fields;

      let description = "";

      for (const f of fields.values()) {
        description += `**${f.customId}** : ${f.value}\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("طلب جديد")
        .setDescription(description || "لا توجد بيانات")
        .setFooter({
          text: `${interaction.user.id}|${interaction.customId}`
        })
        .setColor("Blue");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin_accept").setLabel("قبول").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin_reject").setLabel("رفض").setStyle(ButtonStyle.Danger)
      );

      await reviewChannel.send({
        embeds: [embed],
        components: [row]
      });

      activeRequests.set(interaction.user.id, true);

      return interaction.editReply({
        content: "✅ تم إرسال طلبك للإدارة"
      });

    } catch (err) {
      console.error(err);
    }
  }

  // ====== قبول / رفض ======
  if (interaction.isButton() && interaction.customId.startsWith("admin_")) {

    if (!interaction.member.roles.cache.has(STAFF_ROLE))
      return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const embed = interaction.message.embeds[0];
    const [userId, type] = embed.footer.text.split("|");

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.editReply({ content: "❌ العضو غير موجود" });

    activeRequests.delete(userId);

    if (interaction.customId === "admin_accept") {

      if (type === "vacation") {

        savedRoles.set(userId, member.roles.cache.map(r => r.id));

        await member.roles.set([VACATION_ROLE]);

        const days = parseInt(embed.description.match(/days\*\* : (.*)/)?.[1] || 0);

        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        member.send(`✅ تم قبول إجازتك\n📅 تنتهي بتاريخ: ${endDate.toLocaleDateString()}`).catch(() => {});
      }

      if (type === "resign") {
        await member.roles.add(RESIGN_ROLE).catch(() => {});
        member.send("✅ تم قبول استقالتك").catch(() => {});
      }

      if (type === "endvac") {
        const oldRoles = savedRoles.get(userId);
        if (oldRoles) await member.roles.set(oldRoles).catch(() => {});
        member.send("✅ تم إنهاء الإجازة وإرجاع رتبك").catch(() => {});
      }

      if (type === "extend") {
        member.send("✅ تم تمديد الإجازة").catch(() => {});
      }

      if (type === "absence") {
        member.send("✅ تم قبول عذر عدم التواجد").catch(() => {});
      }

      return interaction.editReply({ content: "✅ تم القبول" });
    }

    if (interaction.customId === "admin_reject") {

      member.send("❌ تم رفض طلبك").catch(() => {});
      return interaction.editReply({ content: "❌ تم الرفض" });
    }
  }

});

client.login(process.env.TOKEN);
