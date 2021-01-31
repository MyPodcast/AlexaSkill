const Logger = require("js-logger");

Logger.useDefaults({
	defaultLevel: Logger.DEBUG,
	formatter: function (messages, context) {
		messages.unshift(`[${context.level.name}]`);
	},
});

module.exports = Logger;
