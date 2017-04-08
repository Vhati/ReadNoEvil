RNE.logging.setVerbosity(RNE.logging.Level.DEBUG);



toastr.options.positionClass = "toast-bottom-right";
toastr.options.escapeHtml = true;
toastr.options.timeOut = "2500";



var UpstreamType = {};

UpstreamType.APP_COLUMNS = {     // Regular columns.
	name: "APP_COLUMNS",

	dredgeSelector: "div#container > div.app-columns",
	unique: true,
	subtree: false
};

UpstreamType.SEARCH_PREVIEW = {  // The preview seen when preparing to add a search.
	name: "SEARCH_PREVIEW",

	dredgeSelector: "div.app-search-tweet-results",
	unique: true,
	subtree: false
};



var StreamType = {};

/**
 * A "section.js-column > div.column-holder" has div.column-panel (regular stream)
 * and div.column-detail (detailed tweet and replies). The latter is populated when
 * a regular tweet is clicked.
 *
 * No need to track those separately.
 */
StreamType.COLUMN = {
	name: "COLUMN",

	dredgeSelector: "section.js-column",

	testNode: function(node) {
		if (node.nodeName.match(/\bsection\b/i) && node.classList.contains("js-column")) return true;
		return false;
	}
};



var ItemType = {};

ItemType.TWEET = {
	name: "TWEET",

	dredgeSelector: "article.stream-item",

	_getEllipsisLink: function(node) {
		return node.querySelector(":scope > div.item-box div.tweet > footer.tweet-footer a.tweet-action[rel='actionsMenu'][data-user-id]");
	},

	_getPrimaryUserId: function(node) {
		var ellipsisLink = this._getEllipsisLink(node);
		return (ellipsisLink != null ? ellipsisLink.getAttribute("data-user-id") : null) || null;
	},

	_getScreenName: function(node) {
		var nameSpan = node.querySelector(":scope > div.item-box div.tweet > header.tweet-header span.username");
		return (nameSpan != null ? nameSpan.textContent.replace(/@/, "") : null) || null;
	},

	testNode: function(node) {
		// In notifications columns, div.tweet is often wrapped in span.txt-mute.

		if (node.nodeName.match(/\barticle\b/i) && node.classList.contains("stream-item")) {

			if (this._getEllipsisLink(node) == null) return false;
			if (this._getScreenName(node) == null) return false;

			return true;
		}
		return false;
	},

	scrapeUsers: function(node) {
		var primaryUserId = null;
		userIds = [];

		var userId = this._getPrimaryUserId(node);
		if (userId) {
			primaryUserId = userId;
			userIds.push(userId);
		}

		// Quoted tweets have no userId. :/
		//var quoteTweetDiv = node.querySelector(":scope > div.item-box div.tweet > div.tweet-body > div.quoted-tweet");

		return {"primaryUserId":primaryUserId, "userIds":userIds};
	},

	setRedacted: function(node, b) {
		var methodName = (b ? "add" : "remove");
		node.classList[methodName]("rne-tweetdeck-tweet-redacted");
	},

	/**
	 * Returns true if a given element is the ellipsis link that triggers the dropdown menu.
	 *
	 * @param {HTMLElement} itemNode
	 * @param {HTMLElement} candidateNode
	 */
	testMenu: function(itemNode, candidateNode) {
		var ellipsisLink = this._getEllipsisLink(itemNode);
		var menuDiv = ellipsisLink.parentElement.querySelector(":scope > div.js-dropdown");
		return (menuDiv === candidateNode);
	},

	decorateMenu: function(itemNode) {
		// The dropdown menu's content is short-lived. No need to undecorate later.

		// The ellipsis link and dropdown menu are siblings. Go up a level.
		var ellipsisLink = this._getEllipsisLink(itemNode);
		var menuParentNode = ellipsisLink.parentElement;

		// Tweets you wrote have no 'Block'.
		var nativeBlockLink = menuParentNode.querySelector("li.is-selectable > a[data-action='block']");
		if (nativeBlockLink != null) {
			var nativeBlockWrapper = nativeBlockLink.parentElement;
			var menuActionsList = nativeBlockWrapper.parentElement;

			if (!menuActionsList.classList.contains("rne-decorated")) {
				menuActionsList.classList.add("rne-decorated");

				nativeBlockWrapper.classList.add("rne-suppressed");
				var userId = this._getPrimaryUserId(itemNode);
				var screenName = this._getScreenName(itemNode);

				var newNodes = [];
				var blockTree = menubuilder.createBlockMenuItem(userId, screenName);
				newNodes.push(blockTree.root);

				var unblockTree = menubuilder.createUnblockMenuItem(userId, screenName);
				newNodes.push(unblockTree.root);

				menubuilder.insertSiblingsAfter(nativeBlockWrapper, newNodes);
			}
		}
	}
};

ItemType.ACCOUNT_ACTIVITY = {  // Account event (e.g., someone's new follower).
	name: "ACCOUNT_ACTIVITY",

	dredgeSelector: "article.stream-item",

	_getAcctActionsBtn: function(node) {
		return node.querySelector(":scope > div.item-box div.account-summary > div.with-dropdown > button.js-user-actions-menu[data-user-id]");
	},

	_getPrimaryUserId: function(node) {
		var acctActionsBtn = this._getAcctActionsBtn(node);
		return (acctActionsBtn != null ? acctActionsBtn.getAttribute("data-user-id") : null) || null;
	},

	_getScreenName: function(node) {
		var nameLink = node.querySelector(":scope > div.item-box div.account-summary > div.account-summary-text a.account-link[data-user-name]");
		return (nameLink != null ? nameLink.getAttribute("data-user-name") : null) || null;
	},

	testNode: function(node) {
		if (node.nodeName.match(/\barticle\b/i) && node.classList.contains("stream-item")) {

			if (this._getAcctActionsBtn(node) == null) return false;
			if (this._getScreenName(node) == null) return false;

			return true;
		}
		return false;
	},

	scrapeUsers: function(node) {
		var primaryUserId = null;
		userIds = [];

		var userId = this._getPrimaryUserId(node);
		if (userId) {
			primaryUserId = userId;
			userIds.push(userId);
		}

		return {"primaryUserId":primaryUserId, "userIds":userIds};
	},

	setRedacted: function(node, b) {
		var methodName = (b ? "add" : "remove");
		node.classList[methodName]("rne-tweetdeck-account-activity-redacted");
	},

	testMenu: function(itemNode, candidateNode) {
		var acctActionsBtn = this._getAcctActionsBtn(node);
		var menuDiv = acctActionsBtn.parentElement.querySelector(":scope > div.js-dropdown");
		return (menuDiv === candidateNode);
	},

	decorateMenu: function(itemNode) {
		// The dropdown menu's content is short-lived. No need to undecorate later.

		// The ellipsis link and dropdown menu are siblings. Go up a level.
		var acctActionsBtn = this._getAcctActionsBtn(itemNode);
		var menuParentNode = acctActionsBtn.parentElement;

		var nativeBlockLink = menuParentNode.querySelector("li.is-selectable > a[data-action='block']");
		if (nativeBlockLink != null) {
			var nativeBlockWrapper = nativeBlockLink.parentElement;
			var menuActionsList = nativeBlockWrapper.parentElement;

			if (!menuActionsList.classList.contains("rne-decorated")) {
				menuActionsList.classList.add("rne-decorated");

				nativeBlockWrapper.classList.add("rne-suppressed");
				var userId = this._getPrimaryUserId(itemNode);
				var screenName = this._getScreenName(itemNode);

				var newNodes = [];
				var blockTree = menubuilder.createBlockMenuItem(userId, screenName);
				newNodes.push(blockTree.root);

				var unblockTree = menubuilder.createUnblockMenuItem(userId, screenName);
				newNodes.push(unblockTree.root);

				menubuilder.insertSiblingsAfter(nativeBlockWrapper, newNodes);
			}
		}
	}
};



menubuilder = {
	_toggleSelected: function(e) {
		e.target.classList[e.type == "mouseover" ? "add" : "remove"]("is-selected");
	},

	createMenuItem: function() {
		var wrapper = document.createElement("li");
		wrapper.classList.add("rne-added");
		wrapper.classList.add("is-selectable");
		wrapper.addEventListener("mouseover", this._toggleSelected);
		wrapper.addEventListener("mouseout", this._toggleSelected);

		link = document.createElement("a");
		link.href = "#";
		link.setAttribute("data-action", "nop");  // Dummy attribute to qualify for native style.
		wrapper.appendChild(link);

		return {"root":wrapper, "link":link};
	},

	createBlockMenuItem: function(userId, screenName) {
		var blockTree = this.createMenuItem();
		blockTree.link.textContent = "Block"+ (screenName ? " @"+ screenName : "") +" in RNE";
		blockTree.link.setAttribute("data-rne-action", "block");
		blockTree.link.setAttribute("data-user-id", userId);
		if (screenName) blockTree.link.setAttribute("data-user-name", screenName);
		return blockTree;
	},

	createUnblockMenuItem: function(userId, screenName) {
		var unblockTree = this.createMenuItem();
		unblockTree.link.textContent = "Unblock"+ (screenName ? " @"+ screenName : "") +" in RNE";
		unblockTree.link.setAttribute("data-rne-action", "unblock");
		unblockTree.link.setAttribute("data-user-id", userId);
		if (screenName) unblockTree.link.setAttribute("data-user-name", screenName);
		return unblockTree;
	},

	/**
	 * Inserts a list of new nodes into a parent after an existing reference point.
	 *
	 * @param {HTMLElement} refNode
	 * @param {HTMLElement[]} newNodes
	 */
	insertSiblingsAfter: function(refNode, newNodes) {
		for (var i=newNodes.length-1; i >= 0; i--) {
			refNode.parentElement.insertBefore(newNodes[i], refNode.nextSibling);
		}
	}
};



function injectedMenuHandler(e) {
	if (e.type != "click") return;

	var rneAction = e.target.getAttribute("data-rne-action");
	if (!rneAction) return;

	if (rneAction == "block" || rneAction == "unblock") {
		var userId = e.target.getAttribute("data-user-id") || null;        // This null is bad.
		var screenName = e.target.getAttribute("data-user-name") || null;  // This null will be tolerated.

		if (userId) {
			if (rneAction == "block") {
				backgroundPort.postMessage({"type":"request_block", "user_id":userId, "screen_name":screenName});
			} else {
				backgroundPort.postMessage({"type":"request_unblock", "user_id":userId, "screen_name":screenName});
			}
		}
		else {
			toastr.error("Nothing happened. The id for "+ (screenName ? "@"+ screenName : "that user") +" could not be determined.", "", {"timeOut":"6000"});
		}
	}
	e.stopPropagation();
}



function streamNodeAddedHandler(addedNode) {
	if (contentState["hooking_menus"] && addedNode.classList && addedNode.classList.contains("js-dropdown")) {
		var typeObjs = [ItemType.TWEET, ItemType.ACCOUNT_ACTIVITY];

		var ancestorNode = addedNode.parentElement;
		while (ancestorNode != null) {
			var decorated = false;
			for (var j=0; j < typeObjs.length; j++) {
				if (typeObjs[j].testNode(ancestorNode)) {
					typeObjs[j].decorateMenu(ancestorNode);
					decorated = true;
					break;
				}
			}
			if (decorated) return true;

			ancestorNode = ancestorNode.parentElement;
		}
	}
	return false;
}



RNE.registry.setUpstreamTypes([UpstreamType.APP_COLUMNS, UpstreamType.SEARCH_PREVIEW]);
RNE.registry.setStreamTypes([StreamType.COLUMN]);
RNE.registry.setItemTypes([ItemType.TWEET, ItemType.ACCOUNT_ACTIVITY]);

RNE.registry.setStreamNodeAddedHandler(streamNodeAddedHandler);

RNE.registry.setNewUsersCallback(function(newUserIds) {
	backgroundPort.postMessage({"type":"test_users_evilness", "userIds":newUserIds});
});



/**
 * Tries to get this script into an inert state, in case of emergency.
 */
function panic() {
	document.documentElement.removeEventListener("click", injectedMenuHandler);

	RNE.registry.panic();

	if (contentState["app_observer"]) {
		contentState["app_observer"].disconnect();
	}

	// Remove all injected nodes.
	var injectedNodes = document.querySelectorAll(".rne-added");
	for (var i=0; i < injectedNodes.length; i++) {
		var injectedNode = injectedNodes[i];
		if (injectedNode.parentElement) injectedNode.parentElement.removeChild(injectedNode);
	}
}



/**
 * Initializes page-change monitoring (call only once).
 *
 * Navigation on Tweetdeck doesn't *really* leave the current page. It swaps
 * out contents. Normally scripts would overlook this, only kicking in if
 * you directly visit a url or reload the page.
 *
 * Even reloading the page, columns aren't present initially. DOM must
 * be monitored for their delayed appearance.
 *
 * When the page has changed, the new DOM will be examined, and any
 * clutter from past meddling will be removed.
 */
function contentInit() {
	RNE.logging.info("Tweetdeck content script started");

	var appDiv = document.querySelector("div.application");
	if (appDiv == null) {
		RNE.logging.info("No application div!? Aborting");
		return;
	}

	document.addEventListener("visibilitychange", deferredInit, false);
	deferredInit();

	setStylesheet("tweetdeck-blank.css");

	RNE.registry.registerAllUpstreams();

	if (RNE.registry.getUpstreamCount() > 0) {
		RNE.logging.info("Tweetdeck page with upstreams loaded");

		backgroundPort.postMessage({"type":"init_content"});
	}
	else {
		RNE.logging.info("No upstreams present, idling");
	}

	contentState["app_observer"] = new MutationObserver(function(mutations) {
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
				RNE.logging.info("Tweetdeck page content changed, now has upstreams");

				backgroundPort.postMessage({"type":"init_content"});
			}
			else {
				RNE.logging.info("Tweetdeck page content changed, no upstreams present");
			}
		}
	});
	var appCfg = {childList:true, attributes:false, characterData:false, subtree:false};
	contentState["app_observer"].observe(appDiv, appCfg);
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
contentState["hooking_menus"] = false;
contentState["app_observer"] = null;



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
		else if (message.type == "set_redacting_tweetdeck") {
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
			var cssFiles = {"blank":"tweetdeck-blank.css", "faded":"tweetdeck-faded.css"};
			var cssFile = (cssFiles.hasOwnProperty(name) ? cssFiles[name] : cssFiles["blank"]);
			setStylesheet(cssFile);
		}
		else if (message.type == "set_hooking_menus") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);
			contentState["hooking_menus"] = b;

			var methodName = (b ? "addEventListener" : "removeEventListener");
			document.documentElement[methodName]("click", injectedMenuHandler);
			// TODO: Scour the DOM to undo injected/suppressed elements.
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
