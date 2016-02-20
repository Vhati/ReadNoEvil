RNE.logging.setVerbosity(RNE.logging.Level.DEBUG);



toastr.options.positionClass = "toast-bottom-right";
toastr.options.escapeHtml = true;
toastr.options.timeOut = "2500";



var UpstreamType = {};

UpstreamType.TIMELINE = {
	name: "TIMELINE",

	dredgeSelector: "div#timeline",
	unique: true,
	subtree: true
}

UpstreamType.PERMALINK_OVERLAY = {  // Note: ol#stream-items-id is NOT unique!
	name: "PERMALINK_OVERLAY",

	dredgeSelector: "div.PermalinkOverlay-body",
	unique: true,
	subtree: true
}



var StreamType = {};

StreamType.NAV_STREAM = {
	name: "NAV_STREAM",

	dredgeSelector: "ol.js-navigable-stream",

	testNode: function(node) {
		if (node.classList.contains("js-navigable-stream")) return true;
		return false;
	}
};



var ItemType = {};

ItemType.TWEET = {
	name: "TWEET",

	dredgeSelector: "div.tweet",

	testNode: function(node) {
		if (node.nodeName.match(/\bdiv\b/i) && node.classList.contains("tweet") && node.hasAttribute("data-user-id")) {
			var contentDiv = node.querySelector(":scope > div.content");
			if (contentDiv != null) return true;
		}
		return false;
	},

	scrapeUsers: function(node) {
		var primaryUserId = null;  // A tweet's author will be the primary userId.
		var userIds = [];

		var origTweetDiv = node;
		var userId = origTweetDiv.getAttribute("data-user-id")
		if (userId) {
			primaryUserId = ""+ userId;
			userIds.push(""+ userId);
		}

		var quoteTweetDiv = node.querySelector("div.QuoteTweet-innerContainer[data-user-id]");
		if (quoteTweetDiv != null) {
			var userId = quoteTweetDiv.getAttribute("data-user-id");
			if (userId) {
				userIds.push(""+ userId);
			}
		}

		return {"primaryUserId":primaryUserId, "userIds":userIds};
	},

	setRedacted: function(node, b) {
		var methodName = (b ? "add" : "remove");
		node.classList[methodName]("rne-vanilla-tweet-redacted");
	}
};

ItemType.PROFILE_CARD = {
	name: "PROFILE_CARD",

	dredgeSelector: "div.ProfileCard",

	testNode: function(node) {
		if (node.nodeName.match(/\bdiv\b/i) && node.classList.contains("ProfileCard") && node.hasAttribute("data-user-id")) {
			var bioDiv = node.querySelector(":scope > div.ProfileCard-content p.ProfileCard-bio");
			if (bioDiv != null) return true;
		}
		return false;
	},

	scrapeUsers: function(node) {
		var primaryUserId = null;
		var userIds = [];

		var userId = node.getAttribute("data-user-id")
		if (userId) {
			primaryUserId = ""+ userId;
			userIds.push(""+ userId);
		}

		return {"primaryUserId":primaryUserId, "userIds":userIds};
	},

	setRedacted: function(node, b) {
		var methodName = (b ? "add" : "remove");
		node.classList[methodName]("rne-vanilla-profile-card-redacted");
	}
};



/**
 * A MutationObserver callback watching the document for data-you-block attribute changes.
 */
function youBlockMutationCallback(mutations) {
	var seenYouBlocks = null;
	mutations.forEach(function(mutation) {
		if (mutation.attributeName != "data-you-block") return;
		var node = mutation.target;

		var newValue = node.getAttribute(mutation.attributeName);
		if (newValue === mutation.oldValue) return;  // Fires twice: old != new, then new == new!?

		var youBlock = (newValue === "true" ? true : (newValue === "false" ? false : null));
		if (youBlock == null) return;

		if (seenYouBlocks == null) seenYouBlocks = {};

		var userId = node.getAttribute("data-user-id") || null;          // This null is bad.
		if (!userId || seenYouBlocks[userId] === youBlock) return;
		seenYouBlocks[userId] = youBlock;

		var screenName = node.getAttribute("data-screen-name") || null;  // This null will be tolerated.

		RNE.logging.debug("A you-block flag changed"+ (screenName ? " for @"+ screenName : "") +" (userId: "+ userId +"): "+ youBlock);
		var evilnessResults = {};
		evilnessResults[userId] = youBlock;
		backgroundPort.postMessage({"type":"set_users_evilness", "value":evilnessResults});
	});
}



RNE.registry.setUpstreamTypes([UpstreamType.TIMELINE, UpstreamType.PERMALINK_OVERLAY]);
RNE.registry.setStreamTypes([StreamType.NAV_STREAM]);
RNE.registry.setItemTypes([ItemType.TWEET, ItemType.PROFILE_CARD]);

RNE.registry.setStreamNodeAddedHandler(null);

RNE.registry.setNewUsersCallback(function(newUserIds) {
	backgroundPort.postMessage({"type":"test_users_evilness", "userIds":newUserIds});
});



/**
 * Tries to get this script into an inert state, in case of emergency.
 */
function panic() {
	contentState["you_block_observer"].disconnect();

	RNE.registry.panic();

	if (contentState["nav_observer"]) {
		contentState["nav_observer"].disconnect();
	}
}



/**
 * Initializes page-change monitoring (call only once).
 *
 * Navigation on Twitter doesn't *really* leave the current page. It swaps
 * out contents. Normally scripts would overlook this, only kicking in if
 * you directly visit a url or reload the page.
 *
 * When the page has changed, the new DOM will be examined, and any
 * clutter from past meddling will be removed.
 */
function contentInit() {
	RNE.logging.info("Twitter content script started");

	var navDiv = document.querySelector("div#page-container");
	if (navDiv == null) {
		RNE.logging.info("No page-container div!? Aborting");
		return;
	}

	document.addEventListener("visibilitychange", deferredInit, false);
	deferredInit();

	setStylesheet("vanilla-blank.css");

	RNE.registry.registerAllUpstreams();

	if (RNE.registry.getUpstreamCount() > 0) {
		RNE.logging.info("Twitter page with upstreams loaded");

		backgroundPort.postMessage({"type":"init_content"});
	}
	else {
		RNE.logging.info("No upstreams present, idling");
	}

	contentState["nav_observer"] = new MutationObserver(function(mutations) {
		var pageChanged = false;

		mutations.forEach(function(mutation) {
			if (mutation.type === "childList") pageChanged = true;
		});

		if (pageChanged) {
			if (RNE.registry.getUpstreamCount() > 0) {
				RNE.registry.setRedacting(false);
				RNE.registry.clearAllItemsRedaction(null);
				RNE.registry.unregisterAllUpstreams();
			}

			RNE.registry.registerAllUpstreams();

			if (RNE.registry.getUpstreamCount() > 0) {
				RNE.logging.info("Twitter page content changed, now has upstreams");

				backgroundPort.postMessage({"type":"init_content"});
			}
			else {
				RNE.logging.info("Twitter page content changed, no upstreams present");
			}
		}
	});
	var navCfg = {"childList":true, "attributes":false, "characterData":false, "subtree":false};
	contentState["nav_observer"].observe(navDiv, navCfg);
}

/**
 * Runs extra init stuff only if the document is visible.
 *
 * Typing a url into a blank tab may result in a 'pre-rendered' page
 * that doesn't immediately exist. The tabId will be invalid, which will
 * break pageAction.Show() "Unchecked runtime.lastError ... No tab with id".
 *
 * document.visibilityState phases: prerender, hidden, visible.
 *
 * Registering this as an event handler, then calling it immediately, will
 * ensure it runs - either now or after a brief delay.
 */
function deferredInit() {
	if (document.visibilityState == "visible") {
		document.removeEventListener("visibilitychange", deferredInit, false);

		backgroundPort.postMessage({"type":"show_page_action"});
	}
}



/**
 * Replaces the redaction stylesheet with another file.
 *
 * @param {string} cssFile - A path to the css file, relative to the extension's root.
 */
function setStylesheet(cssFile) {
	var oldLink = document.querySelector("link#rne-stylesheet");
	if (oldLink != null) document.getElementsByTagName("head")[0].removeChild(oldLink);

	var newLink = document.createElement("link");
	newLink.id = "rne-stylesheet";
	newLink.href = chrome.extension.getURL(cssFile);
	newLink.type = "text/css";
	newLink.rel = "stylesheet";
	document.getElementsByTagName("head")[0].appendChild(newLink);
}



var contentState = {};
contentState["you_block_observer"] = new MutationObserver(youBlockMutationCallback);
contentState["nav_observer"] = null;



var backgroundPort = chrome.runtime.connect({"name":"content"});

backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (RNE.registry.getUpstreamCount() == 0) return;  // No upstreams, ignore all messages.

		if (message.type == "reset_evilness") {
			RNE.logging.debug("Message received: "+ message.type);
			RNE.registry.resetUsersEvilness();
			RNE.registry.clearAllItemsRedaction(null);

			var userIds = RNE.registry.getRegisteredUsers();
			backgroundPort.postMessage({"type":"test_users_evilness","userIds":userIds});
		}
		else if (message.type == "set_users_evilness") {
			//RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			for (key in message.value) {
				if (!message.value.hasOwnProperty(key)) continue;

				var userId = key;
				var evilness = message.value[key];
				RNE.registry.setUserEvilness(userId, evilness);
				RNE.registry.updateAllItemsRedaction({"userId":userId});
			}
		}
		else if (message.type == "set_redact_all") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);

			if (b != RNE.registry.isRedactAll()) {
				RNE.registry.setRedactAll(b);
			}
		}
		else if (message.type == "set_redacting_vanilla") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);
			if (b && b != RNE.registry.isRedacting()) {
				// Monitor if not already doing so and redact.
				RNE.registry.setRedacting(true);
				RNE.registry.registerAllStreams();
				RNE.registry.updateAllItemsRedaction(null);
			} else if (b == false) {
				// Stop monitoring and clear redaction.
				RNE.registry.setRedacting(false);
				RNE.registry.clearAllItemsRedaction(null);
				RNE.registry.unregisterAllStreams();
			}
		}
		else if (message.type == "set_redaction_style") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var name = message.value;
			var cssFiles = {"blank":"vanilla-blank.css", "faded":"vanilla-faded.css"};
			var cssFile = (cssFiles.hasOwnProperty(name) ? cssFiles[name] : cssFiles["blank"]);
			setStylesheet(cssFile);
		}
		else if (message.type == "set_observing_you_block") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);

			if (b) {
				var youBlockCfg = {"childList":false, "attributes":true, "characterData":false, "subtree":true, "attributeFilter":["data-you-block"], "attributeOldValue":true};
				contentState["you_block_observer"].observe(document.documentElement, youBlockCfg);
			} else {
				contentState["you_block_observer"].disconnect();
			}
		}
		else if (message.type == "toast") {
			if (message.style == "error") {
				toastr.error(message.text, "", {"timeOut":"10000"});
			} else if (message.style == "info") {
				toastr.info(message.text);
			} else {
				toastr.success(message.text);
			}
		}
	}
);

// Content scripts are left running when the extension is reloaded/updated.
backgroundPort.onDisconnect.addListener(function() {
	RNE.logging.warning("Connection lost to background script! The page needs reloading.");

	var message = "ReadNoEvil stopped running while it had a script injected here.<br/><br/>";
	message += "Until this page is reloaded, it may be unstable."

	var optionsOverride = {
		positionClass: "toast-top-right",
		escapeHtml: false,
		timeOut: "0"
	}
	toastr.error(message, "", optionsOverride);

	panic();
});



contentInit();
