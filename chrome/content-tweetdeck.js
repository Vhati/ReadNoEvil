RNE.logging.setVerbosity(RNE.logging.Level.DEBUG);



var ItemType = {
	TWEET: "tweet",
	ACCOUNT_ACTIVITY: "account_activity"
};



/**
 * A callback for MutationObservers watching the app-columns div.
 */
function columnsMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				if (addedNode.nodeName.match(/\bsection\b/i) && addedNode.classList.contains("js-column")) {

					var columnInfo = registerColumn(addedNode);
					setColumnRedacted(columnInfo, true);
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				if (removedNode.nodeName.match(/\bsection\b/i) && removedNode.classList.contains("js-column")) {

					var columnInfo = getColumnInfo(removedNode);

					if (columnInfo != null) {
						columnInfo.observer.disconnect();
						setColumnRedacted(columnInfo, false);
						unregisterColumn(columnInfo);
					}
				}
			}
		}
	});
}

/**
 * A callback for MutationObservers watching individual columns.
 *
 * A section.js-column > div.column-holder has div.column-panel (regular stream)
 * and div.column-detail (expanded detailed tweet and replies). The latter is
 * populated when a regular tweet is clicked.
 */
function columnMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				var dredgedItems = dredgeInterestingItems(addedNode);

				for (var j=0; j < dredgedItems.length; j++) {
					var dredgedItem = dredgedItems[j];

					var itemInfo = registerItem(dredgedItem.node, dredgedItem.type);

					// Redact if a user is already known to be evil.
					if (itemInfo != null && isItemTainted(itemInfo)) {
						setItemRedacted(itemInfo, true);
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
 * @returns {string} - An ItemType constant, or null.
 */
function getItemType(node) {
	if (node.nodeName.match(/\barticle\b/i) && node.classList.contains("stream-item")) {

		// In notifications columns, div.tweet is often wrapped in span.txt-mute.

		// Regular tweet.
		var tweetEllipsisAnchor = node.querySelector(":scope > div.item-box div.tweet > div.tweet-body > footer.tweet-footer > ul.tweet-actions > li.tweet-action-item > a.tweet-action[data-user-id]");
		if (tweetEllipsisAnchor) return ItemType.TWEET;

		// Account event (e.g., someone's new follower).
		var acctActionsBtn = node.querySelector(":scope > div.item-box div.account-summary > div.with-dropdown > button.js-user-actions-menu[data-user-id]");
		if (acctActionsBtn) return ItemType.ACCOUNT_ACTIVITY;
	}

	return null;
}

/**
 * Returns info about nested elements worth registering.
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

	var nodeType = getItemType(node);
	if (nodeType != null) {
		results.push({"node":node, "type":nodeType});
		return results;
		// TODO: Decide if type precludes searching for nested items.
	}

	// Carve out candidates with selectors, then validate their structure.
	// TODO: Sort out nesting?
	var candidates = [];
	var itemDivs = node.querySelectorAll("article.stream-item");

	// Call push(), having exploded the array-like object into individual args.
	Array.prototype.push.apply(candidates, itemDivs);

	for (var i=0; i < candidates.length; i++) {
		var candidateType = getItemType(candidates[i]);
		if (candidateType != null) {
			results.push({"node":candidates[i], "type":candidateType});
		}
	}

	return results;
}



/**
 * Tries to get this script into an inert state, in case of emergency.
 */
function panic() {
	setRedacting(false);
	setAllItemsRedacted(false);
	unregisterAllColumns();
	contentState["cols_div"] = null;

	if (contentState["app_observer"]) {
		contentState["app_observer"].disconnect();
	}
}

/**
 * Resets state vars when a page loads initially or swaps out its contents.
 */
function initStateVars() {
	contentState["cols_div"] = null;
	contentState["columns"] = [];
	unregisterAllColumns();

	var colsDiv = document.querySelector("div#container");
	if (colsDiv == null) {
		RNE.logging.debug("No columns container yet");
		return;
	}
	contentState["cols_div"] = colsDiv;
}

/**
 * Initializes page-change monitoring (call only once).
 *
 * Navigation on Tweetdeck doesn't *really* leave the current page. It swaps
 * out contents. Normally scripts would overlook this, only kicking in if
 * you directly visit a url or reload the page.
 *
 * Even reloading the main page, columns aren't present initially. DOM must
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

	setStylesheet("tweetdeck-blank.css");

	initStateVars();
	if (contentState["cols_div"] != null) {
		RNE.logging.info("Tweetdeck page with columns loaded");

		backgroundPort.postMessage({type:"init_content"});
	}

	contentState["app_observer"] = new MutationObserver(function(mutations) {
		var pageChanged = false;

		mutations.forEach(function(mutation) {
			if (mutation.type === "childList") pageChanged = true;
		});

		if (pageChanged) {
			if (contentState["cols_div"] != null) {
				setAllItemsRedacted(false);
				setRedacting(false);
			}
			initStateVars();
			if (contentState["cols_div"] != null) {
				RNE.logging.info("Tweetdeck page content changed, now has columns");

				backgroundPort.postMessage({type:"init_content"});
			}
			else {
				RNE.logging.info("Tweetdeck page content changed, no columns present");
			}
		}
	});
	var appCfg = {childList:true, attributes:false, characterData:false, subtree:false};
	contentState["app_observer"].observe(appDiv, appCfg);
}



/**
 * Caches info about a column for looking up later.
 *
 * Columns which have already been registered will be ignored.
 * Registering a column one or more times will also register nested stream-items.
 *
 * @param {HTMLElement} columnNode - A section.js-column element, containing article.stream-item elements.
 * @returns {Object} - The cached info, or null.
 */
function registerColumn(columnNode) {
	//RNE.logging.debug("Column registered");

	// Enforce uniqueness.
	var columnInfo = null;
	for (var i=0; i < contentState["columns"].length; i++) {
		if (contentState["columns"][i].node === columnNode) {
			columnInfo = contentState["columns"][i];
			break;
		}
	}
	if (columnInfo == null) {
		var columnObserver = new MutationObserver(columnMutationCallback);

		columnInfo = {"node":columnNode, "observer":columnObserver};
		contentState["columns"].push(columnInfo);

		if (contentState["redacting"]) {
			var columnCfg = {childList:true, attributes:false, characterData:false, subtree:true};
			columnObserver.observe(columnNode, columnCfg);
		}
	}

	var dredgedItems = dredgeInterestingItems(columnNode);
	for (var i=0; i < dredgedItems.length; i++) {
		var dredgedItem = dredgedItems[i];

		registerItem(dredgedItem.node, dredgedItem.type);
	}

	return columnInfo;
}

/**
 * Discards cached info about a column.
 *
 * Nested stream-items will also be unregistered.
 *
 * @param {Object} columnInfo - Info which was previously cached with registerColumn().
 */
function unregisterColumn(columnInfo) {
	var index = contentState["columns"].indexOf(columnInfo);
	if (index == -1) return;

	columnInfo.observer.disconnect();

	for (var i=0; i < contentState["items"].length; i++) {
		if (columnInfo.node.contains(contentState["items"][i].node)) {
			unregisterItem(contentState["items"][i]);
		}
	}

	contentState["columns"].splice(index, 1);
}

/**
 * Returns cached info about a column, or null.
 *
 * @param {HTMLElement} node - A node, which was previously cached with registerColumn().
 * @returns {Object}
 */
function getColumnInfo(node) {
	for (var i=0; i < contentState["columns"].length; i++) {
		if (contentState["columns"][i].node === node) {
			return contentState["columns"][i];
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
 * @param {string} itemType - An ItemType constant.
 * @returns {Object} - The cached info, or null.
 */
function registerItem(node, itemType) {
	// Enforce uniqueness.
	var oldInfo = getItemInfo(node)
	if (oldInfo != null) return oldInfo;

	//RNE.logging.debug("Stream item registered");

	var userIds = getItemUsers(node, itemType);

	var itemInfo = {"node":node, "type":itemType, "userIds":userIds};
	contentState["items"].push(itemInfo);

	var newUsers = [];
	for (var i=0; i < userIds.length; i++) {
		var userId = userIds[i];
		if (userId in contentState["users"]) {
			contentState["users"][userId].count += 1;
		} else {
			contentState["users"][userId] = {"count":1, "evil":null};
			newUsers.push(userId);
		}
	}

	if (newUsers.length > 0) {
		backgroundPort.postMessage({"type":"test_evilness", "userIds":newUsers});
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

	contentState["items"].splice(index, 1);

	for (var i=0; i < userIds.length; i++) {
		var userId = userIds[i];
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
 * Returns a list of author userIds within a stream-item.
 *
 * @param {HTMLElement} node - An element, representing a known stream-item.
 * @param {string} type - An ItemType constant.
 * @returns {string[]}
 */
function getItemUsers(node, itemType) {
	userIds = [];

	if (itemType === ItemType.TWEET) {
		var origTweetDiv = node.querySelector(":scope > div.item-box div.tweet");
		if (origTweetDiv != null) {
			var origEllipsisAnchor = origTweetDiv.querySelector(":scope > div.tweet-body > footer.tweet-footer > ul.tweet-actions > li.tweet-action-item > a.tweet-action[data-user-id]");
			if (origEllipsisAnchor != null) {
				userIds.push(""+ origEllipsisAnchor.getAttribute("data-user-id"));
			}

			// Quoted tweets have no userId. :/
			//var quoteTweetDiv = origTweetDiv.querySelector("div.tweet-body > div.quoted-tweet");
		}
	}
	else if (itemType === ItemType.ACCOUNT_ACTIVITY) {
		var acctDiv = node.querySelector(":scope > div.item-box div.account-summary");
		if (acctDiv != null) {
			var acctActionsBtn = acctDiv.querySelector(":scope > div.with-dropdown > button.js-user-actions-menu[data-user-id]");
			if (acctActionsBtn != null) {
				userIds.push(""+ acctActionsBtn.getAttribute("data-user-id"));
			}
		}
	}

	return userIds;
}

/**
 * Calls setItemRedacted(itemInfo, true) on all stream-items involving a given user.
 *
 * @param {string} userId - The user.
 */
function redactUser(userId) {
	var count = 0;
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];
		if (itemInfo.userIds.indexOf(userId) != -1) {
			count++;
			setItemRedacted(itemInfo, true);
		}
	}
	//RNE.logging.debug("Redacted a user id "+ userId +" (count: "+ count +")");
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
		if (evilness) {
			//RNE.logging.debug("Found a naughty user id "+ userId);
			break;
		}
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
	if (itemInfo.type === ItemType.TWEET) {
		var methodName = (b ? "add" : "remove");
		itemInfo.node.classList[methodName]("rne-tweetdeck-tweet-redacted");
	}
	else if (itemInfo.type === ItemType.ACCOUNT_ACTIVITY) {
		var methodName = (b ? "add" : "remove");
		itemInfo.node.classList[methodName]("rne-tweetdeck-account-activity-redacted");
	}
}

/**
 * Sets or clears the redaction of all registered stream-items.
 *
 * Only the stream-items involving evil users will actually be redacted.
 *
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setAllItemsRedacted(b) {
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];

		setItemRedacted(itemInfo, (b && isItemTainted(itemInfo)));
	}
}

/**
 * Sets or clears the redaction of registered stream-items within a given column.
 *
 * Only the stream-items involving evil users will actually be redacted.
 *
 * @param {Object} columnInfo - Cached column info.
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setColumnRedacted(columnInfo, b) {
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];

		if (columnInfo.node.contains(itemInfo.node)) {
			setItemRedacted(itemInfo, (b && isItemTainted(itemInfo)));
		}
	}
}

/**
 * Registers all column and stream-item elements currently present.
 *
 * This includes the regular columns, and the preview seen when preparing to add a search.
 */
function registerAllColumns() {
	RNE.logging.debug("Registering all columns");  // TODO: Remove me.

	var columnSections = contentState["cols_div"].querySelectorAll(":scope > div.app-columns > section.js-column");
	for (var i=0; i < columnSections.length; i++) {
		registerColumn(columnSections[i]);
	}

	var searchPreviewSection = document.querySelector("div.app-search-tweet-results > section.js-column");
	if (searchPreviewSection != null) {
		registerColumn(searchPreviewSection);
	}
}

/**
 * Discards all cached column and stream-item info.
 *
 * Stream-items' redaction status will be unaffected. Call setAllItemsRedacted(false) beforehand!
 */
function unregisterAllColumns() {
	//RNE.logging.debug("Unregistering all columns");  // TODO: Remove me.

	var i = contentState["columns"].length;
	while (i--) {
		unregisterColumn(contentState["columns"][i]);
	}

	// Explicitly clear all tweet info, just to be sure.
	contentState["items"] = [];
	contentState["users"] = {};
}



/**
 * Toggles DOM monitoring to register/redact any dynamically added columns/stream-items.
 *
 * Existing stream-items' redaction status will be unaffected.
 *
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setRedacting(b) {
	contentState["redacting"] = b;

	if (b) {
		var appColsDiv = contentState["cols_div"].querySelector(":scope > div.app-columns");
		var appSearchPreviewDiv = document.querySelector("div.app-search-tweet-results");

		var colsCfg = {childList:true, attributes:false, characterData:false, subtree:false};
		contentState["cols_observer"].observe(appColsDiv, colsCfg);
		contentState["cols_observer"].observe(appSearchPreviewDiv, colsCfg);

		for (var i=0; i < contentState["columns"].length; i++) {
			var columnInfo = contentState["columns"][i];

			var columnCfg = {childList:true, attributes:false, characterData:false, subtree:false};
			columnInfo.observer.observe(columnInfo.node, columnCfg);
		}
	}
	else {
		contentState["cols_observer"].disconnect();

		for (var i=0; i < contentState["columns"].length; i++) {
			var columnInfo = contentState["columns"][i];

			columnInfo.observer.disconnect();
		}
	}
}



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
contentState["redacting"] = false;
contentState["block_list"] = null;
contentState["app_observer"] = null;
contentState["cols_observer"] = new MutationObserver(columnsMutationCallback);
contentState["cols_div"] = null;
contentState["columns"] = [];  // List of {node:element, observer:object}
contentState["items"] = [];    // List of {node:element, type:string, userIds:string[]}
contentState["users"] = {};    // Dict of string userIds to {count:number, evil:bool|null}



var backgroundPort = chrome.runtime.connect({"name":"content"});

backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (contentState["cols_div"] == null) return;  // No cols div, ignore all messages.

		if (message.type == "reset_evilness") {
			RNE.logging.debug("Message received: "+ message.type);
			resetUsersEvilness();
			setAllItemsRedacted(false);

			var userIds = getRegisteredUsers();
			backgroundPort.postMessage({"type":"test_evilness","userIds":userIds});
		}
		else if (message.type == "evilness_result") {
			//RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			for (key in message.value) {
				if (!message.value.hasOwnProperty(key)) continue;

				var userId = key;
				var evilness = message.value[key];
				setUserEvilness(userId, evilness);
				if (evilness) redactUser(userId);
			}
		}
		else if (message.type == "set_redacting_tweetdeck") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);
			if (b && b != contentState["redacting"]) {
				// Monitor if not already doing so and redact.
				setRedacting(true);
				registerAllColumns();
				setAllItemsRedacted(true);
			} else if (b == false) {
				// Stop monitoring and clear redaction.
				setRedacting(false);
				setAllItemsRedacted(false);
				unregisterAllColumns();
			}
		}
		else if (message.type == "set_redaction_style") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var name = message.value;
			var cssFiles = {"blank":"tweetdeck-blank.css", "faded":"tweetdeck-faded.css"};
			var cssFile = (cssFiles.hasOwnProperty(name) ? cssFiles[name] : cssFiles["blank"]);
			setStylesheet(cssFile);
		}
	}
);

// Content scripts are left running when the extension is reloaded/updated.
backgroundPort.onDisconnect.addListener(function() {
	RNE.logging.warning("Connection lost to background script! The page needs reloading.");

	panic();

	RNE.dialog.showMessageBox("ReadNoEvil - Error", "max-content",
		[
			"ReadNoEvil stopped running while it had a script injected here.",
			"Until this page is reloaded, it may be unstable."
		]
	);
});



backgroundPort.postMessage({type:"show_page_action"});

contentInit();
