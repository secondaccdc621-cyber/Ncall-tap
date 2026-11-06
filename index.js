/**
 * Night Call Tap - Temporary Voice + Music Bots Panel
 * ----------------------------------------------------
 * Setup:
 *   npm i discord.js@latest        (needs >= 14.21)
 *   set env vars:  DISCORD_TOKEN, JOIN_CHANNEL_ID   (or edit the constants below)
 *   node index.js
 *
 * Enable in the Developer Portal: SERVER MEMBERS INTENT + MESSAGE CONTENT INTENT
 * Bot permissions: Manage Channels, Manage Roles, Move Members, Connect, View Channel,
 *                  Send Messages, Set Voice Channel Status, Use External Emojis
 */

const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(); } catch { /* no .env file, using host env vars */ }
const {
  Client, GatewayIntentBits, AttachmentBuilder, Events, ChannelType, PermissionFlagsBits, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

// ======================= CONFIG =======================
const TOKEN = process.env.DISCORD_TOKEN || 'PUT_TOKEN_HERE';
const JOIN_CHANNEL_ID = process.env.JOIN_CHANNEL_ID || '1563004098545188894';
const PREFIX = '.v';
const MUSIC_CHANNEL_ID = '1535289109491486760';
const BANNER_PATH = path.join(__dirname, 'banner.png'); // banner image next to index.js
const bannerFile = () => new AttachmentBuilder(BANNER_PATH, { name: 'banner.png' });
const PROTECTED_ROLES = ['1530939206916898858', '1562990457389318274', '1522975852877320202'];
const DELETE_DELAY_MS = 3000;
const MUSIC_REFRESH_MS = 60 * 1000;

const COLORS = { cerise: 0xDE3163, green: 0x2ECC71, red: 0xE74C3C };
const E = { ok: '<:emoji_38:1561367011710206113>', fail: '<:emoji_37:1561365765607792750>' };

const MUSIC_BOTS = [
  { id: '749248172756303913', prefix: '3play' },
  { id: '1000017115388067850', prefix: 'M!play' },
  { id: '911040188325691413', prefix: 'R!play' },
  { id: '569556431347384340', prefix: 'B!play' },
  { id: '1145363441524166758', prefix: 'T!play' },
  { id: '820305671017988136', prefix: 'Z!play' },
  { id: '451379187031343104', prefix: '?play' },
  { id: '1407024614810320976', prefix: '>play' },
  { id: '684773505157431347', prefix: '&play' },
  { id: '1021732722479202304', prefix: 'H!play' },
];

// Buttons (order = panel layout, 5 per row)
const BTN = [
  { key: 'rename', emoji: '<:Rename:1549942316058550344>', desc: 'Rename voice channel', cmd: `${PREFIX} name <new name>, ${PREFIX} rename <new name>` },
  { key: 'lock', emoji: '<:lock:1562972311001501739>', desc: 'Lock the voice channel', cmd: `${PREFIX} lock` },
  { key: 'unlock', emoji: '<:unlock:1562971242624192572>', desc: 'Unlock the voice channel', cmd: `${PREFIX} unlock` },
  { key: 'hide', emoji: '<:hide:1558914476382756864>', desc: 'Hide your vc from everyone', cmd: `${PREFIX} hide, ${PREFIX} hide <user>` },
  { key: 'unhide', emoji: '<:unhide:1558914489406066778>', desc: 'Unhide your vc', cmd: `${PREFIX} unhide, ${PREFIX} unhide <user>` },
  { key: 'limit', emoji: '<:c_user2:1549945837499453461>', desc: 'Set user limit', cmd: `${PREFIX} limit <number>` },
  { key: 'permit', emoji: '<:b_Icon_Member_Friends:1549942219765715135>', desc: 'Permit a member to your vc', cmd: `${PREFIX} permit <user>` },
  { key: 'reject', emoji: '<:Icon_Member_Kick:1549942110122147881>', desc: 'Reject a member from your vc', cmd: `${PREFIX} reject <user>` },
  { key: 'status', emoji: '<:status:1549943539486433330>', desc: 'Set vc status', cmd: `${PREFIX} status <text>` },
  { key: 'soundboards', emoji: '<:Icon_Soundboard:1549946122280239137>', desc: 'Enable/Disable soundboards', cmd: `${PREFIX} soundboards on/off` },
  { key: 'streaming', emoji: '<:videoiconncall:1558487485460258829>', desc: 'Enable/Disable streaming', cmd: `${PREFIX} streaming on/off` },
  { key: 'activities', emoji: '<:activities:1562934243133366292>', desc: 'Enable/Disable activities', cmd: `${PREFIX} activities on/off` },
  { key: 'manager', emoji: '<:addmanager:1562933002156376177>', desc: 'Add/Remove a manager', cmd: `${PREFIX} man add <user>, ${PREFIX} man remove <user>` },
  { key: 'claim', emoji: '<:claim:1562971140564197436>', desc: 'Claim the vc (when the owner left)', cmd: `${PREFIX} claim` },
  { key: 'help', emoji: '<:ncallinfoicon:1558487473737175120>', desc: 'Buttons and commands info', cmd: `${PREFIX} help` },
];

const TOG = {
  soundboards: { label: 'Soundboards', single: 'Soundboard', verb: 'have', perms: ['UseSoundboard', 'UseExternalSounds'], emoji: '🔊' },
  streaming: { label: 'Streaming', single: 'Streaming', verb: 'has', perms: ['Stream'], emoji: '🎥' },
  activities: { label: 'Activities', single: 'Activity', verb: 'have', perms: ['UseEmbeddedActivities'], emoji: '🎮' },
};

// ======================= STATE =======================
const DATA_FILE = './data.json';
const temps = new Map(); // channelId -> { owner, managers:Set, renames:[], status }
let musicPanel = null;   // { channelId, messageId }
let interfacePanel = null; // { channelId, messageId }
const creating = new Set();

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const [id, e] of d.channels || []) temps.set(id, { owner: e.owner, managers: new Set(e.managers || []), renames: [], status: e.status || '' });
    musicPanel = d.musicPanel || null;
    interfacePanel = d.interfacePanel || null;
  } catch { /* first run */ }
}
function save() {
  const channels = [...temps].map(([id, e]) => [id, { owner: e.owner, managers: [...e.managers], status: e.status }]);
  fs.writeFileSync(DATA_FILE, JSON.stringify({ channels, musicPanel, interfacePanel }, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
  ],
});

// ======================= HELPERS =======================
class Warn extends Error {}

const sep = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const txt = (c) => new TextDisplayBuilder().setContent(c);
const successC = (text) => new ContainerBuilder().setAccentColor(COLORS.green)
  .addTextDisplayComponents(txt(`# ${E.ok} Done`)).addSeparatorComponents(sep()).addTextDisplayComponents(txt(text));
const warnC = (text) => new ContainerBuilder().setAccentColor(COLORS.red)
  .addTextDisplayComponents(txt(`# ${E.fail} Warning`)).addSeparatorComponents(sep()).addTextDisplayComponents(txt(`*${text}*`));

function parseEmoji(s) {
  const m = s.match(/^<(a?):(\w+):(\d+)>$/);
  return { id: m[3], name: m[2], animated: !!m[1] };
}

async function send(src, container) {
  const opts = { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
  if (typeof src.isRepliable === 'function') {
    opts.flags |= MessageFlags.Ephemeral;
    return (src.replied || src.deferred) ? src.followUp(opts) : src.reply(opts);
  }
  const msg = await src.reply({ ...opts, allowedMentions: { parse: [], repliedUser: false } });
  setTimeout(() => msg.delete().catch(() => {}), 15000);
}

const canManage = (entry, id) => entry.owner === id || entry.managers.has(id);

function getCtx(member, manage = true) {
  const vc = member.voice?.channel;
  const entry = vc && temps.get(vc.id);
  if (!entry) throw new Warn(`You need to join <#${JOIN_CHANNEL_ID}> to use this cmd.`);
  if (manage && !canManage(entry, member.id)) {
    throw new Warn('Only the **owner** or a **manager** of this **Voice Channel** can use this.');
  }
  return { guild: member.guild, member, vc, entry };
}

async function resolveMember(guild, str) {
  const id = str?.match(/\d{15,20}/)?.[0];
  return id ? guild.members.fetch(id).catch(() => null) : null;
}
const needTarget = (t) => { if (!t) throw new Warn('Please mention a **member** or provide a valid **user id**.'); return t; };
const parseOnOff = (s, name) => {
  const v = (s || '').toLowerCase();
  if (['on', 'enable', 'enabled', 'true'].includes(v)) return true;
  if (['off', 'disable', 'disabled', 'false'].includes(v)) return false;
  throw new Warn(`Usage: \`${PREFIX} ${name} on\` or \`${PREFIX} ${name} off\``);
};

// ======================= PANEL / HELP / INFO =======================
function buildPanel() {
  const c = new ContainerBuilder().setAccentColor(COLORS.cerise)
    .addTextDisplayComponents(txt(`# Night Call Tap\n> **For Music:** <#${MUSIC_CHANNEL_ID}>\n> **Prefix:** ${PREFIX}`))
    .addSeparatorComponents(sep())
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://banner.png')))
    .addSeparatorComponents(sep());
  for (let i = 0; i < BTN.length; i += 5) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      BTN.slice(i, i + 5).map((b) => new ButtonBuilder().setCustomId(`vc:${b.key}`).setStyle(ButtonStyle.Secondary).setEmoji(parseEmoji(b.emoji))),
    ));
  }
  return c;
}

function buildHelp() {
  const lines = BTN.map((b) => `${b.emoji} **${b.desc}**\n\`${b.cmd}\``).join('\n\n');
  return new ContainerBuilder().setAccentColor(COLORS.cerise)
    .addTextDisplayComponents(txt('# Buttons & Commands'))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(lines))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(`**Extra commands**\n\`${PREFIX} info\` - voice channel info (anyone in the vc)\n\`${PREFIX} panel\` - send the control panel\n\n-# You must be in your temp voice to use these. Only the owner and managers can control it.`));
}

function buildInfo({ vc, guild, entry }) {
  const ev = vc.permissionOverwrites.cache.get(guild.id);
  const denied = (f) => ev?.deny.has(PermissionFlagsBits[f]);
  const state = (f) => (denied(f) ? `${E.fail} Disabled` : `${E.ok} Enabled`);
  const managers = entry.managers.size ? [...entry.managers].map((id) => `<@${id}>`).join(', ') : 'None';
  const body = [
    `**Name:** ${vc.name}`,
    `**Members:** ${vc.members.size}/${vc.userLimit || '∞'}`,
    `**Region:** ${vc.rtcRegion || 'Automatic'}`,
    `**Bitrate:** ${Math.round(vc.bitrate / 1000)}kbps`,
    `**Owner:** <@${entry.owner}>`,
    `**Managers:** ${managers}`,
    `**Status:** ${entry.status || 'None'}`,
    '',
    `**Locked:** ${denied('Connect') ? '🔒 Yes' : '🔓 No'}`,
    `**Hidden:** ${denied('ViewChannel') ? 'Yes' : 'No'}`,
    `**Soundboards:** ${state('UseSoundboard')}`,
    `**Streaming:** ${state('Stream')}`,
    `**Activities:** ${state('UseEmbeddedActivities')}`,
    '',
    `**Created:** <t:${Math.floor(vc.createdTimestamp / 1000)}:R>`,
  ].join('\n');
  return new ContainerBuilder().setAccentColor(COLORS.cerise)
    .addTextDisplayComponents(txt('# Voice Channel Info')).addSeparatorComponents(sep()).addTextDisplayComponents(txt(body));
}

// ======================= ACTIONS =======================
const A = {
  async rename(c, name) {
    name = (name || '').trim();
    if (!name) throw new Warn('Please provide a **new name** for the voice channel.');
    if (name.length > 100) throw new Warn('The name can\'t be longer than **100** characters.');
    const now = Date.now();
    c.entry.renames = (c.entry.renames || []).filter((t) => now - t < 10 * 60 * 1000);
    if (c.entry.renames.length >= 2) {
      const wait = Math.ceil((10 * 60 * 1000 - (now - c.entry.renames[0])) / 1000);
      throw new Warn(`Discord only allows **2** renames per **10 minutes**. Try again in **${wait}s**.`);
    }
    c.entry.renames.push(now);
    await c.vc.setName(name, `Renamed by ${c.member.user.tag}`);
    return `Your **Voice Channel** has been renamed to **${name}**.`;
  },

  async lock(c) {
    await c.vc.permissionOverwrites.edit(c.guild.roles.everyone, { Connect: false });
    return 'Your **Voice Channel** has been **Locked**.';
  },
  async unlock(c) {
    await c.vc.permissionOverwrites.edit(c.guild.roles.everyone, { Connect: null });
    return 'Your **Voice Channel** has been **Unlocked**.';
  },

  async limit(c, n) {
    const num = Number(n);
    if (!Number.isInteger(num) || num < 0 || num > 99) throw new Warn('The limit must be a number between **0** and **99** (0 = unlimited).');
    await c.vc.setUserLimit(num);
    return `User limit has been set to **${num || 'Unlimited'}**.`;
  },

  async permit(c, t) {
    needTarget(t);
    await c.vc.permissionOverwrites.edit(t.id, { ViewChannel: true, Connect: true });
    return `${t} has been **permitted** to join your **Voice Channel**.`;
  },

  async reject(c, t) {
    needTarget(t);
    if (t.id === c.entry.owner) throw new Warn('You can\'t **reject** the owner of the voice channel.');
    if (t.id === c.member.id) throw new Warn('You can\'t **reject** yourself.');
    if (t.roles.cache.some((r) => PROTECTED_ROLES.includes(r.id))) throw new Warn(`${t} has a **protected role** and can't be rejected.`);
    if (c.entry.managers.has(t.id) && c.member.id !== c.entry.owner) throw new Warn('Only the **owner** can reject a **manager**.');
    await c.vc.permissionOverwrites.edit(t.id, { Connect: false });
    if (c.entry.managers.delete(t.id)) save();
    if (t.voice.channelId === c.vc.id) await t.voice.disconnect('Rejected from temp voice').catch(() => {});
    return `${t} has been **rejected** from your **Voice Channel**.`;
  },

  async status(c, text) {
    text = (text || '').trim();
    if (text.length > 500) throw new Warn('The status can\'t be longer than **500** characters.');
    await client.rest.put(`/channels/${c.vc.id}/voice-status`, { body: { status: text } });
    c.entry.status = text; save();
    return text ? `Voice channel status has been set to **${text}**.` : 'Voice channel status has been **cleared**.';
  },

  async toggle(c, what, on) {
    const T = TOG[what];
    const perms = Object.fromEntries(T.perms.map((p) => [p, on]));
    await c.vc.permissionOverwrites.edit(c.guild.roles.everyone, perms);
    return `${T.label} ${T.verb} been **${on ? 'Enabled' : 'Disabled'}** in your **Voice Channel**.`;
  },

  async manAdd(c, t) {
    needTarget(t);
    if (t.id === c.entry.owner) throw new Warn('The owner is already above managers.');
    if (t.user.bot) throw new Warn('You can\'t add a **bot** as a manager.');
    if (c.entry.managers.has(t.id)) throw new Warn(`${t} is already a **manager**.`);
    c.entry.managers.add(t.id); save();
    await c.vc.permissionOverwrites.edit(t.id, { ViewChannel: true, Connect: true });
    return `${t} is now a **manager** of your **Voice Channel**.`;
  },
  async manRemove(c, t) {
    needTarget(t);
    if (!c.entry.managers.has(t.id)) throw new Warn(`${t} is not a **manager**.`);
    c.entry.managers.delete(t.id); save();
    await c.vc.permissionOverwrites.edit(t.id, { ViewChannel: null, Connect: null });
    return `${t} is no longer a **manager** of your **Voice Channel**.`;
  },

  async hide(c, t) {
    if (!t) {
      await c.vc.permissionOverwrites.edit(c.guild.roles.everyone, { ViewChannel: false });
      return 'Your **Voice Channel** is now **Hidden** from everyone.';
    }
    if (t.id === c.entry.owner) throw new Warn('You can\'t hide the channel from the **owner**.');
    await c.vc.permissionOverwrites.edit(t.id, { ViewChannel: false });
    return `Your **Voice Channel** is now **Hidden** from ${t}.`;
  },
  async unhide(c, t) {
    if (!t) {
      await c.vc.permissionOverwrites.edit(c.guild.roles.everyone, { ViewChannel: null });
      return 'Your **Voice Channel** is now **Visible** to everyone.';
    }
    await c.vc.permissionOverwrites.edit(t.id, { ViewChannel: null });
    return `Your **Voice Channel** is now **Visible** to ${t}.`;
  },

  async claim(c) {
    if (c.entry.owner === c.member.id) throw new Warn('You are already the **owner** of this voice channel.');
    if (c.vc.members.has(c.entry.owner)) throw new Warn('The **owner** is still in the voice channel, you can\'t claim it.');
    const old = c.entry.owner;
    c.entry.managers.delete(c.member.id);
    c.entry.owner = c.member.id; save();
    await c.vc.permissionOverwrites.edit(old, { ViewChannel: null, Connect: null, Speak: null }).catch(() => {});
    await c.vc.permissionOverwrites.edit(c.member.id, { ViewChannel: true, Connect: true, Speak: true });
    return 'You are now the **owner** of this **Voice Channel**.';
  },
};

// ======================= PREFIX COMMANDS =======================
async function runCommand(message, args) {
  const m = message.member;
  const g = message.guild;
  const sub = (args.shift() || '').toLowerCase();
  const target = async () => needTarget(await resolveMember(g, args[0]));

  switch (sub) {
    case 'name': case 'rename': return A.rename(getCtx(m), args.join(' '));
    case 'lock': return A.lock(getCtx(m));
    case 'unlock': return A.unlock(getCtx(m));
    case 'limit': return A.limit(getCtx(m), args[0]);
    case 'permit': { const c = getCtx(m); return A.permit(c, await target()); }
    case 'reject': { const c = getCtx(m); return A.reject(c, await target()); }
    case 'status': return A.status(getCtx(m), args.join(' '));
    case 'soundboards': case 'soundboard': { const c = getCtx(m); return A.toggle(c, 'soundboards', parseOnOff(args[0], 'soundboards')); }
    case 'streaming': case 'stream': { const c = getCtx(m); return A.toggle(c, 'streaming', parseOnOff(args[0], 'streaming')); }
    case 'activities': case 'activity': { const c = getCtx(m); return A.toggle(c, 'activities', parseOnOff(args[0], 'activities')); }
    case 'man': case 'manager': {
      const c = getCtx(m);
      const act = (args.shift() || '').toLowerCase();
      if (!['add', 'remove'].includes(act)) throw new Warn(`Usage: \`${PREFIX} man add <user>\` or \`${PREFIX} man remove <user>\``);
      const t = await target();
      return act === 'add' ? A.manAdd(c, t) : A.manRemove(c, t);
    }
    case 'hide': case 'unhide': {
      const c = getCtx(m);
      let t = null;
      if (args[0]) t = await target();
      return A[sub](c, t);
    }
    case 'claim': return A.claim(getCtx(m, false));
    case 'info': return buildInfo(getCtx(m, false));
    case 'panel': {
      getCtx(m);
      await message.channel.send({ components: [buildPanel()], files: [bannerFile()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
      return null;
    }
    case 'interface': {
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) throw new Warn('This command is only for **Admins**.');
      const id = args[0]?.match(/\d{15,20}/)?.[0];
      const target = id && g.channels.cache.get(id);
      if (!target || !target.isTextBased() || target.isVoiceBased()) throw new Warn(`Usage: \`${PREFIX} interface #channel\``);
      if (interfacePanel) {
        const old = await client.channels.fetch(interfacePanel.channelId).catch(() => null);
        const om = await old?.messages?.fetch(interfacePanel.messageId).catch(() => null);
        await om?.delete().catch(() => {});
      }
      const sent = await target.send({
        components: [buildPanel()], files: [bannerFile()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
      }).catch(() => { throw new Warn(`I can't send messages in ${target}. Check my permissions there.`); });
      interfacePanel = { channelId: sent.channelId, messageId: sent.id }; save();
      return `The **interface panel** has been sent to ${target}.`;
    }
    case 'music': {
      if ((args[0] || '').toLowerCase() !== 'panel') return buildHelp();
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) throw new Warn('This command is only for **Admins**.');
      if (musicPanel) {
        const old = await client.channels.fetch(musicPanel.channelId).catch(() => null);
        const om = await old?.messages?.fetch(musicPanel.messageId).catch(() => null);
        await om?.delete().catch(() => {});
      }
      const sent = await message.channel.send({
        components: [await buildMusicPanel(g)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
      });
      musicPanel = { channelId: sent.channelId, messageId: sent.id }; save();
      message.delete().catch(() => {});
      return null;
    }
    default: return buildHelp();
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot || !message.member) return;
  if (!/^\.v(\s|$)/i.test(message.content)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
  try {
    const out = await runCommand(message, args);
    if (out === null || out === undefined) return;
    await send(message, typeof out === 'string' ? successC(out) : out);
  } catch (e) {
    if (e instanceof Warn) return send(message, warnC(e.message)).catch(() => {});
    console.error(e);
    send(message, warnC('Something went wrong, please try again.')).catch(() => {});
  }
});

// ======================= INTERACTIONS =======================
const modalFor = (id, title, label, { max = 100, required = true, value, placeholder } = {}) => {
  const input = new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short)
    .setRequired(required).setMaxLength(max);
  if (value) input.setValue(value.slice(0, max));
  if (placeholder) input.setPlaceholder(placeholder);
  return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
};

const userMenu = (id, placeholder) => new ActionRowBuilder().addComponents(
  new UserSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1));

const toggleMenu = (what) => {
  const T = TOG[what];
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`vc:sel:${what}`).setPlaceholder(`Enable or Disable ${T.single}`)
    .addOptions(
      { label: `Enable ${T.single}`, description: `Enable ${T.label}`, value: 'on', emoji: T.emoji },
      { label: `Disable ${T.single}`, description: `Disable ${T.label}`, value: 'off', emoji: '🚫' },
    ));
};

const ephemeral = { flags: MessageFlags.Ephemeral };

async function handleButton(i) {
  if (i.customId === 'music:get') return getMusicBot(i);
  const key = i.customId.slice(3);
  if (key === 'help') return send(i, buildHelp());

  const m = i.member;
  switch (key) {
    case 'lock': case 'unlock': case 'hide': case 'unhide':
      return send(i, successC(await A[key](getCtx(m))));
    case 'claim':
      return send(i, successC(await A.claim(getCtx(m, false))));
    case 'rename': {
      const c = getCtx(m);
      return i.showModal(modalFor('vc:modal:rename', 'Rename Voice Channel', 'New channel name', { value: c.vc.name }));
    }
    case 'limit':
      getCtx(m);
      return i.showModal(modalFor('vc:modal:limit', 'Set User Limit', 'Limit (0 = unlimited)', { max: 2, placeholder: '0 - 99' }));
    case 'status':
      getCtx(m);
      return i.showModal(modalFor('vc:modal:status', 'Set Voice Status', 'Status (empty = clear)', { max: 500, required: false }));
    case 'permit':
      getCtx(m);
      return i.reply({ ...ephemeral, components: [userMenu('vc:usel:permit', 'Select a member to permit')] });
    case 'reject':
      getCtx(m);
      return i.reply({ ...ephemeral, components: [userMenu('vc:usel:reject', 'Select a member to reject')] });
    case 'manager':
      getCtx(m);
      return i.reply({
        ...ephemeral,
        components: [userMenu('vc:usel:manadd', 'Select a member to add as manager'), userMenu('vc:usel:manremove', 'Select a manager to remove')],
      });
    case 'soundboards': case 'streaming': case 'activities':
      getCtx(m);
      return i.reply({ ...ephemeral, components: [toggleMenu(key)] });
  }
}

async function handleModal(i) {
  const c = getCtx(i.member);
  const v = i.fields.getTextInputValue('value');
  const act = i.customId.split(':')[2];
  return send(i, successC(await A[act](c, v)));
}

async function handleStringSelect(i) {
  const what = i.customId.split(':')[2];
  if (!TOG[what]) return;
  const c = getCtx(i.member);
  return send(i, successC(await A.toggle(c, what, i.values[0] === 'on')));
}

async function handleUserSelect(i) {
  const act = i.customId.split(':')[2];
  const c = getCtx(i.member);
  const t = await i.guild.members.fetch(i.values[0]).catch(() => null);
  const fn = { permit: A.permit, reject: A.reject, manadd: A.manAdd, manremove: A.manRemove }[act];
  return send(i, successC(await fn(c, t)));
}

client.on(Events.InteractionCreate, async (i) => {
  if (!i.guild) return;
  try {
    if (i.isButton()) return await handleButton(i);
    if (i.isModalSubmit() && i.customId.startsWith('vc:')) return await handleModal(i);
    if (i.isStringSelectMenu() && i.customId.startsWith('vc:')) return await handleStringSelect(i);
    if (i.isUserSelectMenu() && i.customId.startsWith('vc:')) return await handleUserSelect(i);
  } catch (e) {
    if (e instanceof Warn) return send(i, warnC(e.message)).catch(() => {});
    console.error(e);
    send(i, warnC('Something went wrong, please try again.')).catch(() => {});
  }
});

// ======================= TEMP VOICE LIFECYCLE =======================
async function createTemp(member) {
  if (creating.has(member.id)) return;
  creating.add(member.id);
  let vc;
  try {
    const join = member.guild.channels.cache.get(JOIN_CHANNEL_ID);
    vc = await member.guild.channels.create({
      name: `${member.displayName}'s Voice`.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent: join?.parentId ?? null,
      reason: `Temp voice for ${member.user.tag}`,
    });
    await vc.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: true, Speak: true });
    temps.set(vc.id, { owner: member.id, managers: new Set(), renames: [], status: '' });
    save();
    await member.voice.setChannel(vc);
    await vc.send({ components: [buildPanel()], files: [bannerFile()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => {});
  } catch (e) {
    console.error('createTemp failed:', e.message);
    if (vc) { temps.delete(vc.id); save(); vc.delete().catch(() => {}); }
  } finally {
    creating.delete(member.id);
  }
}

function scheduleDelete(channelId) {
  setTimeout(async () => {
    const ch = client.channels.cache.get(channelId);
    if (!ch || !temps.has(channelId) || ch.members.size > 0) return;
    temps.delete(channelId); save();
    await ch.delete('Temp voice is empty').catch(() => {});
  }, DELETE_DELAY_MS);
}

client.on(Events.VoiceStateUpdate, (oldS, newS) => {
  if (oldS.channelId === newS.channelId) return;
  if (newS.channelId === JOIN_CHANNEL_ID && newS.member) createTemp(newS.member);
  if (oldS.channelId && temps.has(oldS.channelId)) scheduleDelete(oldS.channelId);
});

client.on(Events.ChannelDelete, (ch) => { if (temps.delete(ch.id)) save(); });

// ======================= MUSIC BOTS PANEL =======================
const UNIQUE_BOT_IDS = [...new Set(MUSIC_BOTS.map((b) => b.id))];

async function musicState(guild) {
  const members = await guild.members.fetch({ user: UNIQUE_BOT_IDS }).catch(() => null);
  const available = [], idle = [], busy = [];
  for (const id of UNIQUE_BOT_IDS) {
    if (!members?.has(id)) continue;
    const vc = guild.voiceStates.cache.get(id)?.channel;
    if (!vc) { available.push({ id }); continue; }
    const humans = vc.members.filter((x) => !x.user.bot).size;
    (humans > 0 ? busy : idle).push({ id, vc });
  }
  return { available, idle, busy };
}

async function buildMusicPanel(guild) {
  const { available, idle, busy } = await musicState(guild);
  const list = (arr, withCh) => (arr.length ? '\n' + arr.map((b) => `<@${b.id}>${withCh ? ` → <#${b.vc.id}>` : ''}`).join('\n') : '');
  const body = [
    '### 🎵 Music Bots Status',
    `🟢 **Available Bots:** ${available.length}${list(available)}`,
    `🟡 **Idle Bots (alone in a voice):** ${idle.length}${list(idle, true)}`,
    `🔴 **Busy Bots:** ${busy.length}${list(busy, true)}`,
  ].join('\n');
  const section = new SectionBuilder().addTextDisplayComponents(txt(body))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ extension: 'png', size: 256 })));
  return new ContainerBuilder().setAccentColor(COLORS.cerise)
    .addSectionComponents(section)
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(`Click **Get Disponible Bot** to get a ready music bot\n-# Updated <t:${Math.floor(Date.now() / 1000)}:R>`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music:get').setStyle(ButtonStyle.Secondary).setLabel('Get Disponible Bot').setEmoji('🎧')));
}

async function getMusicBot(i) {
  const { available, idle } = await musicState(i.guild);
  const pool = available.length ? available : idle;
  if (!pool.length) throw new Warn('No music bot is **available** right now, please try again later.');
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const prefix = MUSIC_BOTS.find((b) => b.id === pick.id).prefix;

  const botUser = await client.users.fetch(pick.id).catch(() => null);
  const thumb = botUser?.displayAvatarURL({ extension: 'png', size: 256 });
  const head = txt(`## __Here's your music bot__\n<@${pick.id}>`);
  const c = new ContainerBuilder().setAccentColor(COLORS.cerise)
    .addTextDisplayComponents(txt('# Your Music Bot Is Ready!')).addSeparatorComponents(sep());
  if (thumb) c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(head).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)));
  else c.addTextDisplayComponents(head);
  c.addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(`**Join a voice channel and type:** \`${prefix}\` \`<song name> by <artist name>\``));
  return send(i, c);
}

async function refreshMusicPanel() {
  if (!musicPanel) return;
  try {
    const ch = await client.channels.fetch(musicPanel.channelId);
    const msg = await ch.messages.fetch(musicPanel.messageId);
    await msg.edit({ components: [await buildMusicPanel(ch.guild)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch (e) {
    if (e.code === 10003 || e.code === 10008) { musicPanel = null; save(); }
    else console.error('music panel refresh failed:', e.message);
  }
}

// ======================= READY =======================
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [id] of [...temps]) {
    const ch = await client.channels.fetch(id).catch(() => null);
    if (!ch) { temps.delete(id); continue; }
    if (ch.members.size === 0) { temps.delete(id); await ch.delete('Temp voice is empty').catch(() => {}); }
  }
  save();
  refreshMusicPanel();
  setInterval(refreshMusicPanel, MUSIC_REFRESH_MS);
});

load();
client.login(TOKEN);
