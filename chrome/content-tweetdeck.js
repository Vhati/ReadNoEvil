var contentDebug = true;  // Edit this to toggle logging/alerts.



/**
 * Logs a message.
 *
 * Edit the "contentDebug" global var to toggle logging.
 *
 * Messages will appear in the active tab's console.
 */
function contentLog(message) {
	if (contentDebug) {
		console.log(message);
	}
}



/**
 * A callback for MutationObservers watching the app-columns div.
 */
function columnsMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				if (addedNode.nodeName.match(/\bsection\b/i) && hasClass(addedNode, "column")) {

					// Drill down a few levels, to the next interesting element.

					var chirpsDiv = addedNode.querySelector("div.chirp-container");
					if (chirpsDiv) {
						var columnInfo = registerColumn(chirpsDiv);

						setColumnRedacted(columnInfo, true);
					}
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				if (removedNode.nodeName.match(/\bsection\b/i) && hasClass(removedNode, "column")) {

					var chirpsDiv = removedNode.querySelector("div.chirp-container");
					if (chirpsDiv) {
						var columnInfo = getColumnInfo(chirpsDiv);

						if (columnInfo != null) {
							columnInfo.observer.disconnect();
							setColumnRedacted(columnInfo, false);
							unregisterColumn(columnInfo);
						}
					}
				}
			}
		}
	});
}

/**
 * A callback for MutationObservers watching individual columns.
 */
function chirpsMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				if (addedNode.nodeName.match(/\barticle\b/i) && hasClass(addedNode, "stream-item")) {
					var itemType = getItemType(addedNode);

					if (itemType != null) {
						var itemInfo = registerItem(addedNode, itemType);

						// Redact if a user is already known to be evil.
						if (itemInfo != null && isItemTainted(itemInfo)) {
							setItemRedacted(itemInfo, true);
						}
					}
					else {
						contentLog("Unusual stream-item discovered");  // TODO: Remove me?
						contentLog(addedNode);
					}
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				if (removedNode.nodeName.match(/\barticle\b/i) && hasClass(removedNode, "stream-item")) {
					var itemInfo = getItemInfo(removedNode);

					if (itemInfo != null) {
						setItemRedacted(itemInfo, false);
						unregisterItem(itemInfo);
					}
				}
			}
		}
	});
}



var TWEET = "tweet";
var ACCOUNT_EVENT = "account_event";

/**
 * Returns the type of a stream-item node, based on DOM structure.
 *
 * @param {HTMLElement} node - A stream-item element.
 * @returns {string} - TWEET, ACCOUNT_EVENT, or null.
 */
function getItemType(node) {
	// Regular tweet.
	var tweetEllipsisAnchor = node.querySelector("div.item-box div.tweet > div.tweet-body > footer.tweet-footer > ul.tweet-actions a.tweet-action[data-user-id]");
	if (tweetEllipsisAnchor) return TWEET;

	// Account event (e.g., someone's new follower).
	var acctActionsBtn = node.querySelector("div.item-box div.account-summary > div.with-dropdown > button.js-user-actions-menu[data-user-id]");
	if (acctActionsBtn) return ACCOUNT_EVENT;

	return null;
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
		contentLog("No columns container yet");
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
	contentLog("Tweetdeck content script started");

	var appDiv = document.querySelector("div.application");
	if (appDiv == null) {
		contentLog("No application div!? Aborting");
		return;
	}

	initStateVars();
	if (contentState["cols_div"] != null) {
		contentLog("Tweetdeck page with columns loaded");

		backgroundPort.postMessage({type:"init_content"});
	}

	var appObserver = new MutationObserver(function(mutations) {
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
				contentLog("Tweetdeck page content changed, now has columns");

				backgroundPort.postMessage({type:"init_content"});
			}
			else {
				contentLog("Tweetdeck page content changed, no columns present");
			}
		}
	});
	var appCfg = {childList: true, attributes: false, characterData: false, subtree: false};
	appObserver.observe(appDiv, appCfg);
}



/**
 * Caches info about a column for looking up later.
 *
 * Columns which have already been registered will be ignored.
 * Registering a column one or more times will also register nested stream-items.
 *
 * @param {HTMLElement} columnNode - A div.chirp-container element, containing article.stream-item elements.
 * @returns {Object} - The cached info, or null.
 */
function registerColumn(columnNode) {
	contentLog("Column registered");  // TODO: Remove me.

	// Enforce uniqueness.
	var columnInfo = null;
	for (var i=0; i < contentState["columns"].length; i++) {
		if (contentState["columns"][i].node === columnNode) {
			columnInfo = contentState["columns"][i];
			break;
		}
	}
	if (columnInfo == null) {
		var chirpsObserver = new MutationObserver(chirpsMutationCallback);

		columnInfo = {"node":columnNode, "observer":chirpsObserver};
		contentState["columns"].push(columnInfo);

		if (contentState["redacting"]) {
			var chirpsCfg = {childList: true, attributes: false, characterData: false, subtree: false};
			chirpsObserver.observe(columnNode, chirpsCfg);
		}
	}

	var itemNodes = columnNode.querySelectorAll("article.stream-item")
	for (var i=0; i < itemNodes.length; i++) {
		var itemType = getItemType(itemNodes[i]);

		if (itemType != null) {
			registerItem(itemNodes[i], itemType);
		} else {
			contentLog("Unusual stream-item discovered");  // TODO: Remove me?
			contentLog(itemNodes[i]);
		}
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
 * @param {string} itemType - One of: TWEET or ACCOUNT_EVENT.
 * @returns {Object} - The cached info, or null.
 */
function registerItem(node, itemType) {
	// Enforce uniqueness.
	var oldInfo = getItemInfo(node)
	if (oldInfo != null) return oldInfo;

	contentLog("Stream item registered");  // TODO: Remove me.

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
 * @param {string} type - One of: TWEET or ACCOUNT_EVENT.
 * @returns {string[]}
 */
function getItemUsers(node, itemType) {
	userIds = [];

	if (itemType === TWEET) {
		var origTweetDiv = node.querySelector("div.item-box div.tweet");
		if (origTweetDiv != null) {
			var origEllipsisAnchor = origTweetDiv.querySelector("div.tweet-body > footer.tweet-footer > ul.tweet-actions a.tweet-action[data-user-id]");
			if (origEllipsisAnchor != null) {
				userIds.push(""+ origEllipsisAnchor.getAttribute("data-user-id"));
			}

			// Quoted tweets have no userId. :/
			//var quoteTweetDiv = origTweetDiv.querySelector("div.tweet-body > div.quoted-tweet");
		}
	}
	else if (itemType === ACCOUNT_EVENT) {
		var acctDiv = node.querySelector("div.item-box div.account-summary");
		if (acctDiv != null) {
			var acctActionsBtn = acctDiv.querySelector("div.with-dropdown > button.js-user-actions-menu[data-user-id]");
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
	//contentLog("Redacted a user id "+ userId +" (count: "+ count +")");
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
			//contentLog("Found a naughty user id "+ userId);
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
	// TODO: Abort if b is true but node was already redacted.
	var succeeded = false;

	if (itemInfo.type === TWEET) {
		var origTweetDiv = itemInfo.node.querySelector("div.item-box div.tweet");
		if (origTweetDiv != null) {
			var bodyDiv = origTweetDiv.querySelector("div.tweet-body");
			if (bodyDiv != null) {
				bodyDiv.style.opacity = (b ? 0.15 : 1.0);
				succeeded = true;
			}
		}
	}
	else if (itemInfo.type === ACCOUNT_EVENT) {
		var acctDiv = itemInfo.node.querySelector("div.item-box div.account-summary");
		if (acctDiv != null) {
			var acctTextDiv = acctDiv.querySelector("div.account-summary-text");
			if (acctTextDiv != null) {
				acctTextDiv.style.opacity = (b ? 0.15 : 1.0);
				succeeded = true;
			}
		}
	}
	if (!succeeded) {
		contentLog("Unable to set redaction on unusual stream-item");
		contentLog(itemInfo.node);
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
 */
function registerAllColumns() {
	contentLog("Registering all columns");  // TODO: Remove me.

	var columnSections = contentState["cols_div"].querySelectorAll("div.app-columns > section.column");
	for (var i=0; i < columnSections.length; i++) {
		var chirpsDiv = columnSections[i].querySelector("div.chirp-container");

		if (chirpsDiv != null) {
			registerColumn(chirpsDiv);
		}
	}
}

/**
 * Discards all cached column and stream-item info.
 *
 * Stream-items' redaction status will be unaffected. Call setAllItemsRedacted(false) beforehand!
 */
function unregisterAllColumns() {
	//contentLog("Unregistering all columns");  // TODO: Remove me.

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
		var appColsDiv = contentState["cols_div"].querySelector("div.app-columns");

		var colsCfg = {childList: true, attributes: false, characterData: false, subtree: false};
		contentState["cols_observer"].observe(appColsDiv, colsCfg);

		for (var i=0; i < contentState["columns"].length; i++) {
			var columnInfo = contentState["columns"][i];

			var chirpsCfg = {childList: true, attributes: false, characterData: false, subtree: false};
			columnInfo.observer.observe(columnInfo.node, chirpsCfg);
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



/**
 * Returns true if a node has a particular CSS class.
 *
 * @param {HTMLElement} node
 * @param {String} needle
 * @returns {Boolean}
 */
function hasClass(node, needle) {
	var c;
	if (node && node.className && typeof needle === "string") {
		c = node.getAttribute("class");
		c = " "+ c + " ";
		return (c.indexOf(" "+ needle +" ") > -1);
	} else {
		return false;
	}
}



var contentState = {};
contentState["redacting"] = false;
contentState["block_list"] = null;
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
			contentLog("Message received: "+ message.type);
			resetUsersEvilness();
			setAllItemsRedacted(false);

			var userIds = getRegisteredUsers();
			backgroundPort.postMessage({"type":"test_evilness","userIds":userIds});
		}
		else if (message.type == "evilness_result") {
			//contentLog("Message received: "+ message.type +", "+ message.value);
			for (key in message.value) {
				if (!message.value.hasOwnProperty(key)) continue;

				var userId = key;
				var evilness = message.value[key];
				setUserEvilness(userId, evilness);
				if (evilness) redactUser(userId);
			}
		}
		else if (message.type == "set_redacting") {
			contentLog("Message received: "+ message.type +", "+ message.value);
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
	}
);



backgroundPort.postMessage({type:"show_page_action"});

contentInit();
