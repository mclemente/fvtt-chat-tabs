# Customizable Chat Tabs

Splits the Chatlog into tabs that can be customized.

You can set the message types that will show up on each tab, and you can set messages to be exclusive to the tabs they're being posted.

![](https://camo.githubusercontent.com/c9488694f8ea5c0b153257e894a0bd114fd4e02411c81b49f5aef4ddce554df8/68747470733a2f2f63646e2e646973636f72646170702e636f6d2f6174746163686d656e74732f313130363333383731353434373539393136352f313130363733323936303434343538383039322f416e696d6163616f31302e676966)

## To integrate with Customizable Chat Tabs
Your module should call on `init` hook `window.tabbedchat.register(key: string, name?: string, desctipion?: string)` function.

Arguments:\
- `key` - name of you module
- `name` - user friendly name. It will show in settings
- `description` - Some additional text under module name in settings

Example:
```javascript
Hooks.on("init", () => {
  window.tabbedchat.register('custom-module', 'Custom module', 'My custom module')
});
```

Any messages that your module will create should have flag "module" with key you have been used in `register` function. That messages would respect tab settings for your module.
```javascript
await ChatMessage.create({ 
    content: 'Hello world',
    flags: { module: 'custom-module' } 
});
```

## Attribution
This is a fork of [Tabbed Chatlog](https://github.com/cswendrowski/FoundryVTT-Tabbed-Chatlog).
