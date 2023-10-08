![GitHub release](https://img.shields.io/github/release-date/mclemente/fvtt-chat-tabs)
![GitHub release (latest by SemVer and asset)](https://img.shields.io/github/downloads/mclemente/fvtt-chat-tabs/latest/module.zip)

[![ko-fi](https://img.shields.io/badge/ko--fi-Support%20Me-red?style=flat-square&logo=ko-fi)](https://ko-fi.com/mclemente)


# Customizable Chat Tabs

Splits the Chatlog into tabs that can be customized.

You can set the message types that will show up on each tab, and you can set messages to be exclusive to the tabs they're being posted.

![](https://camo.githubusercontent.com/c9488694f8ea5c0b153257e894a0bd114fd4e02411c81b49f5aef4ddce554df8/68747470733a2f2f63646e2e646973636f72646170702e636f6d2f6174746163686d656e74732f313130363333383731353434373539393136352f313130363733323936303434343538383039322f416e696d6163616f31302e676966)

## Integration

Your module should hook on the `chat-tabs.init` hook and call on the `game.chatTabs.register()` function.

Example:

```javascript
Hooks.on("chat-tabs.init", () => {
	const data = {
		key: "custom-module",
		label: "Custom Module Messages", // Optional, if key is the module's id, its title will be used. Otherwise, defaults to the key value.
		hint: "Custom Module's messages which are sent when something happens.", // Optional
	};
	game.chatTabs.register(data);
});
```

Any messages created by your module should include a "chat-tabs" flag with a "module" property that matches the registered key. These will show up on the tabs the users have set to be shown.

```javascript
await ChatMessage.create({
	content: "Hello world",
	flags: {
		"chat-tabs": {
			module: "custom-module",
		},
	},
});
```

## Attribution

This is a fork of [Tabbed Chatlog](https://github.com/cswendrowski/FoundryVTT-Tabbed-Chatlog).
