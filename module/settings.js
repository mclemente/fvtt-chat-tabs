export const RW_PERMISSIONS = {
	EMPTY: -1,
	NONE: 0,
	READ: 1,
	READ_WRITE: 2,
};

export function registerSettings() {
	game.settings.registerMenu("chat-tabs", "ChatTabsSettings", {
		name: game.i18n.localize("TC.SETTINGS.ChatTabsSettings.name"),
		label: game.i18n.localize("TC.SETTINGS.ChatTabsSettings.name"),
		icon: "fas fa-comments",
		type: TabbedChatTabSettings,
		restricted: true,
	});

	game.settings.register("chat-tabs", "oocWebhook", {
		name: game.i18n.localize("TC.SETTINGS.OocWebhook.name"),
		hint: game.i18n.localize("TC.SETTINGS.OocWebhook.hint"),
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

	// TODO move these onto the ChatTabs class for every tab but rolls
	game.settings.register("chat-tabs", "icBackupWebhook", {
		name: game.i18n.localize("TC.SETTINGS.IcFallbackWebhook.name"),
		hint: game.i18n.format("TC.SETTINGS.IcFallbackWebhook.hint", {
			setting: game.i18n.localize("TC.SETTINGS.ChatTabsSettings.name"),
		}),
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

	game.settings.register("chat-tabs", "icChatInOoc", {
		name: game.i18n.localize("TC.SETTINGS.IcChatInOoc.name"),
		hint: game.i18n.localize("TC.SETTINGS.IcChatInOoc.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});

	game.settings.register("chat-tabs", "rollsToWebhook", {
		name: game.i18n.localize("TC.SETTINGS.rollsToWebhook.name"),
		hint: game.i18n.localize("TC.SETTINGS.rollsToWebhook.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});

	game.settings.register("chat-tabs", "hideInStreamView", {
		name: game.i18n.localize("TC.SETTINGS.HideInStreamView.name"),
		hint: game.i18n.localize("TC.SETTINGS.HideInStreamView.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});

	game.settings.register("chat-tabs", "perScene", {
		name: game.i18n.localize("TC.SETTINGS.PerScene.name"),
		hint: game.i18n.localize("TC.SETTINGS.PerScene.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		onChange: () => {
			game.tabbedchat.tabsController.activate(game.tabbedchat.currentTab.id, { triggerCallback: true });
		},
	});

	game.settings.register("chat-tabs", "autoNavigate", {
		name: game.i18n.localize("TC.SETTINGS.AutoNavigate.name"),
		hint: game.i18n.localize("TC.SETTINGS.AutoNavigate.hint"),
		scope: "client",
		config: true,
		default: false,
		type: Boolean,
	});

	game.settings.register("chat-tabs", "tabExclusive", {
		name: game.i18n.localize("TC.SETTINGS.tabExclusive.name"),
		hint: game.i18n.localize("TC.SETTINGS.tabExclusive.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
		onChange: () => {
			game.tabbedchat.tabsController.activate(game.tabbedchat.currentTab.id, { triggerCallback: true });
		},
	});

	game.settings.register("chat-tabs", "tabs", {
		scope: "world",
		config: false,
		default: [
			{
				id: "wmr4yRZBlboaEttp",
				name: game.i18n.localize("TC.TABS.IC"),
				messageTypes: {
					IC: true,
					EMOTE: true,
				},
			},
			{
				id: "Q444x8op9CbsAd0u",
				name: game.i18n.localize("TC.TABS.Rolls"),
				messageTypes: {
					OTHER: true,
					ROLL: true,
				},
			},
			{
				id: "cHJ0rSy4uxtIjZwU", // OOC
				name: game.i18n.localize("TC.TABS.OOC"),
				messageTypes: {
					OOC: true,
					WHISPER: true,
				},
			},
		],
		type: Array,
		requiresReload: true,
	});
}

class TabbedChatTabSettings extends FormApplication {
	constructor(object, options = {}) {
		super(object, options);
		this.init();
	}

	init() {
		this.tabs = deepClone(game.settings.get("chat-tabs", "tabs"));
		const chatTab = game.tabbedchat.chatTab.prototype;
		this.tabs.forEach((tab) => {
			tab.messageTypes = chatTab.createMessageTypes(tab.messageTypes);
			tab.permissions = {
				roles: chatTab.createRolePermissions(tab.permissions?.roles),
				users: chatTab.createUserPermissions(tab.permissions?.users),
			};
		});
		this.changeTabs = null;
		this.roles = {
			PLAYER: game.i18n.localize("USER.RolePlayer"),
			TRUSTED: game.i18n.localize("USER.RoleTrusted"),
			ASSISTANT: game.i18n.localize("USER.RoleAssistant"),
			GAMEMASTER: game.i18n.localize("USER.RoleGamemaster"),
		};
		this.levels = {};
		Object.keys(RW_PERMISSIONS).forEach((key) => {
			this.levels[[RW_PERMISSIONS[key]]] = key === "EMPTY" ? "" : game.i18n.localize(`TC.PERMISSIONS.${key}`);
		});
		Object.keys(this.tabs).forEach((key) => {
			Object.keys(this.tabs[key].messageTypes).forEach((id) => {
				this.tabs[key].messageTypes[id] = {
					label: game.i18n.localize(`TC.MESSAGE_TYPES.${id}.label`),
					hint: game.i18n.localize(`TC.MESSAGE_TYPES.${id}.hint`),
					value: this.tabs[key].messageTypes[id] ?? RW_PERMISSIONS.EMPTY,
				};
			});
		});
		Object.keys(this.tabs).forEach((key) => {
			Object.keys(this.tabs[key].permissions.roles).forEach((id) => {
				this.tabs[key].permissions.roles[id] = {
					label: this.roles[id],
					value: this.tabs[key].permissions.roles[id] ?? RW_PERMISSIONS.EMPTY,
				};
			});
			Object.keys(this.tabs[key].permissions.users)
				.filter((id) => game.users.get(id).role !== CONST.USER_ROLES.GAMEMASTER)
				.forEach((id) => {
					this.tabs[key].permissions.users[id] = {
						label: game.users.get(id).name,
						value: this.tabs[key].permissions.users[id] ?? RW_PERMISSIONS.EMPTY,
					};
				});
		});
	}

	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: "tabbeb-chat-tabs-form",
			title: `Tabbed Chatlog: ${game.i18n.localize("TC.SETTINGS.ChatTabsSettings.name")}`,
			template: "./modules/chat-tabs/templates/ChatTabs.hbs",
			classes: ["form", "tabbed-chat"],
			width: 640,
			height: "auto",
			tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "ic" }],
			closeOnSubmit: true,
		});
	}

	get tabStructure() {
		const chatTab = game.tabbedchat.chatTab.prototype;
		return {
			id: randomID(),
			name: game.i18n.localize("TC.TABS.NewTab"),
			messageTypes: chatTab.createMessageTypes(),
			permissions: {
				roles: chatTab.createRolePermissions(),
				users: chatTab.createUserPermissions(),
			},
		};
	}

	getData(options) {
		return {
			roles: this.roles,
			levels: this.levels,
			tabs: this.tabs,
		};
	}

	async resetToDefault(key) {
		const defaultValue = game.settings.settings.get(`chat-tabs.${key}`).default;
		await game.settings.set("chat-tabs", key, defaultValue);
	}

	_activateCoreListeners(html) {
		super._activateCoreListeners(html);
		if (this.changeTabs !== null) {
			const tabName = this.changeTabs.toString();
			if (tabName !== this._tabs[0].active) this._tabs[0].activate(tabName);
			this.changeTabs = null;
		}
	}

	async activateListeners(html) {
		super.activateListeners(html);

		html.find("button[name=reset]").on("click", async (event) => {
			await this.resetToDefault("tabs");
			this.close();
		});
		html.find(".tc-collapse-label").on("click", (event) => {
			const messageTypeContainer = event.target.nextElementSibling;
			if (messageTypeContainer.style.display === "none") {
				messageTypeContainer.style.display = "";
			} else messageTypeContainer.style.display = "none";
		});

		// Handle all changes to tables
		html.find("a[data-action=add-tab]").on("click", (event) => {
			this.changeTabs = this.tabs.length;
			const newTab = deepClone(this.tabStructure);
			Object.keys(newTab.messageTypes).forEach((id) => {
				newTab.messageTypes[id] = {
					label: game.i18n.localize(`TC.MESSAGE_TYPES.${id}.label`),
					hint: game.i18n.localize(`TC.MESSAGE_TYPES.${id}.hint`),
					value: newTab.messageTypes[id] ?? RW_PERMISSIONS.EMPTY,
				};
			});
			Object.keys(newTab.permissions.roles).forEach((id) => {
				newTab.permissions.roles[id] = {
					label: this.roles[id],
					value: newTab.permissions.roles[id] ?? RW_PERMISSIONS.EMPTY,
				};
			});
			Object.keys(newTab.permissions.users).forEach((id) => {
				newTab.permissions.users[id] = {
					label: game.users.get(id).name,
					value: newTab.permissions.users[id] ?? RW_PERMISSIONS.EMPTY,
				};
			});
			this.tabs.push(newTab);
			this.render();
		});
		html.find("button[data-action=table-delete]").on("click", (event) => {
			const { key } = event.target?.dataset;
			this.tabs.splice(Number(key), 1);
			this.changeTabs = Number(key) - 1;
			this.render();
		});
		html.find("button[data-action=change-prio]").on("click", (event) => {
			const prio = event.target?.dataset.prio === "increase" ? -1 : 1;
			const key = Number(event.target?.dataset.key);

			const arraymove = (arr, fromIndex, toIndex) => {
				const element = arr[fromIndex];
				arr.splice(fromIndex, 1);
				arr.splice(toIndex, 0, element);
			};

			arraymove(this.tabs, key, key + prio);
			this.changeTabs = key + prio;
			this.render();
		});
		// Change inputs
		for (const input of html[0].querySelectorAll(".form-group input")) {
			input.addEventListener("change", (event) => {
				const [tabs, index, name, item] = event.target.name.split(".");
				if (event.target.type === "checkbox") {
					this[tabs][index][name][item].value = event.target.checked;
				} else if (item) {
					// Probably unused
					this[tabs][index][name][item] = event.target.value;
				} else {
					this[tabs][index][name] = event.target.value;
				}
				event.preventDefault();
			});
		}
		for (const input of html[0].querySelectorAll(".form-group select")) {
			input.addEventListener("change", (event) => {
				const [tabs, index, name, type, item] = event.target.name.split(".");
				this[tabs][index][name][type][item].value = event.target.value;
				event.preventDefault();
			});
		}
	}

	_getSubmitData(updateData) {
		const original = super._getSubmitData(updateData);
		const data = expandObject(original);
		const tabs = [];
		for (const key in data.tabs) {
			let { id, name, messageTypes, permissions } = data.tabs[key];
			const messageTypesFilter = Object.keys(messageTypes).filter((key) => messageTypes[key]);
			if (!messageTypesFilter.length) messageTypes = {};
			else {
				messageTypes = Object.assign(
					...messageTypesFilter.map((key) => ({
						[key]: messageTypes[key],
					}))
				);
			}
			permissions.roles = Object.assign(
				...Object.keys(permissions.roles).map((key) => ({
					[key]: Number(permissions.roles[key]),
				}))
			);
			if (permissions.users !== undefined && Object.keys(permissions.users).length) {
				permissions.users = Object.assign(
					...Object.keys(permissions.users).map((key) => ({
						[key]: Number(permissions.users[key]),
					}))
				);
			}
			tabs.push({
				id,
				name,
				messageTypes,
				permissions,
			});
		}
		return { tabs };
	}

	/**
	 * Executes on form submission
	 * @param {Event} event - the form submission event
	 * @param {Object} formData - the form data
	 */
	async _updateObject(event, formData) {
		for (let [k, v] of Object.entries(formData)) {
			let s = game.settings.settings.get(`chat-tabs.${k}`);
			let current = game.settings.get(s.namespace, s.key);
			if (v === current) continue;
			const requiresClientReload = s.scope === "client" && s.requiresReload;
			const requiresWorldReload = s.scope === "world" && s.requiresReload;
			await game.settings.set(s.namespace, s.key, v);
			if (requiresClientReload || requiresWorldReload) {
				SettingsConfig.reloadConfirm({ world: requiresWorldReload });
			}
		}
	}
}
