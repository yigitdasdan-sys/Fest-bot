const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionsBitField, 
    ChannelType 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ID Tanımlamaları
const CONFIG = {
    BAN_YETKILISI: "1542872076980068372", // Ban açabilen/özel yetkili
    KOMUT_ROLU: "1542872257276149860", // Komutları kullanabilen rol
    KATEGORI_ID: "1553350045099622420", // Yeni ekip kanallarının açılacağı kategori
    ISLEM_KANALI: "1542872637745799190", // Komutların kullanılabileceği kanal
    LOG_KANALI: "1553350655916384358" // Log kanalı
};

client.once('ready', async () => {
    console.log(`Bot aktif: ${client.user.tag}`);

    // Slash Komutlarını Kaydetme
    const commands = [
        new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Kullanıcıyı banlar veya banını açar')
            .addUserOption(option => option.name('kullanici').setDescription('İşlem yapılacak kişi').setRequired(true))
            .addStringOption(option => option.name('islem').setDescription('ban veya ac').setRequired(true).addChoices(
                { name: 'Banla', value: 'ban' },
                { name: 'Banı Aç', value: 'unban' }
            )),

        new SlashCommandBuilder()
            .setName('ekip-oluştur')
            .setDescription('Yeni bir ekip ve kanallarını oluşturur')
            .addStringOption(option => option.name('ekip_adi').setDescription('Ekibin adı').setRequired(true))
            .addStringOption(option => option.name('renk').setDescription('Rol rengi (Örn: #FF0000)').setRequired(true))
            .addIntegerOption(option => option.name('kisi_sayisi').setDescription('Kişi sınırı').setRequired(true)),

        new SlashCommandBuilder()
            .setName('rolver')
            .setDescription('Birine rol verir')
            .addUserOption(option => option.name('kullanici').setDescription('Rol verilecek kişi').setRequired(true))
            .addRoleOption(option => option.name('rol').setDescription('Verilecek rol').setRequired(true)),

        new SlashCommandBuilder()
            .setName('rolal')
            .setDescription('Birinden rol alır')
            .addUserOption(option => option.name('kullanici').setDescription('Rolü alınacak kişi').setRequired(true))
            .addRoleOption(option => option.name('rol').setDescription('Alınacak rol').setRequired(true))
    ];

    const rest = new REST({ version: '10' }).setToken('BOT_TOKENINIZI_BURAYA_YAZIN');
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash komutları yüklendi.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, channel, guild } = interaction;

    // 1. Kanal Kontrolü
    if (channel.id !== CONFIG.ISLEM_KANALI) {
        return interaction.reply({ content: `Bu komut sadece <#${CONFIG.ISLEM_KANALI}> kanalında kullanılabilir!`, ephemeral: true });
    }

    // 2. Rol Kontrolü (/ekip-oluştur, /rolver, /rolal için)
    if (!member.roles.cache.has(CONFIG.KOMUT_ROLU) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Bu komutları kullanmak için gerekli role sahip değilsin!', ephemeral: true });
    }

    const logKanalet = guild.channels.cache.get(CONFIG.LOG_KANALI);

    // --- BAN KOMUTU ---
    if (commandName === 'ban') {
        const hedefUser = options.getUser('kullanici');
        const islemTuru = options.getString('islem');

        if (islemTuru === 'unban') {
            if (member.id !== CONFIG.BAN_YETKILISI) {
                return interaction.reply({ content: 'Ban açma yetkiniz yok!', ephemeral: true });
            }
            try {
                await guild.members.unban(hedefUser.id);
                interaction.reply({ content: `${hedefUser.tag} adlı kullanıcının banı kaldırıldı.` });
                if (logKanalet) logKanalet.send(`⚠️ **[BAN AÇILDI]** ${member.user.tag} adlı yetkili, ${hedefUser.tag} adlı kullanıcının banını kaldırdı.`);
            } catch (err) {
                interaction.reply({ content: 'Kullanıcının banı açılamadı.', ephemeral: true });
            }
        } else if (islemTuru === 'ban') {
            // Banlama yetkisi kontrolü (Örn: Sadece özel ID banlayabilir veya belirli yetki)
            if (member.id !== CONFIG.BAN_YETKILISI && !member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: 'Bu komutla kimseyi banlayamazsınız!', ephemeral: true });
            }
            try {
                await guild.members.ban(hedefUser);
                interaction.reply({ content: `${hedefUser.tag} başarıyla banlandı.` });
                if (logKanalet) logKanalet.send(`🔨 **[BANLANDI]** ${member.user.tag}, ${hedefUser.tag} kullanıcısını banladı.`);
            } catch (err) {
                interaction.reply({ content: 'Kullanıcı banlanamadı.', ephemeral: true });
            }
        }
    }

    // --- EKİP OLUŞTUR KOMUTU ---
    else if (commandName === 'ekip-oluştur') {
        const ekipAdi = options.getString('ekip_adi');
        const renk = options.getString('renk');
        const kisiSayisi = options.getInteger('kisi_sayisi');

        await interaction.deferReply();

        try {
            // Rol Oluşturma
            const yeniRol = await guild.roles.create({
                name: ekipAdi,
                color: renk,
                reason: `${member.user.tag} tarafından oluşturuldu.`
            });

            // Kategoriye Kanal Açma
            const yeniKanal = await guild.channels.create({
                name: `${ekipAdi}-başvuru`,
                type: ChannelType.GuildText,
                parent: CONFIG.KATEGORI_ID,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: yeniRol.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                    }
                ]
            });

            // Sınırsız Davet Linki Oluşturma
            const davet = await yeniKanal.createInvite({ maxAge: 0, maxUses: 0 });

            interaction.editReply(`✅ Ekip başarıyla oluşturuldu!\nRol: ${yeniRol}\nKanal: ${yeniKanal}\nDavet Linki: ${davet.url}`);
            
            if (logKanalet) {
                logKanalet.send(`📁 **[EKİP OLUŞTURuldu]** ${member.user.tag} tarafından **${ekipAdi}** ekibi kuruldu. (Kişi Sınırı: ${kisiSayisi})`);
            }
        } catch (err) {
            console.error(err);
            interaction.editReply('Ekip oluşturulurken bir hata meydana geldi.');
        }
    }

    // --- ROL VER KOMUTU ---
    else if (commandName === 'rolver') {
        const hedefUye = await guild.members.fetch(options.getUser('kullanici').id);
        const rol = options.getRole('rol');

        // Hiyerarşi Kontrolü
        if (rol.position >= member.roles.highest.position && member.id !== guild.ownerId) {
            return interaction.reply({ content: 'Kendi rol seviyenizden üst veya aynı hiyerarşideki bir rolü başkasına veremezsiniz!', ephemeral: true });
        }

        try {
            await hedefUye.roles.add(rol);
            interaction.reply({ content: `${hedefUye.user.tag} adlı kullanıcımıza ${rol.name} rolü verildi.` });
            if (logKanalet) logKanalet.send(`➕ **[ROL VERİLDİ]** ${member.user.tag}, ${hedefUye.user.tag} adlı kullanıcıya ${rol.name} rolünü verdi.`);
        } catch (err) {
            interaction.reply({ content: 'Rol verilirken bir hata oluştu (Botun yetkisi yetersiz olabilir).', ephemeral: true });
        }
    }

    // --- ROL AL KOMUTU ---
    else if (commandName === 'rolal') {
        const hedefUye = await guild.members.fetch(options.getUser('kullanici').id);
        const rol = options.getRole('rol');

        // Hiyerarşi Kontrolü
        if (rol.position >= member.roles.highest.position && member.id !== guild.ownerId) {
            return interaction.reply({ content: 'Kendi rol seviyenizden üst veya aynı hiyerarşideki bir rolü başkasından alamazsınız!', ephemeral: true });
        }

        try {
            await hedefUye.roles.remove(rol);
            interaction.reply({ content: `${hedefUye.user.tag} adlı kullanıcıdan ${rol.name} rolü alındı.` });
            if (logKanalet) logKanalet.send(`➖ **[ROL ALINDI]** ${member.user.tag}, ${hedefUye.user.tag} adlı kullanıcıdan ${rol.name} rolünü aldı.`);
        } catch (err) {
            interaction.reply({ content: 'Rol alınırken bir hata oluştu.', ephemeral: true });
        }
    }
});

client.login('BOT_TOKENINIZI_BURAYA_YAZIN');
