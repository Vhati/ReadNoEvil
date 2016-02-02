var RNE = RNE || {};

RNE.logging = RNE.logging || (function() {
	var levels = {
		NONE: 0,
		ERROR: 1,
		WARNING: 2,
		NOTICE: 3,
		INFO: 4,
		DEBUG: 5,
		TRACE: 6
	};

	// Private
	var verbosity = levels["DEBUG"];
	var backgroundConsole = false;

	// Public
	return {
		/**
		 * NONE, ERROR, WARNING, NOTICE, INFO, DEBUG, TRACE.
		 */
		Level: levels,

		/**
		 * Toggles whether to redirect logs to the background page's console.
		 *
		 * Content scripts aren't allowed to set this to true.
		 * Background scripts don't need to bother with this.
		 *
		 * @param {Boolean} b
		 */
		setUseBackgroundConsole: function(b) {
			backgroundConsole = b;
		},

		/**
		 * Sets the maximum verbosity level worth logging.
		 *
		 * @param {Number} level - One of the constants in RNE.logging.Level.
		 */
		setVerbosity: function(level) {
			verbosity = level;
		},

		/**
		 * Logs a message.
		 *
		 * @param {string} message
		 * @param {Number} level - One of the constants in RNE.logging.Level.
		 */
		log: function(message, level) {
			if (verbosity >= level) {
				var con = (backgroundConsole ? chrome.extension.getBackgroundPage().console : console);

				if (level == levels["ERROR"]) {
					con.error(message);
				}
				else if (level == levels["WARNING"]) {
					con.warn(message);
				}
				else {
					con.log(message);
				}
			}
		},

		error: function(message) {
			RNE.logging.log(message, levels["ERROR"]);
		},
		warning: function(message) {
			RNE.logging.log(message, levels["WARNING"]);
		},
		notice: function(message) {
			RNE.logging.log(message, levels["NOTICE"]);
		},
		info: function(message) {
			RNE.logging.log(message, levels["INFO"]);
		},
		debug: function(message) {
			RNE.logging.log(message, levels["DEBUG"]);
		},
		trace: function(message) {
			RNE.logging.log(message, levels["TRACE"]);
		}

	};
})();
