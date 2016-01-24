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
 * A callback for MutationObservers watching streams.
 */
function streamMutationCallback(mutations) {
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



var TWEET = "tweet";

/**
 * Returns the type of a stream-item node, based on DOM structure.
 *
 * @param {HTMLElement} node - A stream-item element (tweet.div[data-user-id]).
 * @returns {string} - TWEET, or null.
 */
function getItemType(node) {
	if (node.nodeName.match(/\bdiv\b/i) && node.classList.contains("tweet") && node.hasAttribute("data-user-id")) {

		var contentDiv = node.querySelector(":scope > div.content");
		if (contentDiv != null) return TWEET;
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
	var tweetDivs = node.querySelectorAll("div.tweet");

	// Call push(), having exploded the array-like object into individual args.
	Array.prototype.push.apply(candidates, tweetDivs);

	for (var i=0; i < candidates.length; i++) {
		var candidateType = getItemType(candidates[i]);
		if (candidateType != null) {
			results.push({"node":candidates[i], "type":candidateType});
		}
	}

	return results;
}



/**
 * Resets state vars when a page loads initially or swaps out its contents.
 */
function initStateVars() {
	contentState["stream_div"] = document.querySelector("div.search-stream,div.profile-stream,div.home-stream");
	unregisterAllItems();
}

/**
 * Initializes page-change monitoring (call only once).
 *
 * Navigation on Twitter doesn't *really* leave the current page. It swaps
 * out contents. Normally scripts would overlook this, only kicking in if
 * you directly visit a search url or reload the page.
 *
 * When the page has changed, the new DOM will be examined, and any
 * clutter from past meddling will be removed.
 */
function contentInit() {
	contentLog("Content script started");

	var navDiv = document.querySelector("div#page-container");
	if (navDiv == null) {
		contentLog("No page-container div!? Aborting");
		return;
	}

	setStylesheet("vanilla-faded.css");

	initStateVars();
	if (contentState["stream_div"] != null) {
		contentLog("Twitter page with a stream loaded");

		backgroundPort.postMessage({type:"init_content"});
	}

	var navObserver = new MutationObserver(function(mutations) {
		var pageChanged = false;

		mutations.forEach(function(mutation) {
			if (mutation.type === "childList") pageChanged = true;
		});

		if (pageChanged) {
			if (contentState["stream_div"] != null) {
				// When revisiting previous pages, undo past meddling and init from scratch.
				// It seems the DOM is cloned, since testing against remembered nodes fails.
				// Spawned buttons persist but can't be reused: they lose their event listeners!?

				setAllItemsRedacted(false);
				setRedacting(false);
			}
			initStateVars();
			if (contentState["stream_div"] != null) {
				contentLog("Twitter page content changed, now has a stream");

				backgroundPort.postMessage({type:"init_content"});
			}
			else {
				contentLog("Twitter page content changed, no stream present");
			}
		}
	});
	var navCfg = {childList: true, attributes: false, characterData: false, subtree: false};
	navObserver.observe(navDiv, navCfg);
}



/**
 * Caches info about a stream-item for looking up later.
 *
 * New users will be checked for evilness.
 * Nodes which have already been registered will be ignored.
 *
 * @param {HTMLElement} node - An element representing a stream-item.
 * @param {string} itemType - One of: TWEET.
 * @returns {Object} - The cached info, or null.
 */
function registerItem(node, itemType) {
	// Enforce uniqueness.
	var oldInfo = getItemInfo(node)
	if (oldInfo != null) return oldInfo;

	//contentLog("Stream item registered");

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

	//contentLog("Stream item unregistered");

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
 * @param {string} type - One of: TWEET.
 * @returns {string[]}
 */
function getItemUsers(node, itemType) {
	userIds = [];

	if (itemType === TWEET) {
		var origTweetDiv = node;
		var userId = origTweetDiv.getAttribute("data-user-id")
		if (userId != null) userIds.push(""+ userId);

		var quoteTweetDiv = node.querySelector("div.QuoteTweet-innerContainer[data-user-id]");
		if (quoteTweetDiv != null) userIds.push(""+ quoteTweetDiv.getAttribute("data-user-id"));
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
	if (itemInfo.type === TWEET) {
		var methodName = (b ? "add" : "remove");
		itemInfo.node.classList[methodName]("rne-vanilla-tweet-redacted");
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
 * Registers all stream-item elements currently present.
 */
function registerAllItems() {
	contentLog("Registering all stream-items");  // TODO: Remove me.

	var itemsNode = contentState["stream_div"].querySelector("ol#stream-items-id");
	var dredgedItems = dredgeInterestingItems(itemsNode);

	for (var i=0; i < dredgedItems.length; i++) {
		var dredgedItem = dredgedItems[i];

		registerItem(dredgedItem.node, dredgedItem.type);
	}
}

/**
 * Discards all cached stream-item info.
 *
 * Stream-items' redaction status will be unaffected. Call setAllItemsRedacted(false) beforehand!
 */
function unregisterAllItems() {
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
		var resultsList = contentState["stream_div"].querySelector("ol#stream-items-id");

		var observerCfg = { childList: true, attributes: false, characterData: false, subtree: true }
		contentState["stream_observer"].observe(resultsList, observerCfg);
	}
	else {
		contentState["stream_observer"].disconnect();
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
contentState["stream_observer"] = new MutationObserver(streamMutationCallback);
contentState["stream_div"] = null;
contentState["items"] = [];   // List of {node:element, type:string, userIds:string[]}
contentState["users"] = {};   // Dict of string ids to {count:number, evil:bool|null}



var backgroundPort = chrome.runtime.connect({"name":"content"});

backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (contentState["stream_div"] == null) return;  // No stream, ignore all messages.

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
				registerAllItems();
				setAllItemsRedacted(true);
			} else if (b == false) {
				// Stop monitoring and clear redaction.
				setRedacting(false);
				setAllItemsRedacted(false);
				unregisterAllItems();
			}
		}
	}
);



backgroundPort.postMessage({type:"show_page_action"});

contentInit();
