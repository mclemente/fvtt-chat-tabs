import { TurndownService } from "./module/TurndownService.js";
import { ChatTabSource, RW_PERMISSIONS, registerSettings, renderSettingsConfigHandler } from "./module/settings.js";

class ChatTab {
	constructor({ id, name, permissions = {}, sources = [] }) {
		this.id = id;
		this.name = name;
		this.sources = game.chatTabs.sources.filter((source) => sources.includes(source.key));
		const roles = this.createRolePermissions(permissions.roles);
		const users = this.createUserPermissions(permissions.users);
		this.permissions = {
			roles,
			users,
		};
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
		Object.keys(users)
			.filter((id) => !game.users.get(id))
			.forEach((id) => {
				delete users[id];
			});
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

	getUserPermission(userId = game.userId) {
		if (typeof userId !== "string") {
			throw new Error("Customizable Chat Tabs | getUserPermission: userId must be a string");
		}

		let role = game.users.get(userId).role;
		if (role === 4) return 2;

		if (this.permissions.users[userId] && this.permissions.users[userId] !== -1) {
			return this.permissions.users[userId];
		}

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

	canUserWrite(userId = game.userId) {
		return this.getUserPermission(userId) > 1;
	}

	/**
	 * Returns if the message type is visible on the tab.
	 * @param {string} messageID
	 * @returns {Element | null}
	 */
	getMessageEl(messageID) {
		return document.querySelector(`.message.chat-message[data-message-id="${messageID}"]`);
	}

	isTabVisible(userId = game.userId) {
		return this.getUserPermission(userId) > 0;
	}

	/**
	 * Returns if the message type is visible on the tab.
	 * @param {Number} messageType
	 * @returns {Boolean}
	 */
	isMessageTypeVisible(messageType) {
		return Boolean(this.sources.find((source) => source.messageTypeID === messageType));
	}

	/**
	 * Returns if the message is visible on the tab.
	 * @param {Object} message
	 * @returns {Boolean}
	 */
	isMessageVisible(message) {
		return Boolean(this.sources.find((source) => source.canShowMessage(message, this.id)));
	}

	setNotification() {
		$(`#${this.id}Notification`).css({ display: "" });
	}

	/**
	 * Set message css property display
	 * @param {string} messageID
	 * @param {string} display
	 */
	setMessageDisplay(messageID, display = "") {
		$(`#chat-log .message[data-message-id=${messageID}]`).css({ display });
	}

	/**
	 * Set message visible
	 * @param {Object} message
	 */
	show(message) {
		return this.setMessageDisplay(message.id);
	}

	/**
	 * Set message hidden
	 * @param {Object} message
	 */
	hide(message) {
		return this.setMessageDisplay(message.id, "none");
	}

	/**
	 * Set message visibility based on tab sources
	 * Return message visibility state
	 * @param {Object} message
	 * @returns {Boolean}
	 */
	handle(message) {
		const visible = this.isMessageVisible(message);
		visible ? this.show(message) : this.hide(message);
		return visible;
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
	constructor() {
		this.sources = ChatTabSource.getCoreSources();
		this.tabs = [];
		this._currentTab = undefined;
	}
	turndown = new TurndownService();

	chatTab = ChatTab;

	setup() {
		this.tabs = game.settings.get("chat-tabs", "tabs").map((tab) => new ChatTab({ ...tab }));
		this._currentTab = this.tabs[0];
		this.initHooks();
	}

	initHooks() {
		Hooks.on("renderChatLog", async function (chatLog, html, user) {
			if (game.chatTabs.isStreaming) return;
			html.prepend(game.chatTabs.html);
			game.chatTabs.bindHTML(html[0]);
			if (!game.chatTabs.currentTab.canUserWrite()) $("#chat-message").prop("disabled", true);
			const tabbedchat = document.querySelector(".tabbedchatlog");
			tabbedchat.addEventListener("wheel", (event) => {
				event.preventDefault();
				tabbedchat.scrollBy({
					left: event.deltaY < 0 ? -30 : 30,
				});
			});
		});

		Hooks.on("renderChatMessage", (message, html, data) => {
			if (game.chatTabs.isStreaming) return;

			if (game.system.id === "pf2e" && message.content.includes(`section class="damage-taken"`)) {
				html[0].classList.add("emote");
			}

			if (!game.chatTabs.currentTab.isMessageVisible(message)) {
				html.css({ display: "none" });
			}
		});

		Hooks.on("diceSoNiceRollComplete", (messageID) => {
			const message = game.messages.find((message) => message.id === messageID);
			game.chatTabs.currentTab.handle(message);
		});

		Hooks.on("createChatMessage", (message, options, userId) => {
			const messageTabs = this.tabs.filter((tab) => tab.isMessageVisible(message));
			messageTabs.forEach((tab) => tab.setNotification());

			if (messageTabs.length && game.settings.get("chat-tabs", "autoNavigate")) {
				game.chatTabs.tabsController.activate(messageTabs[0].id, { triggerCallback: true });
			}
		});

		Hooks.on("preCreateChatMessage", (chatMessage, content, options, userId) => {
			if (game.system.id === "pf2e" && chatMessage.content.includes(`section class="damage-taken"`)) {
				chatMessage._source.type = CONST.CHAT_MESSAGE_TYPES.ROLL;
				chatMessage.type = CONST.CHAT_MESSAGE_TYPES.ROLL;
				content.type = CONST.CHAT_MESSAGE_TYPES.ROLL;
			}
			if (
				game.settings.get("chat-tabs", "icChatInOoc") &&
				chatMessage.type == CONST.CHAT_MESSAGE_TYPES.IC &&
				game.chatTabs.currentTab.isMessageTypeVisible(CONST.CHAT_MESSAGE_TYPES.OOC) &&
				!game.chatTabs.currentTab.isMessageTypeVisible(chatMessage.type)
			) {
				chatMessage._source.type = CONST.CHAT_MESSAGE_TYPES.OOC;
				chatMessage.type = CONST.CHAT_MESSAGE_TYPES.OOC;
				content.type = CONST.CHAT_MESSAGE_TYPES.OOC;
				content.speaker = undefined;
				const speaker = {
					actor: null,
					alias: undefined,
					scene: null,
					token: null,
				};
				chatMessage.speaker = speaker;
				chatMessage._source.speaker = speaker;
			}

			if (chatMessage.whisper?.length) return;
			const isValidMessageType =
				(game.settings.get("chat-tabs", "tabExclusiveOOC") &&
					chatMessage.type === CONST.CHAT_MESSAGE_TYPES.OOC) ||
				chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.OOC ||
				chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.WHISPER;
			if (!isValidMessageType) return;
			const isValidTab = Boolean(
				game.chatTabs.currentTab.sources.find((source) => source.canShowMessageNonExclusively(chatMessage))
			);
			if (isValidTab) {
				chatMessage.updateSource({ ["flags.chat-tabs.tabExclusive"]: game.chatTabs.currentTab.id });
			} else {
				const validTab = game.chatTabs.tabs.find((tab) =>
					tab.sources.find((source) => source.canShowMessageNonExclusively(chatMessage))
				);
				if (validTab) chatMessage.updateSource({ ["flags.chat-tabs.tabExclusive"]: validTab.id });
			}
			try {
				const WEBHOOKS = {
					scene: game.scenes.get(chatMessage.speaker.scene)?.getFlag("chat-tabs", "webhook") ?? "",
					backupIC: game.settings.get("chat-tabs", "icBackupWebhook"),
					OOC: game.settings.get("chat-tabs", "oocWebhook"),
				};
				if (Object.values(WEBHOOKS).every((v) => v === "")) return;
				let webhook, message, img, embeds;
				const sendRoll = chatMessage.isRoll && game.settings.get("chat-tabs", "rollsToWebhook");
				if (
					chatMessage.type == CONST.CHAT_MESSAGE_TYPES.IC ||
					chatMessage.type == CONST.CHAT_MESSAGE_TYPES.EMOTE ||
					(sendRoll && chatMessage.speaker.actor)
				) {
					webhook = WEBHOOKS.scene || WEBHOOKS.backupIC;
					if (!webhook) return;

					const speaker = chatMessage.speaker;
					const actor = loadActorForChatMessage(speaker);
					img = actor ? generatePortraitImageElement(actor) : chatMessage.user.avatar;
				} else if (
					chatMessage.type == CONST.CHAT_MESSAGE_TYPES.OOC ||
					(sendRoll && !chatMessage.speaker.actor)
				) {
					webhook = WEBHOOKS.OOC;
					if (!webhook) return;

					img = chatMessage.user.avatar;
				}
				if (webhook) {
					if (sendRoll) {
						const title = chatMessage.flavor ? chatMessage.flavor + "\n" : "";
						const description = `${game.i18n.localize("Roll Formula")}: ${chatMessage.rolls[0].formula} = ${
							chatMessage.rolls[0].result
						}`;
						embeds = [{ title, description }];
					}
					if (game.modules.get("polyglot")?.active) {
						message = convertPolyglotMessage(chatMessage);
					} else {
						message = chatMessage.content;
					}
					if (!/https?:\/\//g.test(img)) {
						img = game.data.addresses.remote + img;
					}
					sendToDiscord(webhook, {
						content: game.chatTabs.turndown.turndown(message),
						username: chatMessage.alias,
						avatar_url: encodeURI(img),
						embeds,
					});
				}
			} catch (error) {
				console.error(`Customizable Chat Tabs | Error trying to send message through the webhook.`, error);
			}
		});

		Hooks.on("changeSidebarTab", (sidebar) => {
			if (sidebar.tabName !== "chat") return;
			this.tabsController.activate(this.currentTab.id, { triggerCallback: true });
		});
	}

	get currentTab() {
		return this._currentTab;
	}
	set currentTab(tab) {
		if (typeof tab === "string") tab = this.tabs.find((key) => key.id === tab);
		else if (typeof tab === "number") tab = this.tabs[tab];
		tab.active = true;
		if (this._currentTab) this._currentTab.active = false;
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
				game.messages.forEach((message) => this.currentTab.handle(message));
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

	get isStreaming() {
		return game.settings.get("chat-tabs", "hideInStreamView") && window.location.href.endsWith("/stream");
	}

	register({ key, messageTypeID = undefined, label = "", hint = "" }) {
		if (!key) return;
		this.sources.push(
			new ChatTabSource({
				hint,
				key: `module.${key}`,
				label: label || game.modules.get(key)?.title || key,
			})
		);
	}
}

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

function convertPolyglotMessage(chatMessage) {
	const lang = chatMessage.getFlag("polyglot", "language");
	let message = chatMessage.content;
	if (lang !== game.polyglot.defaultLanguage) {
		message = game.polyglot.languages[lang].label + ": ||" + message + "||";
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
	return actor.token ? actor.token.texture.src : actor.img;
}

Hooks.on("renderSceneConfig", (app, html, data) => {
	if (!game.settings.get("chat-tabs", "perScene")) return;
	let loadedWebhookData = "";
	if (app.object.compendium) return;
	if (app.object.flags["chat-tabs"]?.webhook) loadedWebhookData = app.object.getFlag("chat-tabs", "webhook");
	const fxHtml = `
	<div class="form-group">
		<label>${game.i18n.localize("TC.SETTINGS.IcSceneWebhook.name")}</label>
		<input id="scenewebhook" type="password" name="flags.chat-tabs.webhook" value="${loadedWebhookData}" />
		<p class="notes">
			${game.i18n
				.format("TC.SETTINGS.IcSceneWebhook.hint", {
					setting: game.i18n.localize("TC.SETTINGS.ChatTabsSettings.name"),
				})
				.replace(
					"---",
					`<a href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank">discord's site</a>`
				)}
		</p>
	</div> `;
	const fxFind = html.find("select[name ='journal']");
	const formGroup = fxFind.closest(".form-group");
	formGroup.after(fxHtml);
});

Hooks.on("renderSettingsConfig", (settingsConfig, html) => {
	const oocWebhook = html.find('input[name="chat-tabs.oocWebhook"]');
	const icWebhook = html.find('input[name="chat-tabs.icBackupWebhook"]');
	oocWebhook[0].type = "password";
	icWebhook[0].type = "password";
});

Hooks.on("init", () => {
	libWrapper.register(
		"chat-tabs",
		"Messages.prototype.flush",
		async function () {
			return Dialog.confirm({
				title: game.i18n.localize("CHAT.FlushTitle"),
				content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize(
					"CHAT.FlushWarning"
				)}</p>`,
				yes: () => {
					ChatMessage.deleteDocuments(
						[...game.messages]
							.filter((entity) => game.chatTabs.currentTab.isMessageVisible(entity))
							.map((message) => message.id)
					);
					if (game.version >= 11) {
						const jumpToBottomElement = document.querySelector(".jump-to-bottom");
						jumpToBottomElement.classList.toggle("hidden", true);
					}
				},
				options: {
					top: window.innerHeight - 150,
					left: window.innerWidth - 720,
				},
			});
		},
		"OVERRIDE"
	);
	libWrapper.register(
		"chat-tabs",
		"ChatLog.prototype._onScrollLog",
		function (event) {
			if (!this.rendered) return;
			const log = event.target;
			const pct = log.scrollTop / (log.scrollHeight - log.clientHeight);
			const jumpToBottomElement = this.element.find(".jump-to-bottom")[0];
			jumpToBottomElement.classList.toggle("hidden", isNaN(pct) || pct > 0.99);
			if (isNaN(pct) || pct < 0.01) return this._renderBatch(this.element, CONFIG.ChatMessage.batchSize);
		},
		"OVERRIDE"
	);
});

Hooks.on("i18nInit", () => {
	registerSettings();
	game.tabbedchat = game.chatTabs = new TabbedChatlog();
	Hooks.callAll("chat-tabs.init");
});

Hooks.on("setup", () => {
	game.chatTabs.setup();
});

Hooks.on("ready", () => {
	if (game.modules.get("narrator-tools")?.active) NarratorTools._msgtype = 2;
});

Hooks.on("renderSettingsConfig", renderSettingsConfigHandler);
