import { TurndownService } from "./module/TurndownService.js";
import { RW_PERMISSIONS, registerSettings } from "./module/settings.js";

class ChatTab {
	constructor({ id, name, messageTypes = {}, permissions = {} }) {
		this.id = id;
		this.name = name;
		this.messageTypes = this.createMessageTypes(messageTypes);
		const roles = this.createRolePermissions(permissions.roles);
		const users = this.createUserPermissions(permissions.users);
		this.permissions = {
			roles,
			users,
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

	isTabVisible(userId = game.userId) {
		return this.getUserPermission(userId) > 0;
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
		const messageType = message.type;
		if (!this.isMessageTypeVisible(messageType)) return false;
		if (
			message.speaker.scene &&
			game.settings.get("chat-tabs", "perScene") &&
			(messageType == CONST.CHAT_MESSAGE_TYPES.IC || messageType == CONST.CHAT_MESSAGE_TYPES.EMOTE) &&
			message.speaker.scene != game.user.viewedScene
		) {
			return false;
		}
		const tabExclusiveID = message.flags["chat-tabs"]?.tabExclusive;
		if (
			game.settings.get("chat-tabs", "tabExclusive") &&
			tabExclusiveID &&
			game.tabbedchat.currentTab.id !== tabExclusiveID &&
			game.tabbedchat.tabs[tabExclusiveID]
		) {
			return false;
		}
		if (message.blind && message.whisper.find((element) => element == game.userId) == undefined) return false;
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

	initHooks() {
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
			if (game.tabbedchat.isStreaming) return;
			html[0].setAttribute("data-tc-type", data.message.type);
			if (
				[
					CONST.CHAT_MESSAGE_TYPES.OTHER,
					CONST.CHAT_MESSAGE_TYPES.IC,
					CONST.CHAT_MESSAGE_TYPES.EMOTE,
					CONST.CHAT_MESSAGE_TYPES.ROLL,
				].includes(data.message.type) &&
				data.message.speaker.scene != undefined &&
				game.settings.get("chat-tabs", "perScene")
			) {
				html[0].setAttribute("data-tc-scene", data.message.speaker.scene);
			}
			if (chatMessage.flags["chat-tabs"]?.tabExclusive) {
				html[0].setAttribute("data-tc-tab", chatMessage.flags["chat-tabs"]?.tabExclusive);
			}
			if (game.system.id === "pf2e" && chatMessage.content.includes(`section class="damage-taken"`)) {
				html[0].classList.add("emote");
			}

			if (!game.tabbedchat.currentTab.isMessageVisible(chatMessage)) html.css({ display: "none" });
		});

		Hooks.on("diceSoNiceRollComplete", (id) => {
			const currentTab = game.tabbedchat.currentTab;
			if (!currentTab.isMessageTypeVisible(CONST.CHAT_MESSAGE_TYPES.ROLL)) {
				$(`#chat-log .message[data-message-id=${id}]`).css({ display: "none" });
			}
		});

		Hooks.on("createChatMessage", (chatMessage, options, userId) => {
			const sceneMatches = !chatMessage.speaker.scene || chatMessage.speaker.scene === game.user?.viewedScene;
			const currentTab = game.tabbedchat.currentTab;
			if (sceneMatches && currentTab.isMessageTypeVisible(chatMessage.type)) return;

			const firstValidTab = game.tabbedchat.getValidTab(chatMessage);
			if (!firstValidTab) return;
			if (
				!chatMessage.flags["chat-tabs"]?.tabExclusive &&
				chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.OOC &&
				chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.WHISPER
			) {
				chatMessage.updateSource({
					["flags.chat-tabs.tabExclusive"]: game.tabbedchat.tabs[firstValidTab].id,
				});
			}
			if (
				sceneMatches &&
				!game.tabbedchat.currentTab.isMessageVisible(chatMessage) &&
				game.settings.get("chat-tabs", "autoNavigate")
			) {
				game.tabbedchat.tabsController.activate(firstValidTab, { triggerCallback: true });
			} else game.tabbedchat.tabs[firstValidTab].setNotification();
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
				game.tabbedchat.currentTab.isMessageTypeVisible(CONST.CHAT_MESSAGE_TYPES.OOC) &&
				!game.tabbedchat.currentTab.isMessageTypeVisible(chatMessage.type)
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
			if (
				game.tabbedchat.currentTab.isMessageTypeVisible(chatMessage.type) &&
				chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.OOC &&
				chatMessage.type !== CONST.CHAT_MESSAGE_TYPES.WHISPER
			) {
				chatMessage.updateSource({ ["flags.chat-tabs.tabExclusive"]: game.tabbedchat.currentTab.id });
			}
			try {
				let webhook, message, name, img, embeds;
				const sendRoll = chatMessage.isRoll && game.settings.get("chat-tabs", "rollsToWebhook");
				if (
					chatMessage.type == CONST.CHAT_MESSAGE_TYPES.IC ||
					chatMessage.type == CONST.CHAT_MESSAGE_TYPES.EMOTE ||
					(sendRoll && chatMessage.speaker.actor)
				) {
					const scene = game.scenes.get(chatMessage.speaker.scene);
					webhook =
						scene?.getFlag("chat-tabs", "webhook") || game.settings.get("chat-tabs", "icBackupWebhook");
					if (!webhook == undefined || webhook == "") return;

					const speaker = chatMessage.speaker;
					const actor = loadActorForChatMessage(speaker);
					img = actor ? generatePortraitImageElement(actor) : chatMessage.user.avatar;
				} else if (
					chatMessage.type == CONST.CHAT_MESSAGE_TYPES.OOC ||
					(sendRoll && !chatMessage.speaker.actor)
				) {
					webhook = game.settings.get("chat-tabs", "oocWebhook");
					if (webhook == undefined || webhook == "") return;

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
					if (!img.includes("http")) {
						img = game.data.addresses.remote + img;
					}
					sendToDiscord(webhook, {
						content: game.tabbedchat.turndown.turndown(message),
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

	getTabByID(tabId) {
		if (typeof tabId !== "string") {
			throw new Error("Customizable Chat Tabs | getTabByID: tabId must be a string");
		}
		for (const tab of this.tabs) {
			if (tab.id === tabId) return tab;
		}
		return null;
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
					const perScene = game.settings.get("chat-tabs", "perScene");
					const tabExclusive = game.settings.get("chat-tabs", "tabExclusive");
					if (
						[
							CONST.CHAT_MESSAGE_TYPES.IC,
							CONST.CHAT_MESSAGE_TYPES.EMOTE,
							CONST.CHAT_MESSAGE_TYPES.ROLL,
						].includes(messageType)
					) {
						// selector.filter(".scenespecific").css({ display: "none" });
						// selector.not(".scenespecific").css({ display: visible ? "" : "none" });
						// selector.filter(".scene" + game.user.viewedScene).css({ display: visible ? "" : "none" });
						if (perScene && !tabExclusive) {
							selector.filter(`[data-tc-scene]`).css({ display: "none" });
							selector
								.filter(`[data-tc-scene="${game.user.viewedScene}"]`)
								.css({ display: visible ? "" : "none" });
						} else if (!perScene && tabExclusive) {
							selector.filter(`[data-tc-tab]`).css({ display: "none" });
							selector
								.filter(`[data-tc-tab=${this.currentTab.id}]`)
								.css({ display: visible ? "" : "none" });
						} else if (perScene && tabExclusive) {
							selector.filter(`[data-tc-scene]`).css({ display: "none" });
							selector.filter(`[data-tc-tab]`).css({ display: "none" });
							selector
								.filter(`[data-tc-scene="${game.user.viewedScene}"][data-tc-tab=${this.currentTab.id}]`)
								.css({ display: visible ? "" : "none" });
							for (let message of selector.filter(`[data-tc-scene="${game.user.viewedScene}"]`)) {
								const tabId = message.dataset.tcTab;
								if (tabId && !this.getTabByID(tabId) && tabId !== this.currentTab.id) {
									selector
										.filter(`[data-tc-scene="${game.user.viewedScene}"][data-tc-tab="${tabId}"]`)
										.css({ display: visible ? "" : "none" });
								}
							}
						}
						if (messageType === CONST.CHAT_MESSAGE_TYPES.ROLL) {
							selector.filter(".gm-roll-hidden").attr("hidden", true);
						}
						return;
					}
					// OTHER, OOC, WHISPER
					selector.css({ display: visible ? "" : "none" });
				};

				Object.values(CONST.CHAT_MESSAGE_TYPES).forEach((value) => {
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
		return game.settings.get("chat-tabs", "hideInStreamView") && window.location.href.endsWith("/stream");
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
	const lang = chatMessage.flags.polyglot.language;
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
							.filter((entity) => game.tabbedchat.currentTab.isMessageVisible(entity))
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
});

Hooks.on("setup", () => {
	registerSettings();
	const tabs = game.settings.get("chat-tabs", "tabs");
	const instancedTabs = [];
	tabs.forEach((tab) => {
		instancedTabs.push(new ChatTab({ ...tab }));
	});
	game.tabbedchat = new TabbedChatlog(instancedTabs);
	game.tabbedchat.initHooks();
});

Hooks.on("ready", () => {
	if (game.modules.get("narrator-tools")?.active) NarratorTools._msgtype = 2;
});
