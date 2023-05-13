import { TurndownService } from "./module/TurndownService.js";
import { RW_PERMISSIONS, registerSettings } from "./module/settings.js";

class ChatTab {
	constructor({ id, name, messageTypes = {}, permissions = {} }) {
		this.id = id;
		this.name = name;
		this.messageTypes = this.createMessageTypes(messageTypes);
		this.permissions = {
			roles: this.createRolePermissions(permissions.roles),
			users: this.createUserPermissions(permissions.users),
		};
	}

	createMessageTypes(messageTypes = {}) {
		return mergeObject(
			Object.keys(CONST.CHAT_MESSAGE_TYPES).reduce((acc, key) => {
				acc[key] = false;
				return acc;
			}, {}),
			messageTypes
		);
	}
	createRolePermissions(roles = {}) {
		return mergeObject(
			Object.assign(
				...Object.keys(CONST.USER_ROLES)
					.filter((key) => key !== "NONE" && key !== "GAMEMASTER")
					.map((key) => ({
						[key]: key === "PLAYER" ? RW_PERMISSIONS.READ_WRITE : RW_PERMISSIONS.EMPTY,
					}))
			),
			roles
		);
	}
	createUserPermissions(users = {}) {
		return mergeObject(
			Object.assign(
				Array.from(game.users.keys())
					.filter((key) => game.users.get(key).role !== CONST.USER_ROLES.GAMEMASTER)
					.reduce(
						(acc, value) => ({
							...acc,
							[value]: RW_PERMISSIONS.EMPTY,
						}),
						{}
					)
			),
			users
		);
	}

	getUserPermission() {
		const userId = game.userId;
		let role = game.users.get(userId).role;
		if (role === 4) return 2;
		if (this.permissions.users[userId] !== -1) return this.permissions.users[userId];
		let rolePerms = -1;
		for (role; role > 0; role--) {
			const roleName = CONST.USER_ROLE_NAMES[role];
			if (this.permissions.roles[roleName] > 0) {
				rolePerms = this.permissions.roles[roleName];
				break;
			}
		}
		return rolePerms;
	}

	canUserWrite() {
		return this.getUserPermission() > 1;
	}

	isTabVisible() {
		return this.getUserPermission() > 0;
	}

	/**
	 * Returns if the message type is visible on the tab.
	 * @param {Number} messageType
	 * @returns {Boolean}
	 */
	isMessageTypeVisible(messageType) {
		const type = invertObject(CONST.CHAT_MESSAGE_TYPES)[messageType];
		return this.messageTypes[type];
	}

	/**
	 * Returns if the message is visible on the tab.
	 * @param {Object} message
	 * @returns {Boolean}
	 */
	isMessageVisible(message) {
		const messageType = message.data.type;
		if (!this.isMessageTypeVisible(messageType)) return false;
		if (
			message.data.speaker.scene &&
			game.settings.get("tabbed-chatlog", "perScene") &&
			(messageType == CONST.CHAT_MESSAGE_TYPES.IC || messageType == CONST.CHAT_MESSAGE_TYPES.EMOTE) &&
			message.data.speaker.scene != game.user.viewedScene
		) {
			return false;
		}
		if (
			game.settings.get("tabbed-chatlog", "tabExclusive") &&
			message.flags["tabbed-chatlog"]?.tabExclusive &&
			game.tabbedchat.currentTab.id !== message.flags["tabbed-chatlog"]?.tabExclusive
		)
			return false;
		if (message.data.blind && message.data.whisper.find((element) => element == game.userId) == undefined) return false;
		return true;
	}

	setNotification() {
		const nTabs = $("nav.tabbedchatlog.tabs > a.item").length;
		$(`#${this.id}Notification`).css({ display: "" });
	}

	get html() {
		if (!this.isTabVisible()) return "";
		return `
		<a class="item ${this.id}" data-tab="${this.id}">
			${this.name}
			<i id="${this.id}Notification" class="notification-pip fas fa-exclamation-circle" style="display: none;"></i>
		</a>`;
	}
}

class TabbedChatlog {
	constructor(tabs) {
		this.tabs = tabs;
		this._currentTab = tabs[0];
	}
	turndown = new TurndownService();

	chatTab = ChatTab;

	get currentTab() {
		return this._currentTab;
	}
	set currentTab(tab) {
		if (this._currentTab) this._currentTab.active = false;
		if (typeof tab === "string") tab = this.tabs.find((key) => key.id === tab);
		else if (typeof tab === "number") tab = this.tabs[tab];
		tab.active = true;
		$(`#${tab.id}Notification`).css({ display: "none" });
		this._currentTab = tab;
	}

	bindHTML(html) {
		this.tabsController = new TabsV2({
			navSelector: ".tabs",
			contentSelector: ".content",
			initial: "ic",
			callback: (event, html, tabName) => {
				this.currentTab = tabName;

				const setVisibility = (selector, messageType) => {
					const visible = this.currentTab.isMessageTypeVisible(messageType);
					const tabExclusive = game.settings.get("tabbed-chatlog", "tabExclusive");
					if ([CONST.CHAT_MESSAGE_TYPES.IC, CONST.CHAT_MESSAGE_TYPES.EMOTE, CONST.CHAT_MESSAGE_TYPES.ROLL].includes(messageType)) {
						// selector.filter(".scenespecific").css({ display: "none" });
						// selector.not(".scenespecific").css({ display: visible ? "" : "none" });
						// selector.filter(".scene" + game.user.viewedScene).css({ display: visible ? "" : "none" });
						selector.filter(`[data-tc-scene]`).css({ display: "none" });
						selector.filter(`[data-tc-scene="${game.user.viewedScene}"]`).css({ display: visible ? "" : "none" });
						selector.filter(`[data-tc-tab]`).css({ display: tabExclusive ? "none" : "" });
						selector.filter(`[data-tc-tab=${this.currentTab.id}]`).css({ display: visible ? "" : "none" });
						if (messageType === CONST.CHAT_MESSAGE_TYPES.ROLL) {
							selector.filter(".gm-roll-hidden").attr("hidden", true);
						}
						return;
					}
					// OTHER, OOC, WHISPER
					selector.css({ display: visible ? "" : "none" });
				};

				Object.values(CONST.CHAT_MESSAGE_TYPES).forEach((value) => {
					// const selector = $(`.tabbed-chatlog${value}`);
					const selector = $(`[data-tc-type=${value}]`);
					if (selector.length) setVisibility(selector, value);
				});

				if (!this.currentTab.canUserWrite()) $("#chat-message").prop("disabled", true);
				else if ($("#chat-message").is(":disabled")) $("#chat-message").prop("disabled", false);

				$("#chat-log").scrollTop(9999999);
			},
		});
		this.tabsController.bind(html);
		Hooks.on("renderSceneNavigation", (sceneNav, html, data) => {
			if (this.isStreaming) return;
			this.tabsController.activate(this.currentTab.id, { triggerCallback: true });
		});
	}

	get html() {
		let toPrepend = '<nav class="tabbedchatlog tabs flexrow">';
		Object.keys(this.tabs).forEach((key) => {
			toPrepend += this.tabs[key].html;
		});
		toPrepend += "</nav>";
		return toPrepend;
	}

	getValidTab(message) {
		return Object.keys(this.tabs).find((key) => {
			return this.tabs[key].isMessageVisible(message);
		});
	}

	get isStreaming() {
		return game.settings.get("tabbed-chatlog", "hideInStreamView") && window.location.href.endsWith("/stream");
	}
}

Hooks.on("renderChatLog", async function (chatLog, html, user) {
	if (game.tabbedchat.isStreaming) return;
	html.prepend(game.tabbedchat.html);
	game.tabbedchat.bindHTML(html[0]);
	if (!game.tabbedchat.currentTab.canUserWrite()) $("#chat-message").prop("disabled", true);
	const tabbedchat = document.querySelector(".tabbedchatlog");
	tabbedchat.addEventListener("wheel", (event) => {
		event.preventDefault();
		tabbedchat.scrollBy({
			left: event.deltaY < 0 ? -30 : 30,
		});
	});
});

Hooks.on("renderChatMessage", (chatMessage, html, data) => {
	//TODO handle tab-exclusive messages
	//TODO handle tabs that were excluded
	if (game.tabbedchat.isStreaming) return;
	html[0].setAttribute("data-tc-type", data.message.type);
	if (
		[CONST.CHAT_MESSAGE_TYPES.OTHER, CONST.CHAT_MESSAGE_TYPES.IC, CONST.CHAT_MESSAGE_TYPES.EMOTE, CONST.CHAT_MESSAGE_TYPES.ROLL].includes(data.message.type) &&
		data.message.speaker.scene != undefined &&
		game.settings.get("tabbed-chatlog", "perScene")
	) {
		html[0].setAttribute("data-tc-scene", data.message.speaker.scene);
	}
	if (chatMessage.flags["tabbed-chatlog"]?.tabExclusive) {
		html[0].setAttribute("data-tc-tab", chatMessage.flags["tabbed-chatlog"]?.tabExclusive);
	}

	if (!game.tabbedchat.currentTab.isMessageVisible(chatMessage)) html.css({ display: "none" });
});

Hooks.on("diceSoNiceRollComplete", (id) => {
	const currentTab = game.tabbedchat.currentTab;
	if (!currentTab.isMessageTypeVisible(CONST.CHAT_MESSAGE_TYPES.ROLL)) {
		$(`#chat-log .message[data-message-id=${id}]`).css({ display: "none" });
	}
});

Hooks.on("createChatMessage", (chatMessage, content) => {
	const sceneMatches = !chatMessage.speaker.scene || chatMessage.speaker.scene === game.user?.viewedScene;
	const currentTab = game.tabbedchat.currentTab;
	if (sceneMatches && currentTab.isMessageTypeVisible(chatMessage.type)) return;

	const firstValidTab = game.tabbedchat.getValidTab(chatMessage);
	if (!firstValidTab) return;
	if (!chatMessage.flags["tabbed-chatlog"]?.tabExclusive && chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.OOC && chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.WHISPER) {
		chatMessage.updateSource({ ["flags.tabbed-chatlog.tabExclusive"]: game.tabbedchat.tabs[firstValidTab].id });
	}
	if (sceneMatches && !game.tabbedchat.currentTab.isMessageVisible(chatMessage) && game.settings.get("tabbed-chatlog", "autoNavigate")) {
		game.tabbedchat.tabsController.activate(firstValidTab, { triggerCallback: true });
	} else game.tabbedchat.tabs[firstValidTab].setNotification();
});

Hooks.on("preCreateChatMessage", (chatMessage, content) => {
	//TODO add tab-exclusive messages through flags will probably need to add a setting and change isMessageTypeVisible
	if (
		game.settings.get("tabbed-chatlog", "icChatInOoc") &&
		chatMessage.type == CONST.CHAT_MESSAGE_TYPES.IC &&
		game.tabbedchat.currentTab.isMessageTypeVisible(CONST.CHAT_MESSAGE_TYPES.OOC) &&
		!game.tabbedchat.currentTab.isMessageTypeVisible(chatMessage.type)
	) {
		chatMessage._source.type = CONST.CHAT_MESSAGE_TYPES.OOC;
		chatMessage.type = CONST.CHAT_MESSAGE_TYPES.OOC;
		content.type = CONST.CHAT_MESSAGE_TYPES.OOC;
		delete content.speaker;
		delete chatMessage.speaker;
		delete chatMessage._source.speaker;
	}

	if (chatMessage.whisper?.length) return;
	if (
		game.tabbedchat.currentTab.isMessageTypeVisible(chatMessage.type) &&
		chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.OOC &&
		chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.WHISPER
	) {
		chatMessage.updateSource({ ["flags.tabbed-chatlog.tabExclusive"]: game.tabbedchat.currentTab.id });
	}
	try {
		if (chatMessage.type == CONST.CHAT_MESSAGE_TYPES.IC || chatMessage.type == CONST.CHAT_MESSAGE_TYPES.EMOTE) {
			const scene = game.scenes.get(chatMessage.speaker.scene);
			const webhook = scene.getFlag("tabbed-chatlog", "webhook") || game.settings.get("tabbed-chatlog", "icBackupWebhook");
			if (!webhook == undefined || webhook == "") return;

			const speaker = chatMessage.speaker;
			const actor = loadActorForChatMessage(speaker);
			const img = `${game.data.addresses.remote}/${actor ? generatePortraitImageElement(actor) : game.users.get(chatMessage.user.id).avatar}`;
			const name = actor ? actor.name : speaker.alias;

			let message = chatMessage.content;
			if (game.modules.get("polyglot")?.active) message = convertPolyglotMessage(message);
			sendToDiscord(webhook, {
				content: game.tabbedchat.turndown.turndown(message),
				username: name,
				avatar_url: img,
			});
		} else if (chatMessage.type == CONST.CHAT_MESSAGE_TYPES.OOC) {
			const webhook = game.settings.get("tabbed-chatlog", "oocWebhook");
			if (webhook == undefined || webhook == "") return;

			const img = `${game.data.addresses.remote}/${game.users.get(chatMessage.user.id).avatar}`;

			let message = chatMessage.content;
			if (game.modules.get("polyglot")?.active) message = convertPolyglotMessage(message);
			sendToDiscord(webhook, {
				content: game.tabbedchat.turndown.turndown(message),
				username: game.users.get(chatMessage.user.id).name,
				avatar_url: img,
			});
		}
	} catch (error) {
		console.error(`Tabbed Chatlog | Error trying to send message through the webhook.`, error);
	}
});

function sendToDiscord(webhook, body) {
	$.ajax({
		type: "POST",
		url: webhook,
		data: JSON.stringify(body),
		success: function (data) {},
		contentType: "application/json",
		dataType: "json",
	});
}

function convertPolyglotMessage(message) {
	let lang = chatMessage.flags.polyglot.language;
	const LanguageProvider = polyglot.polyglot.LanguageProvider;
	if (lang != LanguageProvider.defaultLanguage) {
		message = LanguageProvider.languages[lang] + ": ||" + chatMessage.content + "||";
	}
	return message;
}

function loadActorForChatMessage(speaker) {
	var actor;
	if (speaker.token) {
		actor = game.actors.tokens[speaker.token];
	}
	if (!actor) {
		actor = game.actors.get(speaker.actor);
	}
	if (!actor) {
		game.actors.forEach((value) => {
			if (value.name === speaker.alias) {
				actor = value;
			}
		});
	}
	return actor;
}

function generatePortraitImageElement(actor) {
	let img = "";
	img = actor.token ? actor.token.data.img : actor.data.token.img;
	return img;
}

Hooks.on("renderSceneConfig", (app, html, data) => {
	if (!game.settings.get("tabbed-chatlog", "perScene")) return;
	let loadedWebhookData = "";
	if (app.object.compendium) return;
	if (app.object.data.flags["tabbed-chatlog"]?.webhook) loadedWebhookData = app.object.getFlag("tabbed-chatlog", "webhook");
	const fxHtml = `
	<div class="form-group">
		<label>${game.i18n.localize("TC.SETTINGS.IcSceneWebhook.name")}</label>
		<input id="scenewebhook" type="password" name="flags.tabbed-chatlog.webhook" value="${loadedWebhookData}" />
		<p class="notes">
			${game.i18n
				.format("TC.SETTINGS.IcSceneWebhook.hint", { setting: game.i18n.localize("TC.SETTINGS.ChatTabsSettings.name") })
				.replace("---", `<a href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank">discord's site</a>`)}
		</p>
	</div> `;
	const fxFind = html.find("select[name ='journal']");
	const formGroup = fxFind.closest(".form-group");
	formGroup.after(fxHtml);
});

Hooks.on("renderSettingsConfig", (settingsConfig, html) => {
	const oocWebhook = html.find('input[name="tabbed-chatlog.oocWebhook"]');
	const icWebhook = html.find('input[name="tabbed-chatlog.icBackupWebhook"]');
	oocWebhook[0].type = "password";
	icWebhook[0].type = "password";
});

Hooks.on("init", () => {
	libWrapper.register(
		"tabbed-chatlog",
		"Messages.prototype.flush",
		async function () {
			return Dialog.confirm({
				title: game.i18n.localize("CHAT.FlushTitle"),
				content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("CHAT.FlushWarning")}</p>`,
				yes: () => {
					ChatMessage.deleteDocuments([...game.messages].filter((entity) => game.tabbedchat.currentTab.isMessageVisible(entity)).map((message) => message.id));
					const jumpToBottomElement = document.querySelector(".jump-to-bottom");
					jumpToBottomElement.classList.toggle("hidden", true);
				},
				options: {
					top: window.innerHeight - 150,
					left: window.innerWidth - 720,
				},
			});
		},
		"OVERRIDE"
	);
});

Hooks.on("setup", () => {
	registerSettings();
	const tabs = game.settings.get("tabbed-chatlog", "tabs");
	const instancedTabs = [];
	tabs.forEach((tab) => {
		instancedTabs.push(new ChatTab({ ...tab }));
	});
	game.tabbedchat = new TabbedChatlog(instancedTabs);
});

Hooks.on("ready", () => {
	if (game.modules.get("narrator-tools")?.active) NarratorTools._msgtype = 2;
});
