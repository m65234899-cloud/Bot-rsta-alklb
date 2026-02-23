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
const IMAGE_URL = "https://cdn.discordapp.com/attachments/1471928643545469010/1475300913760440482/InShot_20260223_041244533.gif?ex=699cfc8b&is=699bab0b&hm=8c80f37ae10a8265a10e423fa83677faf4d59c099132b3a9c4f7ba31dc826c50&";

let activeRequests = new Map();
let savedRoles = new Map();

client.once("ready", () => {
  console.log(`✅ ${client.user.tag}`);
});

// ===== لوحة الإجازات =====
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

// ===== التفاعلات =====
client.on(Events.InteractionCreate, async (interaction) => {

  try {

    // ===== Buttons =====
    if (interaction.isButton()) {

      if (["vacation","resign","endvac","extend","absence"].includes(interaction.customId)) {

        if (activeRequests.has(interaction.user.id))
          return interaction.reply({ content: "❌ عندك طلب مفتوح بالفعل", ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(interaction.customId)
          .setTitle("استبيان الطلب");

        const input = (id,label) =>
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        let fields = [];

        if (interaction.customId === "vacation")
          fields = [input("name","اسمك"), input("reason","السبب"), input("days","عدد الأيام")];

        if (interaction.customId === "resign")
          fields = [input("name","اسمك"), input("reason","سبب الاستقالة"), input("confirm","هل أنت متأكد؟")];

        if (interaction.customId === "endvac")
          fields = [input("name","اسمك"), input("reason","سبب الإنهاء"), input("confirm","المدة التي قضيتها")];

        if (interaction.customId === "extend")
          fields = [input("name","اسمك"), input("reason","سبب التمديد"), input("days","عدد الأيام")];

        if (interaction.customId === "absence")
          fields = [input("name","اسمك"), input("reason","السبب"), input("days","مدة الغياب")];

        fields.forEach(f =>
          modal.addComponents(new ActionRowBuilder().addComponents(f))
        );

        return interaction.showModal(modal);
      }

      // ===== قبول / رفض الإداري =====
      if (interaction.customId === "admin_accept" || interaction.customId === "admin_reject") {

        if (!interaction.member.roles.cache.has(STAFF_ROLE))
          return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

        const embed = interaction.message.embeds[0];
        const [userId, type] = embed.footer.text.split("|");

        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member)
          return interaction.reply({ content: "❌ العضو غير موجود", ephemeral: true });

        const reviewChannel = await client.channels.fetch(REVIEW_ROOM).catch(()=>null);

        // ===== قبول =====
        if (interaction.customId === "admin_accept") {

          const modal = new ModalBuilder()
            .setCustomId(`accept_${userId}_${type}`)
            .setTitle("رسالة القبول");

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("days")
                .setLabel("عدد الأيام")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("msg")
                .setLabel("رسالة القبول")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
            )
          );

          return interaction.showModal(modal);
        }
        // ===== رفض =====
        if (interaction.customId === "admin_reject") {

          const modal = new ModalBuilder()
            .setCustomId(`reject_${userId}`)
            .setTitle("رسالة الرفض");

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("msg")
                .setLabel("رسالة الرفض")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
            )
          );

          return interaction.showModal(modal);
        }
      }
    }

    // ===== Modal Submit =====
    if (interaction.isModalSubmit()) {

      if (!interaction.deferred && !interaction.replied)
        await interaction.deferReply({ ephemeral: true });

      const customId = interaction.customId;

      // ===== قبول الطلب =====
      if (customId.startsWith("accept_")) {

        const [, userId, type] = customId.split("_");

        const member = await interaction.guild.members.fetch(userId).catch(()=>null);
        if (!member)
          return interaction.editReply({ content: "❌ العضو غير موجود" });

        const days = parseInt(interaction.fields.getTextInputValue("days")) || 0;
        const msg = interaction.fields.getTextInputValue("msg") || "تم قبول طلبك";

        if (type === "vacation" && days > 0) {

          const endDate = new Date();
          endDate.setDate(endDate.getDate() + days);

          member.send({
            content: `<@${userId}>`,
            embeds: [
              new EmbedBuilder()
                .setColor("Green")
                .setDescription(`✅ تم قبول طلبك\n📅 ينتهي بتاريخ: ${endDate.toLocaleDateString()}\n\n${msg}`)
            ]
          }).catch(()=>{});

        } else {

          member.send({
            content: `<@${userId}>`,
            embeds: [
              new EmbedBuilder()
                .setColor("Green")
                .setDescription(`✅ تم قبول طلبك\n\n${msg}`)
            ]
          }).catch(()=>{});
        }

        const reviewChannel = await client.channels.fetch(REVIEW_ROOM).catch(()=>null);

        if (reviewChannel)
          reviewChannel.send(`✅ <@${userId}> تم قبول طلبه`).catch(()=>{});

        await interaction.message.delete().catch(()=>{});

        activeRequests.delete(userId);

        return interaction.editReply({ content: "✅ تم القبول" });
      }

      // ===== رفض الطلب =====
      if (customId.startsWith("reject_")) {

        const userId = customId.split("_")[1];

        const msg = interaction.fields.getTextInputValue("msg") || "❌ تم رفض طلبك";

        const member = await interaction.guild.members.fetch(userId).catch(()=>null);
        if (member) {

          member.send({
            content: `<@${userId}>`,
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setDescription(`❌ تم رفض طلبك\n\n${msg}`)
            ]
          }).catch(()=>{});

        }

        const reviewChannel = await client.channels.fetch(REVIEW_ROOM).catch(()=>null);

        if (reviewChannel)
          reviewChannel.send(`❌ <@${userId}> تم رفض طلبه`).catch(()=>{});

        await interaction.message.delete().catch(()=>{});

        activeRequests.delete(userId);

        return interaction.editReply({ content: "❌ تم الرفض" });
      }
     // ===== إرسال الطلب للإدارة =====
if (["vacation","resign","endvac","extend","absence"].includes(customId)) {

  const reviewChannel = await client.channels.fetch(REVIEW_ROOM).catch(()=>null);
  if (!reviewChannel)
    return interaction.editReply({ content: "❌ روم المراجعة غير موجود" });

  const requestNames = {
    vacation: "طلب إجازة",
    resign: "طلب استقالة",
    endvac: "إنهاء إجازة",
    extend: "تمديد إجازة",
    absence: "طلب عذر عدم تواجد"
  };

  const fields = interaction.fields?.fields || new Map();

  let description = "";

  for (const f of fields.values()) {
    description += `**${f.customId}** : ${f.value}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(requestNames[customId] || "طلب جديد")
    .setDescription(description || "لا توجد بيانات")
    .setFooter({ text: `${interaction.user.id}|${customId}` })
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

  return interaction.editReply({ content: "✅ تم إرسال طلبك للإدارة" });
}

client.login(process.env.TOKEN);
