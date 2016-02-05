var RNE = RNE || {};

RNE.logging = RNE.logging || (function() {
	// Private
	var consoleMethods = [
		{level:"NONE", nativeName:"log", localName:"log"},
		{level:"ERROR", nativeName:"error", localName:"error"},
		{level:"WARNING", nativeName:"warn", localName:"warning"},
		{level:"NOTICE", nativeName:"log", localName:"notice"},
		{level:"INFO", nativeName:"log", localName:"info"},
		{level:"DEBUG", nativeName:"log", localName:"debug"},
		{level:"TRACE", nativeName:"log", localName:"trace"}
	];

	var verbosity;
	var backgroundConsole = false;


	// Public
	var pub = {};


	/** NONE, ERROR, WARNING, NOTICE, INFO, DEBUG, TRACE */
	pub.Level = {};
	for (var i=0; i < consoleMethods.length; i++) {
		pub.Level[consoleMethods[i].level] = i;
	}

	/**
	 * Sets the maximum verbosity level worth logging.
	 *
	 * @param {Number} level - One of the constants in RNE.logging.Level.
	 */
	pub.setVerbosity = function(level) {
		verbosity = level;

		var pubNames = ["log", "error", "warning", "notice", "info", "debug", "trace"];
		for (var i=0; i < pubNames.length; i++) {
			var pubName = pubNames[i];
			var nativeName;
			if (pubName == "error") {
				nativeName = "error";
			} else if (pubName == "warning") {
				nativeName = "warn";
			} else nativeName = "log";

			if (i <= verbosity) {
				var con = (backgroundConsole ? chrome.extension.getBackgroundPage().console : window.console);

				pub[pubName] = con[nativeName].bind(con);
			} else {
				pub[pubName] = function() {};
			}
		}
	};

	/**
	 * Toggles whether to redirect logs to the background page's console.
	 *
	 * Content scripts aren't allowed to set this to true.
	 * Background scripts don't need to bother with this.
	 *
	 * @param {Boolean} b
	 */
	pub.setUseBackgroundConsole = function(b) {
		backgroundConsole = b;
		pub.setVerbosity(verbosity);
	};


	pub.setVerbosity(pub.Level["DEBUG"]);

	return pub;
})();
