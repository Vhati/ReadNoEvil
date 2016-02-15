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
		return node.querySelector(":scope > div.item-box div.tweet > div.tweet-body > footer.tweet-footer a.tweet-action[rel='actionsMenu'][data-user-id]");
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



/**
 * A MutationObserver callback watching ancestors for added/removed streams.
 */
function upstreamMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				var dredgedStreams = dredgeStreams(addedNode);

				for (var j=0; j < dredgedStreams.length; j++) {
					var dredgedStream = dredgedStreams[j];

					var streamInfo = registerStream(dredgedStream.node, dredgedStream.type);
					updateAllItemsRedaction({"streamInfo":streamInfo});
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				var dredgedStreams = dredgeStreams(removedNode);

				for (var j=0; j < dredgedStreams.length; j++) {
					var dredgedStream = dredgedStreams[j];

					var streamInfo = getStreamInfo(removedNode);

					if (streamInfo != null) {
						streamInfo.observer.disconnect();
						clearAllItemsRedaction({"streamInfo":streamInfo});
						unregisterStream(streamInfo);
					}
				}
			}
		}
	});
}

/**
 * A MutationObserver callback watching streams for added/removed items.
 *
 * A section.js-column > div.column-holder has div.column-panel (regular stream)
 * and div.column-detail (expanded detailed tweet and replies). The latter is
 * populated when a regular tweet is clicked.
 */
function streamMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

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
						if (decorated) break;

						ancestorNode = ancestorNode.parentElement;
					}
				}
				else {
					var dredgedItems = dredgeInterestingItems(addedNode);

					for (var j=0; j < dredgedItems.length; j++) {
						var dredgedItem = dredgedItems[j];

						var itemInfo = registerItem(dredgedItem.node, dredgedItem.type);

						// Redact if a user is already known to be evil (or redact_all).
						if (itemInfo != null && (contentState["redact_all"] || isItemTainted(itemInfo))) {
							setItemRedacted(itemInfo, true);
						}
					}
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				var interestingItems = dredgeInterestingItems(removedNode);

				for (var j=0; j < interestingItems.length; j++) {
					var dredgedItem = interestingItems[j];

					var itemInfo = getItemInfo(dredgedItem.node);

					if (itemInfo != null) {
						setItemRedacted(itemInfo, false);
						unregisterItem(itemInfo);
					}
				}
			}
		}
	});
}



/**
 * Returns the type of a stream-item node, based on DOM structure.
 *
 * @param {HTMLElement} node - A stream-item element.
 * @returns {string} - An ItemType name, or null.
 */
function getItemType(node) {
	var typeObjs = [ItemType.TWEET, ItemType.ACCOUNT_ACTIVITY];

	for (var i=0; i < typeObjs.length; i++) {
		var typeObj = typeObjs[i];

		if (typeObj.testNode(node)) return typeObj.name;
	}

	return null;
}

/**
 * Returns info about nested stream elements worth registering.
 *
 * MutationObservers watching subtrees aren't notified about *every* tag, just
 * the highest-level ones.
 *
 * @param {HTMLElement} node - An ancestor to search within.
 * @returns {object[]} - A list of {node:HTMLElement, type:string}
 */
function dredgeStreams(node) {
	var results = [];
	if (!node.querySelectorAll) return results;

	var typeObjs = [StreamType.COLUMN];

	for (var i=0; i < typeObjs.length; i++) {
		var typeObj = typeObjs[i];

		if (typeObj.testNode(node)) {
			results.push({"node":node, "type":typeObj.name});
			return results;
			// TODO: Decide whether to return now or search for nested items?
		}
	}

	for (var i=0; i < typeObjs.length; i++) {
		var typeObj = typeObjs[i];

		var candidates = node.querySelectorAll(typeObj.dredgeSelector);
		for (var j=0; j < candidates.length; j++) {
			var candidateNode = candidates[j];
			if (typeObj.testNode(candidateNode)) {
				results.push({"node":candidateNode, "type":typeObj.name});
			}
		}
	}

	return results;
}

/**
 * Returns info about nested stream-item elements worth registering.
 *
 * MutationObservers watching subtrees aren't notified about *every* tag, just
 * the highest-level ones.
 *
 * @param {HTMLElement} node - An ancestor to search within.
 * @returns {object[]} - A list of {node:HTMLElement, type:string}
 */
function dredgeInterestingItems(node) {
	var results = [];
	if (!node.querySelectorAll) return results;

	var typeObjs = [ItemType.TWEET, ItemType.ACCOUNT_ACTIVITY];

	for (var i=0; i < typeObjs.length; i++) {
		var typeObj = typeObjs[i];

		if (typeObj.testNode(node)) {
			results.push({"node":node, "type":typeObj.name});
			return results;
			// TODO: Decide whether to return now or search for nested items?
		}
	}

	// Carve out candidates with selectors, then validate their structure.
	// TODO: Sort out nesting?

	for (var i=0; i < typeObjs.length; i++) {
		var typeObj = typeObjs[i];

		var candidates = node.querySelectorAll(typeObj.dredgeSelector);
		for (var j=0; j < candidates.length; j++) {
			var candidateNode = candidates[j];
			if (typeObj.testNode(candidateNode)) {
				results.push({"node":candidateNode, "type":typeObj.name});
			}
		}
	}

	return results;
}



/**
 * Tries to get this script into an inert state, in case of emergency.
 */
function panic() {
	document.documentElement.removeEventListener("click", injectedMenuHandler);

	for (var i=0; i < contentState["upstreams"].length; i++) {
		var upstreamInfo = contentState["upstreams"][i];
		upstreamInfo.observer.disconnect();
	}
	contentState["upstreams"] = [];

	setRedacting(false);
	clearAllItemsRedaction(null);
	unregisterAllStreams();

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
 * Resets state vars when a page loads initially or swaps out its contents.
 */
function initStateVars() {
	for (var i=0; i < contentState["upstreams"].length; i++) {
		var upstreamInfo = contentState["upstreams"][i];
		upstreamInfo.observer.disconnect();
	}
	contentState["upstreams"] = [];

	unregisterAllStreams();

	var upstreamTypeObjs = [UpstreamType.APP_COLUMNS, UpstreamType.SEARCH_PREVIEW];

	var upstreamNames = [];
	for (var i=0; i < upstreamTypeObjs.length; i++) {
		var typeObj = upstreamTypeObjs[i];
		var upstreamNodes;

		if (typeObj.unique) {
			var upstreamNode = document.querySelector(typeObj.dredgeSelector);
			upstreamNodes = upstreamNode != null ? [upstreamNode] : [];
		} else {
			upstreamNodes = document.querySelectorAll(typeObj.dredgeSelector);
		}

		for (var j=0; j < upstreamNodes.length; j++) {
			var upstreamNode = upstreamNodes[j];
			var upstreamObserver = new MutationObserver(upstreamMutationCallback);

			contentState["upstreams"].push({"node":upstreamNode, "type":typeObj.name, "observer":upstreamObserver});
		}
		if (upstreamNodes.length > 0) upstreamNames.push(typeObj.name);
	}
	if (upstreamNames.length > 0) {
		RNE.logging.debug("Upstreams present: "+ upstreamNames.join(", "));
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

	initStateVars();

	if (contentState["upstreams"].length > 0) {
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
			if (contentState["upstreams"].length > 0) {
				setRedacting(false);
				clearAllItemsRedaction(null);
				unregisterAllStreams();
			}
			initStateVars();
			if (contentState["upstreams"].length > 0) {
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
 * Caches info about a stream for looking up later.
 *
 * Streams which have already been registered will be ignored.
 * Registering a stream one or more times will also register nested stream-items.
 *
 * @param {HTMLElement} streamNode - A stream element, containing stream-item elements.
 * @param {string} streamType - A StreamType name.
 * @returns {Object} - The cached info, or null.
 */
function registerStream(streamNode, streamType) {
	RNE.logging.debug("Stream registered");

	// Enforce uniqueness.
	var streamInfo = null;
	for (var i=0; i < contentState["streams"].length; i++) {
		if (contentState["streams"][i].node === streamNode) {
			streamInfo = contentState["streams"][i];
			break;
		}
	}
	if (streamInfo == null) {
		var streamObserver = new MutationObserver(streamMutationCallback);

		streamInfo = {"node":streamNode, "type":streamType, "observer":streamObserver};
		contentState["streams"].push(streamInfo);

		if (contentState["redacting"]) {
			var streamCfg = {childList:true, attributes:false, characterData:false, subtree:true};
			streamObserver.observe(streamNode, streamCfg);
		}
	}

	var dredgedItems = dredgeInterestingItems(streamNode);
	for (var i=0; i < dredgedItems.length; i++) {
		var dredgedItem = dredgedItems[i];

		registerItem(dredgedItem.node, dredgedItem.type);
	}

	return streamInfo;
}

/**
 * Discards cached info about a stream.
 *
 * Nested stream-items will also be unregistered.
 *
 * @param {Object} streamInfo - Info which was previously cached with registerStream().
 */
function unregisterStream(streamInfo) {
	var index = contentState["streams"].indexOf(streamInfo);
	if (index == -1) return;

	streamInfo.observer.disconnect();

	for (var i=0; i < contentState["items"].length; i++) {
		if (streamInfo.node.contains(contentState["items"][i].node)) {
			unregisterItem(contentState["items"][i]);
		}
	}

	contentState["streams"].splice(index, 1);
}

/**
 * Returns cached info about a stream, or null.
 *
 * @param {HTMLElement} node - A node, which was previously cached with registerStream().
 * @returns {Object}
 */
function getStreamInfo(node) {
	for (var i=0; i < contentState["streams"].length; i++) {
		if (contentState["streams"][i].node === node) {
			return contentState["streams"][i];
		}
	}
	return null;
}

/**
 * Caches info about a stream-item for looking up later.
 *
 * New users will be checked for evilness.
 * Nodes which have already been registered will be ignored.
 *
 * @param {HTMLElement} node - An element representing a stream-item.
 * @param {string} itemType - An ItemType name.
 * @returns {Object} - The cached info, or null.
 */
function registerItem(node, itemType) {
	// Enforce uniqueness.
	var oldInfo = getItemInfo(node)
	if (oldInfo != null) return oldInfo;

	//RNE.logging.debug("Stream item registered");

	var users = getItemUsers(node, itemType);

	var itemInfo = {"node":node, "type":itemType, "primaryUserId":users.primaryUserId, "userIds":users.userIds};
	contentState["items"].push(itemInfo);

	var newUserIds = [];
	for (var i=0; i < itemInfo.userIds.length; i++) {
		var userId = itemInfo.userIds[i];
		if (userId in contentState["users"]) {
			contentState["users"][userId].count += 1;
		} else {
			contentState["users"][userId] = {"count":1, "evil":null};
			newUserIds.push(userId);
		}
	}

	if (newUserIds.length > 0) {
		backgroundPort.postMessage({"type":"test_users_evilness", "userIds":newUserIds});
	}

	return itemInfo;
}

/**
 * Discards cached info about a stream-item.
 *
 * @param {Object} itemInfo - Info which was previously cached with registerItem().
 */
function unregisterItem(itemInfo) {
	var index = contentState["items"].indexOf(itemInfo);
	if (index == -1) return;

	//RNE.logging.debug("Stream item unregistered");

	contentState["items"].splice(index, 1);

	for (var i=0; i < itemInfo.userIds.length; i++) {
		var userId = itemInfo.userIds[i];
		if (userId in contentState["users"]) {
			contentState["users"][userId].count -= 1;
		} else {
			delete contentState["users"][userId];
		}
	}
}

/**
 * Returns cached info about a stream-item, or null.
 *
 * @param {HTMLElement} node - A node, which was previously cached with registerItem().
 * @returns {Object}
 */
function getItemInfo(node) {
	for (var i=0; i < contentState["items"].length; i++) {
		if (contentState["items"][i].node === node) {
			return contentState["items"][i];
		}
	}
	return null;
}

/**
 * Returns a new list of unique author userIds among registered stream-items.
 *
 * @returns {string[]}
 */
function getRegisteredUsers() {
	var result = [];
	for (key in contentState["users"]) {
		if (!contentState["users"].hasOwnProperty(key)) continue;
		var userId = key;

		result.push(userId);
	}
	return result;
}

/**
 * Discards cached results of all user evilness tests.
 *
 * Stream-items' redaction status will be unaffected.
 */
function resetUsersEvilness() {
	for (key in contentState["users"]) {
		if (!contentState["users"].hasOwnProperty(key)) continue;
		var userId = key;

		contentState["users"][userId].evil = null;
	}
}

/**
 * Caches the result of a user evilness test for looking up later.
 *
 * @param {string} userId - The user.
 * @param {Boolean} evilness - True, false, or null.
 */
function setUserEvilness(userId, evilness) {
	if (contentState["users"].hasOwnProperty(userId)) {
		contentState["users"][userId].evil = evilness;
	}
}

/**
 * Returns the cached result of a user evilness test.
 *
 * @param {string} userId - The user.
 * @returns {Boolean} - True, false, or null.
 */
function getUserEvilness(userId) {
	if (contentState["users"].hasOwnProperty(userId)) {
		return contentState["users"][userId].evil;
	} else {
		return null;
	}
}



/**
 * Returns userIds present within a stream-item.
 *
 * @param {HTMLElement} node - An element, representing a known stream-item.
 * @param {string} type - An ItemType name.
 * @returns {Object} - {primaryUserId:string, userIds:string[]}
 */
function getItemUsers(node, itemType) {
	var primaryUserId = null;
	var userIds = [];

	if (itemType && ItemType.hasOwnProperty(itemType)) {
		return ItemType[itemType].scrapeUsers(node);
	}

	return {"primaryUserId":primaryUserId, "userIds":userIds};
}

/**
 * Returns true if a given stream-item involves a blocked user.
 *
 * @param {Object} itemInfo - Cached stream-item info.
 * @returns {Boolean}
 */
function isItemTainted(itemInfo) {
	var userIds = itemInfo.userIds;

	var evilness = false;
	for (var i=0; i < userIds.length; i++) {
		var userId = userIds[i];
		evilness = getUserEvilness(userId);

		if (evilness) break;
	}
	return evilness;
}

/**
 * Sets or clears the redaction of a single stream-item.
 *
 * @param {Object} itemInfo - Cached stream-item info.
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setItemRedacted(itemInfo, b) {
	if (itemInfo.type && ItemType.hasOwnProperty(itemInfo.type)) {
		ItemType[itemInfo.type].setRedacted(itemInfo.node, b);
	}
}

/**
 * Calls setItemRedacted on all stream-items to match users' evilness (or redact all).
 *
 * An optional filter will limit the affected items.
 *
 * @param {Object} [filter] - {[userId]:string, [streamInfo]:Object}.
 */
function updateAllItemsRedaction(filter) {
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];

		if (filter) {
			if (filter.userId && itemInfo.userIds.indexOf(filter.userId) == -1) continue;
			if (filter.streamInfo && !filter.streamInfo.node.contains(itemInfo.node)) continue;
		}

		var b = (contentState["redact_all"] || isItemTainted(itemInfo));
		setItemRedacted(itemInfo, b);
	}
}

/**
 * Clears the redaction of all registered stream-items.
 *
 * An optional filter will limit the affected items.
 *
 * @param {Object} [filter] - {[userId]:string, [streamInfo]:Object}.
 */
function clearAllItemsRedaction(filter) {
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];

		if (filter) {
			if (filter.userId && itemInfo.userIds.indexOf(filter.userId) == -1) continue;
			if (filter.streamInfo && !filter.streamInfo.node.contains(itemInfo.node)) continue;
		}

		setItemRedacted(itemInfo, false);
	}
}

/**
 * Registers all stream and stream-item elements currently present.
 */
function registerAllStreams() {
	RNE.logging.debug("Registering all streams");  // TODO: Remove me.

	for (var i=0; i < contentState["upstreams"].length; i++) {
		var upstreamInfo = contentState["upstreams"][i];

		var dredgedStreams = dredgeStreams(upstreamInfo.node);
		for (var j=0; j < dredgedStreams.length; j++) {
			var dredgedStream = dredgedStreams[j];
			registerStream(dredgedStream.node, dredgedStream.type);
		}
		// TODO: Honor upstreams' subtree attribute to scan immediate children.
	}
}

/**
 * Discards all cached stream and stream-item info.
 *
 * Stream-items' redaction status will be unaffected.
 * Call clearAllItemsRedaction(null) beforehand!
 */
function unregisterAllStreams() {
	//RNE.logging.debug("Unregistering all streams");  // TODO: Remove me.

	var i = contentState["streams"].length;
	while (i--) {
		unregisterStream(contentState["streams"][i]);
	}

	// Explicitly clear all tweet info, just to be sure.
	contentState["items"] = [];
	contentState["users"] = {};
}

/**
 * Toggles DOM monitoring to register/redact any dynamically added stream-items.
 *
 * Existing stream-items' redaction status will be unaffected.
 *
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setRedacting(b) {
	contentState["redacting"] = b;

	if (b) {
		for (var i=0; i < contentState["upstreams"].length; i++) {
			var upstreamInfo = contentState["upstreams"][i];
			var typeObj = UpstreamType[upstreamInfo.type];

			var upstreamCfg = {"childList":true, "attributes":false, "characterData":false, "subtree":typeObj.subtree};
			upstreamInfo.observer.observe(upstreamInfo.node, upstreamCfg);
		}

		for (var i=0; i < contentState["streams"].length; i++) {
			var streamInfo = contentState["streams"][i];

			var observerCfg = {childList:true, attributes:false, characterData:false, subtree:true};
			streamInfo.observer.observe(streamInfo.node, observerCfg);
		}
	}
	else {
		for (var i=0; i < contentState["upstreams"].length; i++) {
			var upstreamInfo = contentState["upstreams"][i];
			upstreamInfo.observer.disconnect();
		}

		for (var i=0; i < contentState["streams"].length; i++) {
			var streamInfo = contentState["streams"][i];

			streamInfo.observer.disconnect();
		}
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
contentState["redact_all"] = false;
contentState["redacting"] = false;
contentState["hooking_menus"] = false;
contentState["app_observer"] = null;
contentState["upstreams"] = [];  // List of {node:HTMLElement, type:string, observer:MutationObserver}
contentState["streams"] = [];    // List of {node:HTMLElement, type:string, observer:MutationObserver}
contentState["items"] = [];      // List of {node:HTMLElement, type:string, primaryUserId:string, userIds:string[]}
contentState["users"] = {};      // Dict of string ids to {count:number, evil:bool|null}



var backgroundPort = chrome.runtime.connect({"name":"content"});

backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (contentState["upstreams"].length == 0) return;  // No upstreams, ignore all messages.

		if (message.type == "reset_evilness") {
			RNE.logging.debug("Message received: "+ message.type);
			resetUsersEvilness();
			clearAllItemsRedaction(null);

			var userIds = getRegisteredUsers();
			backgroundPort.postMessage({"type":"test_users_evilness","userIds":userIds});
		}
		else if (message.type == "set_users_evilness") {
			//RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			for (key in message.value) {
				if (!message.value.hasOwnProperty(key)) continue;

				var userId = key;
				var evilness = message.value[key];
				setUserEvilness(userId, evilness);
				updateAllItemsRedaction({"userId":userId});
			}
		}
		else if (message.type == "set_redact_all") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);

			if (b != contentState["redact_all"]) {
				contentState["redact_all"] = b;

				updateAllItemsRedaction(null);
			}
		}
		else if (message.type == "set_redacting_tweetdeck") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);
			if (b && b != contentState["redacting"]) {
				// Monitor if not already doing so and redact.
				setRedacting(true);
				registerAllStreams();
				updateAllItemsRedaction(null);
			} else if (b == false) {
				// Stop monitoring and clear redaction.
				setRedacting(false);
				clearAllItemsRedaction(null);
				unregisterAllStreams();
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
