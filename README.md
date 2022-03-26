# Lua loader for Node.js

## Usage

You can load the lua file directly using `node --loader ./lua-loader.js hello-world.lua`,
or alternatively using `require`/`import` in a JS file

```js
import "some-lua-script.lua";
```

This is not meant to be useful, it's just a proof of concept and demo for node's
loaders API and it serves no purpose besides running simple lua programs.
