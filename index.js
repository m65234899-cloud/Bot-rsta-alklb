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
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const VACATION_ROOM = "1472304760093802731";
const REVIEW_ROOM = "1474893806259409008";

const VACATION_ROLE = "1474887919331180776";
const RESIGN_ROLE = "1474896675310014536";

const STAFF_ROLE = "1472284690504482896";

const IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1474893806259409008/1474898430072590497/IMG_7702.jpg";

let activeRequests = new Map();
let savedRoles = new Map();

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag}`);

  const channel = await client.channels.fetch(VACATION_ROOM);

  const embed = new EmbedBuilder().setImage(IMAGE_URL).setColor("#2F3136");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("vacation").setLabel("طلب إجازة").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("resign").setLabel("طلب استقالة").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("endvac").setLabel("إنهاء إجازة").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("extend").setLabel("تمديد إجازة").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("absence").setLabel("طلب عذر عدم تواجد").setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {

  // فتح المودال
  if (interaction.isButton() && !interaction.customId.includes("admin")) {

    if (activeRequests.has(interaction.user.id))
      return interaction.reply({ content: "❌ عندك طلب مفتوح بالفعل", ephemeral: true });

    const modal = new ModalBuilder().setCustomId(interaction.customId).setTitle("استبيان الطلب");

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

    fields.forEach((f) => modal.addComponents(new ActionRowBuilder().addComponents(f)));

    await interaction.showModal(modal);
  }

  // إرسال الطلب للإدارة
  if (interaction.isModalSubmit()) {

    activeRequests.set(interaction.user.id, true);

    const reviewChannel = await client.channels.fetch(REVIEW_ROOM);

    const embed = new EmbedBuilder()
      .setTitle("طلب جديد")
      .setDescription(
        Object.values(interaction.fields.fields)
          .map((f) => `**${f.customId}** : ${f.value}`)
          .join("\n")
      )
      .setFooter({ text: `${interaction.user.id}|${interaction.customId}` })
      .setColor("Blue");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("admin_accept").setLabel("قبول").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("admin_reject").setLabel("رفض").setStyle(ButtonStyle.Danger)
    );

    await reviewChannel.send({ embeds: [embed], components: [row] });

    await interaction.reply({ content: "✅ تم إرسال طلبك", ephemeral: true });
  }

  // قبول / رفض الإدارة
  if (interaction.isButton() && interaction.customId.includes("admin")) {

    if (!interaction.member.roles.cache.has(STAFF_ROLE))
      return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

    const embed = interaction.message.embeds[0];
    const [userId, type] = embed.footer.text.split("|");
    const member = await interaction.guild.members.fetch(userId);

    activeRequests.delete(userId);

    if (interaction.customId === "admin_accept") {

      if (type === "vacation") {

        savedRoles.set(userId, member.roles.cache.map(r => r.id));

        await member.roles.set([VACATION_ROLE]);

        const days = parseInt(embed.description.match(/days\*\* : (.*)/)?.[1] || 0);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        member.send(`✅ تم قبول إجازتك
📅 تنتهي بتاريخ: ${endDate.toLocaleDateString()}`);
      }

      if (type === "resign") {
        await member.roles.add(RESIGN_ROLE);
        member.send("✅ تم قبول استقالتك");
      }

      if (type === "endvac") {
        const oldRoles = savedRoles.get(userId);
        if (oldRoles) await member.roles.set(oldRoles);
        member.send("✅ تم إنهاء الإجازة وإرجاع رتبك");
      }

      if (type === "extend") {
        member.send("✅ تم تمديد الإجازة");
      }

      if (type === "absence") {
        member.send("✅ تم قبول عذر عدم التواجد");
      }

      await interaction.reply({ content: "✅ تم القبول", ephemeral: true });
    }

    if (interaction.customId === "admin_reject") {
      member.send("❌ تم رفض طلبك");
      await interaction.reply({ content: "❌ تم الرفض", ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);
